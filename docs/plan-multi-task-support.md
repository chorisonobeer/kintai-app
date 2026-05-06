# 複数作業対応 実装計画

## Context

現在の勤怠入力は1日1作業（G列に文字列1つ）しか入力できない。複数作業対応が必要。
G列にJSON形式で複数作業を保存する。F列の数式はsetFormula()で個別設定する。

## 変更対象ファイル（全24箇所の変更を含む）

| ファイル | 変更内容 |
|---------|---------|
| `src/types.ts` | TaskEntry型追加、KintaiData/KintaiRecord/KintaiFormState/ValidationErrorsにtasks追加 (4箇所) |
| `GAS/kintai.gs` | saveKintai: C~E+F+G書き込み。getMonthlyData: G列JSONパース+旧形式互換。lastCol=7固定化 |
| `src/utils/apiService.ts` | saveKintaiToServer/getKintaiDataByDate/getKintaiDataFromMonthlyData にtasks追加 (4箇所) |
| `src/components/KintaiForm.tsx` | location→tasks全置換 (13箇所): state, 初期化, ハンドラ, バリデーション, 復元, JSX |
| `src/components/MonthlyView.tsx` | 複数作業の表示 (2箇所) |
| `src/contexts/KintaiContext.tsx` | initializeEntryStatusCache のlocation→tasks (1箇所) |
| `src/styles.css` | task-row等のCSS追加 |

---

## Step 1: 型定義 (`src/types.ts`)

```typescript
// 新規追加
export interface TaskEntry {
  job: string;    // 作業名（例: "草刈り"）
  hours: number;  // 作業時間（小数可、例: 2.5）
}
```

- L5-12 `KintaiData` に `tasks?: TaskEntry[]` 追加（L10 locationは互換のため残す）
- L16-27 `KintaiFormState` に `tasks?: TaskEntry[]` 追加（L21 locationは残す）
- L43-50 `ValidationErrors` に `tasks?: string` 追加（L48 locationは残す）
- L71-80 `KintaiRecord` に `tasks?: TaskEntry[]` 追加（L79 locationは残す）

---

## Step 2: GAS (`GAS/kintai.gs`)

**詳細仕様書: `docs/gas-change-spec.md` を参照。**
以下は概要。全7箇所の変更。

### G1-G2: JSDoc追記 (L21, L76)
- KintaiPayloadに `tasks` プロパティ追加
- KintaiRecordに `tasks` プロパティ追加

### G3: payload destructuring (L132)
```javascript
const { date, startTime, breakTime, endTime, spreadsheetId, userId, location, tasks } = payload;
```

### G4: isDelete判定 (L134-138)
```javascript
const hasTasks = Array.isArray(tasks) && tasks.length > 0;
const isDelete = (!startTime && !endTime && (!location || String(location).trim() === '') && !hasTasks);
```

### G5: 書き込みロジック (L252-269を完全置換)

**重要: setValues()は数式をリテラル文字列として保存する。F列はsetFormula()で個別設定。**
**setFormulaが万が一失敗しても、try/catchで吸収。C~E+Gは保存済みなので既存機能は壊れない。**

```javascript
      // G列に書き込むJSON値を生成
      let gValue = '';
      if (!isDelete) {
        if (hasTasks) {
          gValue = JSON.stringify(tasks);
        } else if (location && String(location).trim() !== '') {
          gValue = JSON.stringify([{ job: String(location).trim(), hours: 0 }]);
        }
      }

      if (isDelete) {
        // 削除時: C~E列とG列を空にする。F列の既存数式は温存
        sheet.getRange(rowIndex, 3, 1, 3).setValues([['', '', '']]);
        sheet.getRange(rowIndex, 7, 1, 1).setValue('');
      } else {
        // (1) C~E列
        sheet.getRange(rowIndex, 3, 1, 3).setValues([
          [startTime, formatBreakTime(breakTime), endTime]
        ]);
        // (2) F列: 数式（失敗しても吸収）
        try {
          const fFormula = '=IF(E' + rowIndex + '<C' + rowIndex
            + ',(E' + rowIndex + '+1)-C' + rowIndex + '-D' + rowIndex
            + ',E' + rowIndex + '-C' + rowIndex + '-D' + rowIndex + ')';
          sheet.getRange(rowIndex, 6, 1, 1).setFormula(fFormula);
        } catch (formulaErr) {
          diagInfo.formulaError = String(formulaErr);
        }
        // (3) G列: JSON
        sheet.getRange(rowIndex, 7, 1, 1).setValue(gValue);
      }
```

