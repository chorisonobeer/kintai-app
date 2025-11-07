# モバイルで「Checking for new version...」が進まない問題の修正報告（2025-11-07）

## 事象
- スマートフォンで起動時に `Checking for new version...` のローディング画面から進まない（> 1 分）。

## 原因分析
- 主因: 起動直後に `registration.active?.postMessage({ type: 'CHECK_FOR_UPDATES' })` を送信していたが、`ServiceWorkerRegistration.active` が未確立のケース（PWA起動・初回制御移行前）でメッセージが送信されず、モーダルを閉じられなかった。
- 副因:
  - `SW` 側 `REGISTER_SYNC` ハンドラで `navigator`/`window` を参照しており、SWコンテキストで未定義なため互換性に難あり（直接的なフリーズ原因ではないが、SWメッセージ処理の安定性を損ねる可能性）。

## 対策（最小差分・根本解決）
- App側:
  - `navigator.serviceWorker.ready` を待機して、**Service Worker が制御状態になってから** `CHECK_FOR_UPDATES` を送信。
  - バージョンチェックモーダルに **10 秒のタイムアウト** を導入し、応答がない場合は自動クローズ。
- SW側:
  - `REGISTER_SYNC` 分岐の互換修正（`self.registration.sync?.register` を使用）。未対応環境では定期スケジューラのみにフォールバック。

## 変更ファイル
- `src/App.tsx`
  - ヘッダ更新（変更概要反映）
  - SW準備待ち (`navigator.serviceWorker.ready`) → `CHECK_FOR_UPDATES` 送信
  - バージョンモーダルの 10 秒タイムアウト導入と応答時の解除
- `public/sw.js`
  - `REGISTER_SYNC` 内の環境チェックを SWコンテキストに合わせて修正
  - 未対応時は `schedulePeriodicSync()` のみ起動
- `index.html`
  - SW登録スクリプト削除（登録責務の一元化：`App.tsx`）

## 検証結果
- TypeScriptチェック: `npx tsc --noEmit` OK
- Prettierチェック: `npx prettier --check "src/**/*.{ts,tsx,css}"` OK
- ビルド: `npm run build` OK
- UIプレビュー: 開発サーバー起動・プレビューで起動後 10 秒以内にモーダルが閉じることを確認。SW準備完了後は `VERSION_CHECK_RESULT` 受信で即時クローズ。

## 補足
- ブラウザコンソールに `version.json` へのフェッチが中断されるログが出る場合があります（タブ可視性変更時のフォールバックフェッチ）。動作に影響はありません。
- ログアウト時の `UNREGISTER_SYNC` 送信は別改善提案の対象です（軽微）。

## チェックリスト（完了）
- [x] 原因の主因/副因の切り分け
- [x] 最小差分の実装（Appの待機＆タイムアウト、SW互換修正）
- [x] TypeScript/Prettier/ビルド/プレビュー検証
- [x] ドキュメント更新（本ファイル）

最終更新: 2025-11-07