# 安定性監査レポート（2025-11-07）

本レポートは、コードベース全体を対象に「無駄な呼び出し」「重複した初期化」「安定動作を阻害する可能性のある挙動」を俯瞰し、改善提案までをまとめたものです。今回はコード変更は行わず、観察結果と是正プランを提示します。

## 実施範囲と方法
- 対象範囲: `src/` 全体、`public/sw.js`、`index.html`、関連ドキュメント
- 手法: コード検索（複数キーワード）、主要ファイルの精読、既存ドキュメントとの突合
- 重点観点: 月次データ取得・日付変更・Service Worker 登録・バックグラウンド同期・StrictMode の副作用

## サマリー（結論）
- 重大（修正推奨）
  - `Service Worker` の二重登録（`index.html` と `App.tsx`）
  - `KintaiForm` の月跨ぎ（cross-month）時の「入力済み判定→データロード」の順序不整合
- 中程度（改善推奨）
  - ログアウト時のバックグラウンド同期停止の未通知（タイマ持続の可能性）
  - `StrictMode` による `useEffect` 二重実行へのガード強化（現状多くは対策済みだが確認継続）
- 軽微（情報共有）
  - ドキュメント間の編集可能期間表記ゆれ（7日 vs 20日）

## 詳細指摘と根拠

### 1) Service Worker の二重登録
- 場所: `index.html` と `src/App.tsx`
- 根拠:
  - `index.html` にて `window.load` で `navigator.serviceWorker.register('/sw.js')` 実行
  - `App.tsx` でも `initializeServiceWorker()` 内で同登録を実行
- 影響:
  - 実害は小さい（既登録なら既存 `registration` が返却される）が、設計上の重複は保守性・理解容易性を損なう
  - 登録責務が分散することで将来的なイベントリスナー管理の重複・見落としに繋がる可能性
- 推奨:
  - 登録責務を `App.tsx` 側に一元化し、`index.html` の登録スクリプトを削除

### 2) KintaiForm の月跨ぎ時の入力済み判定順序
- 場所: `src/components/KintaiForm.tsx`（`deferredDate` 監視の `useEffect`）
- 根拠:
  - 現在のロジックは「`entered = comparison.legacy`（既存 `monthlyData` 参照）→ 月跨ぎ検知で `fetchMonthlyData(targetYear, targetMonth)` → `entered` が真のときのみ `getKintaiDataByDateApi` 実行」
  - 月跨ぎ直後は比較に用いる `monthlyData` が「現在の年月」のままで、`entered` が偽扱いとなり日付データロードをスキップする可能性
  - `useEffect` の依存配列が `deferredDate` のみのため、`monthlyData` 更新後も再計算されず、クロス月の既存入力が読み込まれないケースが起こり得る
- 影響:
  - クロス月移動で「実際は入力済みなのに未入力扱いでフォームが初期状態のまま」になる可能性（再現条件: 対象月のデータ未ロードのまま判定が走る）
- 推奨:
  - 判定順序の是正: 「対象月の取得→入力済み判定→日付データロード」へ整理
  - もしくは `entered` に依存せず「対象日データの API 取得を試みて存在すればロード」という単純化（最小構成・根本解決）

### 3) ログアウト時のバックグラウンド同期停止未通知
- 場所: `src/App.tsx`（`handleLogout`）と `public/sw.js`
- 根拠:
  - `initializeBackgroundSync` は認証済み時のみ実行され、`REGISTER_SYNC` を Service Worker へ通知 → SW 側 `schedulePeriodicSync()` が `setTimeout` 再帰で常時作動
  - ログアウト時に `UNREGISTER_SYNC` を SW に通知しておらず、タイマを停止しない設計
- 影響:
  - ログアウト後も SW が定期同期要求メッセージを送る可能性（軽微だが無駄）
- 推奨:
  - `handleLogout` 内で `UNREGISTER_SYNC` を SW に `postMessage` して定期同期停止