書き込み回数: 通常保存3回(現状2回)、削除2回(現状同じ)。+1回≒200-500ms増。

### G6: lastCol固定化 (L611)
```javascript
const lastCol = 7;
```

### G7: G列JSONパース + result.pushにtasks追加 (L647-686)
```javascript
      const locationVal = row[6];

      // G列のJSONパース（後方互換対応）
      let parsedTasks = [];
      let locationCompat = '';
      const gRaw = String(locationVal || '').trim();
      if (gRaw.startsWith('[')) {
        try {
          parsedTasks = JSON.parse(gRaw);
          locationCompat = parsedTasks.map(function(t) { return t.job; }).join(', ');
        } catch (jsonErr) {
          locationCompat = gRaw;
          parsedTasks = [{ job: gRaw, hours: 0 }];
        }
      } else if (gRaw !== '') {
        locationCompat = gRaw;
        parsedTasks = [{ job: gRaw, hours: 0 }];
      }

      // result.push (L678-686) を変更
      result.push({
        date: dateStr, month: monthNum,
        startTime: String(startTimeVal || ''),
        breakTime: String(breakTimeVal || ''),
        endTime: String(endTimeVal || ''),
        workingTime: String(workingTimeVal || ''),
        location: locationCompat,
        tasks: parsedTasks
      });
```

---

## Step 3: apiService.ts

### saveKintaiToServer (L275-286のcallGASペイロード)
```javascript
// L282の後に追加
location: data.location || "",
tasks: data.tasks || [],    // 追加
```

### getMonthlyData 正規化 (L428-435)
```typescript
// L429-435: raw.map内で tasks を伝播
const normalized = raw.map((rec) => ({
  ...rec,
  startTime: extractHHMM(rec.startTime),
  endTime: extractHHMM(rec.endTime),
  breakTime: normalizeBreak(rec.breakTime),
  workingTime: normalizeWork(rec.workingTime),
  tasks: rec.tasks || [],  // 追加
}));
```

### getKintaiDataByDate (L647-654) / getKintaiDataFromMonthlyData (L680-687)
```typescript
// L652, L685 の後にそれぞれ追加
tasks: record.tasks || [],
```

---

## Step 4: KintaiForm.tsx（UI詳細設計）

### 現在のフォームレイアウト（上から順）

```
[日付ピッカー]
[出勤時間 ドラムピッカー]
[休憩時間 ドラムピッカー]
[退勤時間 ドラムピッカー]
[勤務時間 表示のみ]
[勤務場所 <select>1つ]  ← ここを置き換え
[保存ボタン]
```

### 新UI: 勤務場所セクションを「作業内容」セクションに置換

```
[日付ピッカー]
[出勤時間 ドラムピッカー]
[休憩時間 ドラムピッカー]
[退勤時間 ドラムピッカー]
[勤務時間 表示のみ]
┌──────────────────────────────────────────────────┐
│ 作業内容 / Work Tasks                              │
│                                                    │
│  作業 1                                            │
│  ┌──────────────────┐  ┌──────┐                   │
│  │ 草刈り / ¥1200 ▼  │  │ 3.0  │ h   [×]         │
│  └──────────────────┘  └──────┘                   │
│                                                    │
│  作業 2                                            │
│  ┌──────────────────┐  ┌──────┐                   │
│  │ 育苗 / ¥1200   ▼  │  │ 2.0  │ h   [×]         │
│  └──────────────────┘  └──────┘                   │
│                                                    │
│  ┌──────────────────────────────────────────┐     │
│  │       + 作業を追加 / Add Task             │     │
│  └──────────────────────────────────────────┘     │
│                                                    │
│  作業合計: 5.0h / 勤務時間: 7:00                    │
└──────────────────────────────────────────────────┘
[保存ボタン]
```

