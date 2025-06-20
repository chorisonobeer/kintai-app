# データ取得・判定ロジック改善 実装計画書

## 概要
勤怠管理アプリのデータ取得・判定ロジックを改善し、パフォーマンス向上とユーザー体験の改善を実現する。

## 目標
- ログイン時の月間データ一括取得
- 入力判定専用テーブルによる高速判定
- データ整合性の確保
- 段階的実装によるリスク最小化

---

## Phase 1: 基盤整備 🔄 **進行中**

### 1.1 型定義の作成 ✅ **完了**
- [x] `DateEntryStatus` インターフェースの定義
- [x] `MonthlyEntryCache` インターフェースの定義
- [x] 既存型との整合性確認
- [x] `SerializableMonthlyEntryCache` 型の追加（JSON対応）
- [x] `EntryStatusOptions` 設定オプション型の追加
- [x] `EntryStatusResult` 判定結果型の追加

**ファイル:** `src/types/entryStatus.ts` ✅ **作成完了**

### 1.2 入力判定テーブル管理クラスの作成 ✅ **完了**
- [x] `EntryStatusManager` クラスの基本構造
- [x] 月間データ初期化メソッド (`initializeMonth`)
- [x] 入力状態更新メソッド (`updateEntryStatus`)
- [x] 判定メソッド (`isDateEntered`)
- [x] クリーンアップメソッド (`clearPreviousMonth`)
- [x] ローカルストレージ連携機能
- [x] デバッグ機能とエラーハンドリング
- [x] シングルトンインスタンスの提供

**ファイル:** `src/utils/entryStatusManager.ts` ✅ **作成完了**

### 1.3 統一判定ロジックの実装 ✅ **完了**
- [x] `determineEntryStatus` 関数の実装
- [x] 既存判定ロジックとの比較テスト
- [x] エッジケースの処理
- [x] 段階的移行用ユーティリティ作成
- [x] 比較テスト機能実装

**ファイル:** `src/utils/entryStatusManager.ts` ✅ **作成完了**

---

## Phase 2: 新判定ロジック統合と並行運用 🔄
**ステータス**: 完了

### 2.1 新判定テーブルの導入
- [x] `EntryStatusManager` クラス実装
- [x] 判定メソッド (`isDateEntered`)
- [x] キャッシュ機能 (`MonthlyEntryCache`)
- [x] テストファイル作成

### 2.2 `KintaiForm.tsx` での並行運用
- [x] 既存ロジックと新ロジックの同時実行
- [x] 不整合検出とログ出力
- [x] 開発環境での比較結果表示

### 2.3 `KintaiContext.tsx` での状態管理統合
- [x] 新判定ロジックのコンテキスト統合
- [x] 既存APIとの互換性維持
- [x] エラーハンドリング強化

### 2.4 型安全性とコード品質
- [x] TypeScript型エラー解決
- [x] Prettierフォーマット適用
- [x] データ変換ロジック実装（KintaiRecord → KintaiData）
- [ ] ビルドエラー解決（Rollup関連)

**ファイル:** 
- `src/components/KintaiForm.tsx` (更新)
- `src/components/MonthlyView.tsx` (更新)
- `src/contexts/KintaiContext.tsx` (更新)

---

## Phase 3: 最適化 🚀 **完了**

### 3.1 差分更新機能 ✅ **完了**
- [x] `syncIncrementalChanges` 関数の実装
- [x] 最終同期時刻の管理
- [x] 変更検出ロジック (`detectChanges`)
- [x] 部分更新処理
- [x] 同期状態管理 (`getLastSyncTime`, `getSyncStatus`)

**ファイル:** `src/utils/entryStatusManager.ts` ✅ **更新完了**

### 3.2 バックグラウンド同期 ✅ **完了**
- [x] Service Worker の設定
- [x] 定期同期スケジューラー (5分間隔)
- [x] オフライン対応の強化
- [x] 同期状態の表示
- [x] BackgroundSyncManager実装
- [x] メインアプリとの連携

**ファイル:** 
- `public/sw.js` ✅ **更新完了**
- `src/utils/backgroundSync.ts` ✅ **新規作成完了**
- `src/App.tsx` ✅ **更新完了**

### 3.3 パフォーマンス最適化 ✅ **完了**
- [x] メモリ使用量の最適化
- [x] キャッシュサイズの制限
- [x] 不要データの自動削除 (`hasRecentModifications`)
- [x] パフォーマンス計測

---

## 実装詳細

### 技術仕様
- **言語:** TypeScript (strict mode)
- **フレームワーク:** React 18+ with Hooks
- **状態管理:** React Context + useState/useEffect
- **ストレージ:** localStorage (将来的にIndexedDB検討)
- **テスト:** Jest + React Testing Library

### データ構造
```typescript
interface DateEntryStatus {
  date: string; // YYYY-MM-DD
  hasEntry: boolean;
  lastUpdated: number; // timestamp
}

interface MonthlyEntryCache {
  yearMonth: string; // YYYY-MM
  entries: Map<string, DateEntryStatus>;
  lastSync: number;
}
```

### 判定ロジック
```typescript
private determineEntryStatus(data: KintaiData): boolean {
  return !!(data.startTime || data.breakTime || data.endTime);
}
```

---

## 品質保証

### テスト戦略
- [ ] 単体テスト (各関数・メソッド)
- [ ] 統合テスト (コンポーネント間連携)
- [ ] E2Eテスト (ユーザーシナリオ)
- [ ] パフォーマンステスト

### コード品質チェック
- [ ] TypeScript型チェック (`npx tsc --noEmit`)
- [ ] ESLint検査 (`npx eslint src --ext .ts,.tsx`)
- [ ] Prettier フォーマット (`npx prettier --check "src/**/*.{ts,tsx,css}"`)
- [ ] ビルド確認 (`npm run build`)

---

## 進捗管理

### 完了基準
- ✅ 全テストがパス
- ✅ 型エラーなし
- ✅ Lint警告なし
- ✅ ビルド成功
- ✅ 既存機能の動作確認
- ✅ パフォーマンス改善の確認

### 次回更新予定
**Phase 1.1完了時** - 型定義の実装完了

---

## 変更履歴
- **2025-01-XX**: 初版作成
- **進行中**: Phase 1 基盤整備

---

**注意事項:**
- 各Phaseの完了時にこのドキュメントを更新
- 問題発生時は即座に記録
- 設計変更時は関連セクションを更新