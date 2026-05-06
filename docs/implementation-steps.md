# 複数作業対応 — 実装ステップ（最終版）

ブランチ: `feat/multi-task-support`
作成日: 2026-03-27
関連ドキュメント:
- `docs/plan-multi-task-support.md` — 設計プラン（8回チェック済み）
- `docs/gas-change-spec.md` — GAS変更仕様書（4回チェック済み）
- `docs/investigation-job-input-system.md` — 現行システム調査記録

---

## 実装順序と各ステップの詳細

### Step 1: 型定義 (`src/types.ts`)

**変更量:** 小（5行追加）
**自信度:** 99%

1. `TaskEntry` インターフェースを新規追加（L4付近、KintaiDataの前）
2. `KintaiData` (L5-12) に `tasks?: TaskEntry[]` 追加
3. `KintaiFormState` (L16-27) に `tasks?: TaskEntry[]` 追加
4. `ValidationErrors` (L43-50) に `tasks?: string` 追加
5. `KintaiRecord` (L71-80) に `tasks?: TaskEntry[]` 追加

**検証:** `npx tsc --noEmit` でコンパイルエラーがないこと

---

### Step 2: GAS (`GAS/kintai.gs`)

**変更量:** 中（7箇所、約40行変更）
**自信度:** 97%
**詳細仕様:** `docs/gas-change-spec.md` 参照

変更箇所:
- G1: L21 JSDoc追記（tasks プロパティ）
- G2: L76 JSDoc追記（tasks プロパティ）
- G3: L132 payload destructuringに `tasks` 追加
- G4: L134-138 isDelete判定に `hasTasks` 追加
- G5: L252-269 書き込みロジック完全置換（C~E setValues + F setFormula + G setValue）
- G6: L611 lastCol = 7 固定化
- G7: L676後 G列JSONパース挿入 + L678-686 result.push変更

**検証:**
- GASエディタにコピーして構文エラーがないこと
- テスト用スプレッドシートで保存→F列に数式が入ること
- テスト用スプレッドシートで旧データ（文字列）が読めること

**注意:** GASはGitから自動デプロイされない。手動でApps Scriptエディタにコピー&デプロイが必要。

---

### Step 3: apiService.ts (`src/utils/apiService.ts`)

**変更量:** 小（4箇所、各1行追加）
**自信度:** 95%

1. L282後: saveKintaiToServerのcallGASペイロードに `tasks: data.tasks || [],` 追加
2. L429-435: getMonthlyDataのnormalized mapに `tasks: rec.tasks || [],` 追加
3. L647-654: getKintaiDataByDateの戻り値に `tasks: record.tasks || [],` 追加
4. L680-687: getKintaiDataFromMonthlyDataの戻り値に `tasks: record.tasks || [],` 追加

**検証:** `npx tsc --noEmit`

---

### Step 4: KintaiForm.tsx (`src/components/KintaiForm.tsx`)

**変更量:** 大（15箇所以上、最もリスクが高い）
**自信度:** 70%（要段階的検証）

#### 4a: import追加
- L24: `TaskEntry` をimportに追加

#### 4b: state変更
- L201: `const [location, setLocation]` → `const [tasks, setTasks] = useState<TaskEntry[]>([])`

#### 4c: 日付変更時リセット (L313-320のstartTransition内)
- L317: `setLocation(initialState.location)` → `setTasks([])`

#### 4d: データ復元 (L341-344)
- `setLocation(...)` → tasks復元ロジック

#### 4e: validateForm全5箇所
- L454-460, L469-475, L484-490: 各handleXxxChange内の引数に `tasks` 追加
- L493-506: handleLocationChange → 4つのtask操作ハンドラに置換
- L509-526: validateForm内のlocationチェック → tasksチェック

#### 4f: handleSubmit (L532-538)
- formDataに `tasks, location: tasks.map(t => t.job).join(', ')` 追加

#### 4g: 保存成功後の復元 (L576-579)
- `setLocation(...)` → `setTasks(refreshed?.tasks || [])`

#### 4h: 削除処理 (L628-633)
- formDataに `tasks: [], location: ""` 追加
- 削除後 `setTasks([])`

#### 4i: JSX (L847-880)
- 単一select → 複数作業行UI（task-row × N + 追加ボタン + 合計表示）
- errors.location → errors.tasks

#### 4j: 削除モーダル文言 (L1023-1024)
- 「勤務場所」→「作業内容」

**検証:**
- `npx tsc --noEmit`
- `npm run dev` でブラウザ表示確認
- 新規入力 → 作業追加 → 保存 → 日付変更 → 戻って復元確認
- 編集 → キャンセル → 元データに戻ること
- 削除 → 全クリア確認

---

### Step 5: MonthlyView.tsx (`src/components/MonthlyView.tsx`)

**変更量:** 小（2箇所）
**自信度:** 95%

1. L425: ヘッダー「勤務場所 / Location」→「作業内容 / Tasks」
2. L457: `record.location || "-"` → tasks表示ロジック

**検証:** 月次一覧画面で複数作業が表示されること

---

### Step 5.5: KintaiContext.tsx (`src/contexts/KintaiContext.tsx`)

**変更量:** 極小（1行追加）
**自信度:** 99%

1. L107後: initializeEntryStatusCacheの変換mapに `tasks: record.tasks || [],` 追加

**検証:** `npx tsc --noEmit`

---

### Step 6: CSS (`src/styles.css`)

**変更量:** 中（約60行追加）
**自信度:** 90%

新規CSSクラス:
- `.task-section` — セクション全体
- `.task-row` — 各作業行（flex横並び）
- `.task-job-select` — 作業名ドロップダウン
- `.task-hours-input` — 時間入力
- `.task-hours-unit` — 「h」ラベル
- `.task-remove-btn` — 削除ボタン
- `.task-add-btn` — 追加ボタン
- `.task-summary` — 合計表示

**検証:** モバイル(375px)とPC両方で表示確認

---

### Step 7: テスト

全検証項目（`docs/plan-multi-task-support.md` の検証定義参照）:

1. 保存テスト: 2件の作業で保存 → G列にJSON
2. F列テスト: 数式が正しく入ること
3. 読み込みテスト: 保存データがUIに復元
4. 旧データ互換テスト: 旧文字列 → tasks配列変換
5. 月次一覧テスト: 複数作業の表示
6. 削除テスト: 全クリア + F列温存
7. disabled制御テスト
8. キャンセルテスト
9. 日付変更テスト

---

## リスク対策

| リスク | 対策 |
|--------|------|
| setFormulaが動かない | try/catchで吸収。C~E+Gは保存済み。F列既存数式温存 |
| KintaiFormのstate競合 | Step 4を段階的に実装。4b→4cの順で動作確認 |
| GASデプロイ忘れ | Step 2完了後に即デプロイ。フロントより先にGASを更新 |
| 旧データ破壊 | G列読み込みは全パターンフォールバック付き |

---

## デプロイ順序

1. **GASを先にデプロイ**（旧クライアントとも互換性あり）
2. フロントをNetlifyにデプロイ