### 各UI要素の詳細

#### 作業行（task-row）
- **横並びflex**: `<select>` (幅60%) + `<input>` (幅25%) + `h`ラベル + `[×]`ボタン (幅15%)
- モバイル画面（375px想定）でも1行に収まるレイアウト
- `<select>`: 現在の `.location-select` と同等のスタイル（高さ48px、font-size 1.1rem）
  - 選択肢: `未選択` + jobOptionsマスタ（`草刈り / ¥1200` 等）
  - 未選択時は薄ピンク背景（`.input-empty`）
- `<input type="number">`: step=0.5, min=0.5, max=24
  - 高さ48px、中央揃え、font-size 1.1rem
  - 未入力/0時は薄ピンク背景
- `[×]`ボタン: 赤系、タップしやすいサイズ（40×48px以上）
  - 作業が1行しかない場合は非表示（最低1行は必須）

#### 追加ボタン（task-add-btn）
- フル幅、高さ44px
- 破線ボーダー + 薄グレー背景
- テキスト: `+ 作業を追加 / Add Task`
- タップで空の作業行が末尾に追加される

#### 合計表示（task-summary）
- 全作業のhours合計を表示（例: `作業合計: 5.0h`）
- 勤務時間（出退勤から算出）と並べて表示して差異が分かるようにする
- 合計が勤務時間を超えている場合は警告色（オレンジ）で表示

### disabled制御（全UI要素共通）

全てのtask UI要素に以下のdisabled条件を適用:
```typescript
const isDisabled = isDataLoading || (formState.isSaved && !formState.isEditing) || isVeryOldDate();
```

| UI要素 | disabled時の挙動 |
|--------|-----------------|
| task-job-select | disabled属性で無効化 |
| task-hours-input | disabled属性で無効化 |
| task-remove-btn | disabled属性で無効化 + 非表示 |
| task-add-btn | disabled属性で無効化 + 非表示（保存済み＆非編集時、古い日付時） |

### 操作フロー

#### フロー1: 新規入力（未保存日を選択）
1. フォーム表示 → 作業セクションは空（作業行0件）
2. ユーザーが出勤・休憩・退勤を入力
3. `+ 作業を追加` をタップ → 作業行1が出現（job=未選択, hours=空）
4. ドロップダウンから作業を選択（例: 草刈り）
5. 時間を入力（例: 3.0）
6. 必要なら `+ 作業を追加` で作業行2を追加
7. `保存する` をタップ → バリデーション通過後に送信

#### フロー2: 保存済み日を選択（閲覧モード）
1. 日付選択 → API経由でデータ取得
2. 出退勤・休憩が表示される（disabled状態）
3. 作業セクション: 保存済みの作業行が表示される（全disabled）
   - 例: `草刈り / ¥1200 | 3.0 h`、`育苗 / ¥1200 | 2.0 h`
4. `+ 作業を追加` ボタンも非表示
5. 長押し（1秒）で編集モードに移行 → 全フィールドが編集可能に

#### フロー3: 編集モード（保存済みを長押し）
1. 長押しで編集モード突入
2. 既存の作業行が全て編集可能になる
3. 作業の追加・削除・変更が可能
4. `保存する` / `削除` / `キャンセル` ボタンが表示
5. キャンセル → `dispatch(CANCEL_EDIT)` で `isEditing=false` → useEffect+isDirtyRefにより日付データを再ロード → tasks復元