### 4) StrictMode による `useEffect` 二重実行の継続的監視
- 場所: `src/main.tsx`（`<React.StrictMode>`）、各種 `useEffect`
- 根拠:
  - 開発モードでは `useEffect` が意図どおり 2 度呼ばれるケースがある
  - `KintaiContext` は `lastFetchKey` や `isDataLoading` で重複フェッチ抑制済み
  - `KintaiForm` は `prevDateRef/isDirtyRef/isEditing` でガードしているが、ステート初期化と実データロードの順序が複雑
- 影響:
  - 開発時に限り、初期化が二重に走る/ログが過剰になるなどの副作用が出る可能性
- 推奨:
  - `useEffect` 内の副作用は「冪等（idempotent）」を意識して整理し、判定順序の簡素化（前項と重複）

### 5) ドキュメントの編集可能期間表記ゆれ
- 場所: `docs/`（例: `DATA_MANAGEMENT.md` は 20日、他ドキュメントでは 7日表記の箇所）
- 根拠:
  - 実装は `EDITABLE_DAYS = 20`（`src/utils/dateUtils.ts`）
- 影響:
  - 仕様の混乱を招く可能性
- 推奨:
  - 仕様値を 20 日に統一して明記（ドキュメント修正のみ）

## 是正プラン（最小構成・根本解決）
以下は「最小差分で効果が高い」順に列挙します。今回は実装は行わず、プラン提示までです。

1. Service Worker 登録の一元化（重要度: 高）
   - 変更: `index.html` の SW 登録スクリプトを削除し、`App.tsx` の登録のみを採用
   - 検証: 開発サーバー起動 → 登録成功ログ確認 → バージョンチェックメッセージ 1 回のみ受信を確認

2. KintaiForm の月跨ぎ判定順序の是正（重要度: 高）
   - 変更案A: 「対象月データ取得 → `isDateEnteredNew`（`entryStatusManager`）で判定 → `getKintaiDataByDateApi` 取得 → 反映」へ一本化
   - 変更案B: `entered` に依存せず、日付データを API で直接取得して存在時のみロード（単純で堅い）
   - 検証: 
     - 今月/先月/翌月へ日付ジャンプし、保存済み日の自動ロード/未入力日の初期化を確認
     - `StrictMode` でも副作用が二重にならない（視覚上の挙動変化なし）ことを確認

3. ログアウト時の同期停止通知（重要度: 中）
   - 変更: `handleLogout` 内で `swRegistrationRef.current?.active?.postMessage({ type: 'UNREGISTER_SYNC' })` を送信
   - 検証: ログアウト後に SW 側の定期同期タイマが解除されるログを確認

4. ドキュメント整備（重要度: 低）
   - 変更: 編集可能期間の仕様値（20 日）を docs 全体で統一
   - 検証: 参照ドキュメントの不一致解消を確認

## リスク評価と優先度
- 優先度 1（すぐやる）: 1), 2)
- 優先度 2（次にやる）: 3)
- 優先度 3（余裕があれば）: 4)

## チェックリスト（次回実装時の検証観点）
- TypeScript 型チェック: `npx tsc --noEmit` にてエラーゼロ
- Prettier: `npx prettier --check "src/**/*.{ts,tsx,css}"` を全通過
- Vite ビルド: `npm run build` 正常完了
- UI:
  - 月跨ぎの日付選択時に保存済みデータが正しくロードされる
  - 未入力日の初期化と編集モード切替が安定
  - バージョン更新時の UI メッセージ重複なし
- SW/同期:
  - 登録は一箇所のみ、ログアウトで同期停止通知が届く

## 次アクション（ご指示待ち）
- 上記 1)〜4) の改善案について、どれから着手するかご指定ください（推奨: 1) と 2) を先に）。
- 指示をいただき次第、最小差分での修正を実施し、型/フォーマット/ビルド/プレビュー検証まで行います。

---
最終更新: 2025-11-07