#### フロー4: 削除
1. 編集モードで `削除` をタップ
2. 確認モーダル表示（テキスト更新: 「作業内容」を含める）
3. 確認 → 出退勤・休憩・作業全てクリア → API送信（tasks:[], location:""）
4. `setTasks([])` でUI側もクリア

#### フロー5: 旧データ（location文字列のみ）の表示
1. GASが `[{job:"草刈り", hours:0}]` に変換して返す
2. フォームに作業行1件として表示: `草刈り | (空)h`
3. hours=0の場合、時間入力欄は空表示（「0」ではない）
4. 編集モードで時間を入力可能

### state変更

```typescript
// location state を tasks state に置き換え
const [tasks, setTasks] = useState<TaskEntry[]>([]);
// location stateは削除（tasksから導出）
```

### KintaiForm.tsx 変更箇所一覧（全13箇所）

| 行 | 現在 | 変更後 |
|----|------|--------|
| L42-50 | initialState に `location: ""` | tasksで管理するが、KintaiFormStateにlocationが残るため初期値は維持。tasks用の初期化は別途 |
| L201 | `const [location, setLocation] = useState(initialState.location)` | `const [tasks, setTasks] = useState<TaskEntry[]>([])` に置換。location stateは削除 |
| L317 | `setLocation(initialState.location)` | `setTasks([])` |
| L341-344 | `setLocation(data.location ...)` | tasksデータ復元ロジック（下記） |
| L454-460 | handleStartTimeChange内 validateForm呼び出し `location` | `tasks` をclosure参照で渡す |
| L469-475 | handleBreakTimeChange内 validateForm呼び出し `location` | `tasks` をclosure参照で渡す |
| L484-490 | handleEndTimeChange内 validateForm呼び出し `location` | `tasks` をclosure参照で渡す |
| L493-506 | `handleLocationChange` ハンドラ全体 | 削除し、`handleAddTask/RemoveTask/TaskJobChange/TaskHoursChange` に置換 |
| L499-505 | handleLocationChange内 validateForm呼び出し | 削除（上記ハンドラ群で個別にvalidateForm呼び出し） |
| L513-516 | `if (!data.location \|\| data.location.trim() === "")` | tasks必須チェック（下記バリデーション参照） |
| L532-538 | formData内 `location,` | `tasks, location: tasks.map(t => t.job).join(', '),` |
| L576-579 | `setLocation(refreshed?.location ...)` | `setTasks(refreshed?.tasks \|\| [])` |
| L628-633 | 削除時formData `location: ""` | `tasks: [], location: ""` |
| L847-876 | 単一select JSX（`<div className="form-group">` から `</select></div>` まで） | 複数作業行 JSX |
| L878-880 | `errors.location &&` 表示 | `errors.tasks &&` 表示 |
| L1023-1024 | 削除モーダル文言「勤務場所」 | 「作業内容」に変更 |

**追加の注意事項:**
- L459, L474, L489: これらはそれぞれ `handleStartTimeChange`, `handleBreakTimeChange`, `handleEndTimeChange` 内のvalidateForm呼び出し。引数オブジェクトに `location` を渡している → `tasks` に変更
- L24: import文の `KintaiData` は既にimportされているが、`TaskEntry` のimportを追加する必要あり
- L851: `value={location}` → 削除（単一selectが消えるため）
- L858: `location-select` / `location-input-enabled` のCSS class参照 → 新しいtask用classに変更

### 操作ハンドラ

```typescript
// 作業行追加（末尾に空行を追加）
const handleAddTask = () => {
  setTasks(prev => [...prev, { job: '', hours: 0 }]);
  isDirtyRef.current = true;
  if (!formState.isEditing) {
    dispatch({ type: EditActionType.START_EDITING });
  }
};

// 作業行削除（指定indexを除去、最低1行は残す）
const handleRemoveTask = (index: number) => {
  if (tasks.length <= 1) return;
  setTasks(prev => prev.filter((_, i) => i !== index));
  isDirtyRef.current = true;
};

// 作業名変更
const handleTaskJobChange = (index: number, job: string) => {
  setTasks(prev => prev.map((t, i) => i === index ? { ...t, job } : t));
  isDirtyRef.current = true;
};

// 作業時間変更
const handleTaskHoursChange = (index: number, hours: number) => {
  setTasks(prev => prev.map((t, i) => i === index ? { ...t, hours } : t));
  isDirtyRef.current = true;
};
```

### バリデーション

```typescript
// 作業が1つ以上あること
if (!data.tasks || data.tasks.length === 0) {
  newErrors.tasks = "作業を追加してください / Please add a task";
}
// 全作業のjobが選択されていること
else if (data.tasks.some(t => !t.job)) {
  newErrors.tasks = "作業内容を選択してください / Please select task type";
}
// 全作業のhoursが0より大きいこと
else if (data.tasks.some(t => !t.hours || t.hours <= 0)) {
  newErrors.tasks = "作業時間を入力してください / Please enter hours";
}
```

### 送信データ

```typescript
const formData: KintaiData = {
  date: formState.date, startTime, breakTime, endTime,
  tasks,
  location: tasks.map(t => t.job).join(', '), // 互換用サマリ
};
```

### 日付変更時のリセットとデータ復元

```typescript
// リセット（L313-320、!formState.isEditing時のstartTransition内）
setStartTime(initialState.startTime);  // L314
setBreakTime(initialState.breakTime);  // L315
setEndTime(initialState.endTime);      // L316
setTasks([]);  // ← L317 setLocation(initialState.location) を置換
setWorkingTime("");                    // L318

// データ復元（L327-352、API getKintaiDataByDateApi取得後のstartTransition内）
// L341-344の setLocation(...) を以下に置換
if (data.tasks && data.tasks.length > 0) {
  setTasks(data.tasks);
} else if (data.location) {
  setTasks([{ job: data.location, hours: 0 }]);
} else {
  setTasks([]);
}
```

### 保存成功後の復元（L576-579、handleSubmit内のrefreshData後のstartTransition内）

```typescript
// 変更前（L576-579）: setLocation(refreshed?.location !== undefined ? refreshed.location : formData.location || "");
// 変更後:
setTasks(refreshed?.tasks && refreshed.tasks.length > 0
  ? refreshed.tasks
  : formData.tasks || []);
```

---

## Step 5: MonthlyView.tsx

### L425 ヘッダー変更
```tsx
// 変更前: <th className="col-location">勤務場所 / Location</th>
// 変更後:
<th className="col-location">作業内容 / Tasks</th>
```

### L457 表示変更
```tsx
<td className="col-location">
  {record.tasks && record.tasks.length > 0
    ? record.tasks.map((t, i) => (
        <div key={i}>{t.job}{t.hours > 0 ? ` (${t.hours}h)` : ''}</div>
      ))
    : record.location || "-"}
</td>
```

---

## Step 5.5: KintaiContext.tsx

### L102-109 initializeEntryStatusCache（convertedDataのmap内）
```typescript
// L107の後に追加
location: record.location || "",  // L107（既存）
tasks: record.tasks || [],        // 追加
```

**注意**: この変換先はKintaiData型。Step 1でKintaiDataにtasksを追加済みなら型エラーにはならない。

---

## Step 6: CSS (`src/styles.css`)

現在の `.location-select` / `.location-input-enabled` のスタイルをベースに以下を追加。

```css
/* 作業セクション全体 */
.task-section {
  margin-bottom: 8px;
}

/* 作業1行: select + input + 削除ボタン を横並び */
.task-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

/* 作業名ドロップダウン: 幅60% */
.task-job-select {
  flex: 3;
  height: 48px;
  font-size: 1.1rem;
  padding: 10px;
  border-radius: 4px;
  border: 2px solid transparent;
  background-color: #f5f5f5;
  box-sizing: border-box;
  -webkit-appearance: none;
  appearance: none;
}

/* 時間入力: 幅25% */
.task-hours-input {
  flex: 1.5;
  height: 48px;
  font-size: 1.1rem;
  text-align: center;
  padding: 10px 4px;
  border-radius: 4px;
  border: 2px solid transparent;
  background-color: #f5f5f5;
  box-sizing: border-box;
}

/* 「h」ラベル */
.task-hours-unit {
  font-size: 1rem;
  color: #666;
  flex-shrink: 0;
}

/* 削除ボタン */
.task-remove-btn {
  flex-shrink: 0;
  width: 40px;
  height: 48px;
  border: none;
  border-radius: 4px;
  background-color: #ef5350;
  color: white;
  font-size: 1.2rem;
  cursor: pointer;
}

/* 追加ボタン */
.task-add-btn {
  width: 100%;
  height: 44px;
  border: 2px dashed #ccc;
  border-radius: 4px;
  background-color: #fafafa;
  color: #666;
  font-size: 1rem;
  cursor: pointer;
}

/* 合計表示 */
.task-summary {
  margin-top: 8px;
  font-size: 0.95rem;
  color: #666;
  text-align: right;
}
.task-summary.over-hours {
  color: #ff9800;
  font-weight: bold;
}

/* 未入力状態 */
.task-job-select.input-empty,
.task-hours-input.input-empty {
  background-color: #fce4ec !important;
}
```

---

## 注意: 型定義ファイルの重複

`src/types.ts` と `src/types/index.ts` の両方に `KintaiData` が定義されている。
全コンポーネント・utilsは `from "../types"` でimportしており、TypeScriptのモジュール解決では `src/types.ts`（ファイル）が `src/types/`（ディレクトリ）より優先される。

**→ 変更対象は `src/types.ts` のみ。** `src/types/index.ts` の `KintaiData` は実質使われていないが、同期させるか将来的に統合すべき。

**重要な差異:**
- `src/types.ts` L10: `location?: string` (**optional**)
- `src/types/index.ts` L11: `location: string` (**必須**)
- 実際に使われるのは `src/types.ts` なので、locationはoptional。tasksもoptionalで追加する。

また `src/types/unified.ts` にも `UnifiedKintaiData` (L54: `location?: WorkLocation`) があるが、直接importして使っているコンポーネントはないため、今回は変更不要。

---

## 後方互換性

| ケース | 処理 |
|-------|------|
| G列が旧文字列（"草刈り"）| GASが `[{job:"草刈り", hours:0}]` に変換して返す |
| G列がJSON | そのままパース |
| G列が空 | `tasks: []` |
| hours=0 | 「時間未指定」= 時間入力欄を空表示、MonthlyViewでは時間省略 |

---

## 実装順序

1. `src/types.ts` — 型追加 (4箇所)
2. `GAS/kintai.gs` — 保存(setValues+setFormula+setValue)・読み込み(JSONパース+旧互換)・lastCol固定化
3. `src/utils/apiService.ts` — 送受信にtasks追加 (4箇所)
4. `src/components/KintaiForm.tsx` — location→tasks全置換 (13箇所) + 複数作業UI
5. `src/components/MonthlyView.tsx` — 表示対応 (2箇所)
6. `src/contexts/KintaiContext.tsx` — tasks伝播 (1箇所)
7. `src/styles.css` — CSS追加
8. テスト

---

## 検証定義

1. **保存テスト**: 2件の作業（草刈り 3h, 育苗 2h）を入力して保存 → スプレッドシートのG列に `[{"job":"草刈り","hours":3},{"job":"育苗","hours":2}]` が入ること
2. **F列テスト**: 保存後、スプレッドシートのF列に数式（`=IF(E{row}<C{row},...)`）が入り、計算結果が正しく表示されること
3. **読み込みテスト**: 保存した日付を再選択 → 2件の作業がUIに復元されること
4. **旧データ互換テスト**: G列が旧形式（"草刈り"）のデータ → `[{job:"草刈り", hours:0}]` として読み込まれ、UIに1行表示（hours欄は空）されること
5. **月次一覧テスト**: MonthlyViewで複数作業が各行に表示されること
6. **削除テスト**: 削除実行 → C~E列とG列が空。F列の数式は温存されること
7. **disabled制御テスト**: 保存済み＆非編集時 → task UI全要素がdisabled。古い日付 → 同様にdisabled
8. **キャンセルテスト**: 編集モードでキャンセル → tasksが元のデータに復元されること
9. **日付変更テスト**: 別の日付に切り替え → 前の日付のtasksがクリアされ、新しい日付のデータがロードされること

---

## チェックで発見・修正した問題

### 第1回チェック（技術検証）
| # | 問題 | 修正内容 |
|---|------|---------|
| 1 | GAS setValues()は数式をリテラル文字列として保存する | setFormula()を使う方式に変更 |
| 2 | C~G一括書き込みは不可能 | C~E(setValues) + F(setFormula) + G(setValue) の3回に分離 |
| 3 | 削除時にF列を空にすると数式消失 | 削除時はF列に触らず数式を温存 |
| 4 | disabled制御条件が未記載 | isDisabled共通条件と各要素の挙動表を追加 |
| 5 | 日付変更時のリセット処理が不明確 | setTasks([])への置換を明示 |
| 6 | キャンセル時の復元方法が曖昧 | CANCEL_EDIT→useEffect+isDirtyRef経由の再ロードフローを明記 |
| 7 | 保存成功後のsetLocation復元が未記載 | setTasks(refreshed?.tasks...)への置換を追加 |
| 8 | KintaiContext.tsx の変更漏れ | Step 5.5として追加 |
| 9 | lastColがG列空時に6を返すリスク | lastCol=7固定化を追記 |
| 10 | 変更箇所の全量リストがなかった | 全箇所を行番号付きで列挙 |

### 第2回チェック（実コード突き合わせ）
| # | 問題 | 修正内容 |
|---|------|---------|
| 11 | types.tsの行番号が不正確（L10→L5-12等） | 全行番号を実コードと照合して修正 |
| 12 | GAS L132: payload destructuringに `tasks` 追加が漏れていた | destructuringへの追加を明記 |
| 13 | GAS L137: `isDelete` 判定が `location` のみで `tasks` 未考慮 | `hasTasks` チェックを追加 |
| 14 | L1023-1024: 削除モーダルの文言更新が漏れていた | 「勤務場所」→「作業内容」に変更を追記 |
| 15 | `src/types.ts` と `src/types/index.ts` の重複KintaiData定義に言及なし | 注意事項セクションを追加 |
| 16 | KintaiForm.tsx L24: TaskEntryのimport追加が漏れていた | 注意事項に追記 |
| 17 | KintaiForm.tsx L459/474/489: validateForm引数のlocation変更の具体的コンテキスト不足 | 各ハンドラ名を明記 |

### 第3回チェック（E2Eデータフロー・数式・validateForm全呼び出し）
| # | 問題 | 修正内容 |
|---|------|---------|
| 18 | validateForm呼び出し全5箇所で引数にtasksを渡す必要がある | handleStart/Break/End/Location/Submitの各validateForm呼び出しで `tasks` をclosure参照で渡す |
| 19 | src/types.tsのlocationはoptional、src/types/index.tsは必須という差異が未記載 | 型定義ファイルの重複注意セクションに差異を追記済み |
| 20 | L269に `const [] = useState(false)` という不要なコード（dead code）がある | 実装時に削除推奨。tasks実装には影響なし |
| 21 | 数式・setFormula・API透過性・sessionStorageキャッシュ | 全て問題なし。プランの方針は技術的に正しい |
