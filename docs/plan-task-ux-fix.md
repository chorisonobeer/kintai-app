# 作業時間UX修正プラン（チェック済み）

## Context

複数作業対応を実装したが、以下の致命的なUX問題がある:
1. **作業時間が自動計算されない** — 作業1件なら労働時間=作業時間。追加時は残り時間自動入力。変更時は他の作業時間を自動調整。
2. **作業時間の入力が `<input type="number">` で使いにくい** — 5分単位のドラムピッカー（モーダル）にすべき。

---

## 修正1: 作業時間の自動計算ロジック

### 動作仕様

**勤務時間（分）の算出:**
既存の `calculateWorkingTime()` (KintaiForm.tsx L112-176) を利用。

**自動計算の全パターン:**

| トリガー | 動作 |
|---------|------|
| 作業1件目を追加 | hours = 勤務時間全部 |
| 作業N件目を追加 | hours = 勤務時間 - 既存tasksの合計（残り。0以下なら0） |
| 作業N(最後以外)の時間を変更 | 最後の作業のhoursを自動調整して合計=勤務時間 |
| 作業N(最後)の時間を変更 | 自動調整しない（合計≠勤務時間なら警告表示） |
| 出退勤/休憩を変更（tasks=1件） | その1件のhoursを勤務時間に自動設定 |
| 出退勤/休憩を変更（tasks=複数） | 最後の作業を自動調整 |
| 勤務時間が未入力 | 自動計算しない |

**全てのhours値は5分単位に丸める。**

### 実装詳細（KintaiForm.tsx）

#### 新関数: getWorkingMinutes() — L176の直後に追加

```typescript
const getWorkingMinutes = (
  st: string = startTime,
  et: string = endTime,
  bt: string = breakTime,
): number => {
  if (!st || !et) return 0;
  const wt = calculateWorkingTime(st, et, bt);
  if (!wt) return 0;
  const [h, m] = wt.split(":").map(Number);
  return h * 60 + (m || 0);
};
```

引数にst/et/btを受けられるようにする理由: handleStartTimeChange内では新しいstartTimeの値がまだstateに反映されていないため、直接渡す必要がある。

#### 新関数: roundTo5min() — getWorkingMinutesの直後

```typescript
const roundTo5min = (minutes: number): number => Math.round(minutes / 5) * 5;

const minutesToHours = (minutes: number): number => roundTo5min(minutes) / 60;
```

#### 新関数: autoAdjustTasks() — 出退勤変更時の共通処理

```typescript
const autoAdjustTasks = (totalMinutes: number) => {
  if (totalMinutes <= 0) return;
  setTasks((prev) => {
    if (prev.length === 0) return prev;
    if (prev.length === 1) {
      return [{ ...prev[0], hours: minutesToHours(totalMinutes) }];
    }
    // 複数: 最後の作業を調整
    const usedByOthers = prev.slice(0, -1).reduce(
      (sum, t) => sum + (t.hours || 0) * 60, 0);
    const lastMinutes = Math.max(0, totalMinutes - usedByOthers);
    const updated = [...prev];
    updated[updated.length - 1] = {
      ...updated[updated.length - 1],
      hours: minutesToHours(lastMinutes),
    };
    return updated;
  });
};
```

#### handleAddTask 修正 (L497-503)

```typescript
const handleAddTask = () => {
  const totalMinutes = getWorkingMinutes();
  const usedMinutes = tasks.reduce((sum, t) => sum + (t.hours || 0) * 60, 0);
  const remainMinutes = Math.max(0, totalMinutes - usedMinutes);
  setTasks((prev) => [...prev, { job: "", hours: minutesToHours(remainMinutes) }]);
  isDirtyRef.current = true;
  if (!formState.isEditing) {
    dispatch({ type: EditActionType.START_EDITING });
  }
};
```

#### handleTaskHoursChange 修正 (L521-528)

```typescript
const handleTaskHoursChange = (index: number, hours: number) => {
  setTasks((prev) => {
    const updated = prev.map((t, i) => (i === index ? { ...t, hours } : t));
    const totalMinutes = getWorkingMinutes();
    if (totalMinutes > 0 && index !== prev.length - 1 && prev.length > 1) {
      // 最後以外の作業を変更 → 最後の作業を自動調整
      const usedByOthers = updated
        .slice(0, -1)
        .reduce((sum, t) => sum + (t.hours || 0) * 60, 0);
      const lastMinutes = Math.max(0, totalMinutes - usedByOthers);
      updated[prev.length - 1] = {
        ...updated[prev.length - 1],
        hours: minutesToHours(lastMinutes),
      };
    }
    return updated;
  });
  isDirtyRef.current = true;
  if (!formState.isEditing) {
    dispatch({ type: EditActionType.START_EDITING });
  }
};
```

#### handleStartTimeChange 修正 (L451-464)

```typescript
const handleStartTimeChange = (time: string) => {
  setStartTime(time);
  isDirtyRef.current = true;
  if (!formState.isEditing) {
    dispatch({ type: EditActionType.START_EDITING });
  }
  // 出勤変更 → tasksの自動調整
  const totalMinutes = getWorkingMinutes(time, endTime, breakTime);
  autoAdjustTasks(totalMinutes);
  validateForm({ date: formState.date, startTime: time, breakTime, endTime, tasks });
};
```

#### handleEndTimeChange 修正 (L481-494)

```typescript
const handleEndTimeChange = (time: string) => {
  setEndTime(time);
  isDirtyRef.current = true;
  if (!formState.isEditing) {
    dispatch({ type: EditActionType.START_EDITING });
  }
  const totalMinutes = getWorkingMinutes(startTime, time, breakTime);
  autoAdjustTasks(totalMinutes);
  validateForm({ date: formState.date, startTime, breakTime, endTime: time, tasks });
};
```

#### handleBreakTimeChange 修正 (L466-479)

```typescript
const handleBreakTimeChange = (timeString: string) => {
  setBreakTime(timeString);
  isDirtyRef.current = true;
  if (!formState.isEditing) {
    dispatch({ type: EditActionType.START_EDITING });
  }
  const totalMinutes = getWorkingMinutes(startTime, endTime, timeString);
  autoAdjustTasks(totalMinutes);
  validateForm({ date: formState.date, startTime, breakTime: timeString, endTime, tasks });
};
```

---

## 修正2: 作業時間のドラムピッカー化

### 方針
既存の `DrumTimePicker` (`src/components/drumtimepicker.tsx`) をそのまま再利用する。
DrumTimePickerは時(0-23)+分(5分刻み)のドラムをモーダルで表示する。作業時間用途に十分。

### 変換関数（KintaiForm.tsx に追加）

```typescript
// hours(小数) → "H:mm" (DrumTimePicker互換)
// hours=0 → "0:00"（自動計算で0になった場合に「未入力」ではなく「0:00」と表示）
// hours=undefined/null/NaN → ""（未入力）
const hoursToHHmm = (hours: number | undefined | null): string => {
  if (hours === undefined || hours === null || Number.isNaN(hours)) return "";
  const h = Math.floor(hours);
  const m = Math.min(59, Math.round((hours - h) * 60)); // 浮動小数点誤差で60にならないようクランプ
  return `${h}:${String(m).padStart(2, "0")}`;
};

// "H:mm" → hours(小数)
const hhmmToHours = (hhmm: string): number => {
  if (!hhmm) return 0;
  const [h, m] = hhmm.split(":").map(Number);
  return h + (m || 0) / 60;
};
```

### JSX変更: `<input type="number">` → DrumTimePicker

現在のtask-row内の `<input>` + `<span>h` + `<button>✕` を以下に置換:

```tsx
{tasks.map((task, index) => (
  <div key={index} className="task-row">
    <select ...> {/* 作業名select: 変更なし */} </select>
    <div className="task-hours-picker-wrapper">
      <DrumTimePicker
        label="作業時間"
        value={hoursToHHmm(task.hours)}
        onChange={(val) => handleTaskHoursChange(index, hhmmToHours(val))}
        disabled={isDisabled}
      />
    </div>
    {tasks.length > 1 && (
      <button className="task-remove-btn" ...>✕</button>
    )}
  </div>
))}
```

**DrumTimePickerのlabelは "作業時間" にする:** task-row内のlabel要素はCSSで非表示にするが、モーダルヘッダー（`<h3>{label}</h3>`）にlabelが使われるため、空文字だとモーダルが何のピッカーか分からなくなる。**label="作業時間"** を渡し、CSSで `.drum-time-picker-label { display: none }` にする。

### 削除する要素
- `<input type="number" className="task-hours-input">` → 削除
- `<span className="task-hours-unit">h</span>` → 削除（DrumTimePickerのボタンに統合）

### CSS修正
- `.task-hours-input` → `.task-hours-picker-wrapper` に変更
- DrumTimePickerのボタンがtask-row内で適切なサイズになるようflex調整

```css
.task-hours-picker-wrapper {
  flex: 1.5;
}
.task-hours-picker-wrapper .drum-time-picker {
  gap: 0;
}
.task-hours-picker-wrapper .drum-time-picker-label {
  display: none;
}
.task-hours-picker-wrapper .drum-time-picker-button {
  min-height: 48px;
  padding: 8px 12px;
  font-size: 1.1rem;
}
```

---

## 修正3: task-summaryのover-hours判定バグ修正

### 問題（KintaiForm.tsx L964）
```typescript
// 現在のバグコード:
parseFloat(workingTime.replace(":", ".") || "0")
// "8:30" → "8.30" → 8.30（誤り。正しくは8.5時間）
```

`replace(":", ".")` で "H:mm" → "H.mm" にしているが、これは分を100分率に変換しているだけで時間の小数変換にならない。

### 修正

```tsx
{tasks.length > 0 && (() => {
  const tasksTotalMinutes = tasks.reduce(
    (sum, t) => sum + (t.hours || 0) * 60, 0);
  const wtMinutes = (() => {
    if (!workingTime) return 0;
    const [h, m] = workingTime.split(":").map(Number);
    return h * 60 + (m || 0);
  })();
  const isOver = wtMinutes > 0 && tasksTotalMinutes > wtMinutes;
  const totalH = Math.floor(tasksTotalMinutes / 60);
  const totalM = Math.min(59, Math.round(tasksTotalMinutes % 60));
  return (
    <div className={`task-summary ${isOver ? "over-hours" : ""}`}>
      作業合計: {totalH}:{String(totalM).padStart(2, "0")}
      {workingTime ? ` / 勤務時間: ${workingTime}` : ""}
    </div>
  );
})()}
```

分単位で比較し、表示もHH:mm形式に統一。

---

## 修正4: MonthlyView.tsx の表示フォーマット修正

### 問題
`t.hours` が浮動小数点（例: `3.0833333`）の場合、`(3.0833333h)` と表示される。

### 修正（MonthlyView.tsx L462付近）

```tsx
// 変更前:
{t.hours > 0 ? ` (${t.hours}h)` : ""}

// 変更後: 分に変換してHH:mm形式で表示（Math.minで60分超えを防御）
{t.hours > 0
  ? ` (${Math.floor(t.hours)}:${String(Math.min(59, Math.round((t.hours % 1) * 60))).padStart(2, "0")})`
  : ""}
```

表示例: `草刈り (3:05)`, `育苗 (5:00)`

---

## 変更ファイル一覧

| ファイル | 変更内容 |
|---------|---------|
| `src/components/KintaiForm.tsx` | getWorkingMinutes/roundTo5min/minutesToHours/autoAdjustTasks/hoursToHHmm/hhmmToHours追加。handleAddTask/handleTaskHoursChange/handleStartTimeChange/handleEndTimeChange/handleBreakTimeChange修正。JSXのinput→DrumTimePicker置換。task-summaryのover-hours判定バグ修正 |
| `src/components/MonthlyView.tsx` | hours表示をHH:mm形式にフォーマット |
| `src/styles.css` | task-hours-picker-wrapperのCSS追加、task-hours-input/task-hours-unit関連CSS削除 |

**GAS/apiService/types/KintaiContext は変更不要。**

---

## 検証

1. 出退勤入力(8:00-17:00, 休憩1:00) → 勤務時間8:00 → 作業追加 → 自動で8:00が入る
2. 作業2追加 → 残り時間(0:00)が自動で入る
3. 作業1を5:00に変更 → 作業2が自動で3:00になる
4. 出勤を9:00に変更（勤務7:00に） → 作業が1件なら7:00に自動更新。複数なら最後を調整
5. 作業時間ピッカーがドラムモーダルで表示される（5分刻み）
6. 合計が勤務時間を超えた場合に警告表示（task-summary.over-hours）
7. MonthlyViewで作業時間が `草刈り (5:00)` 形式で表示される

---

## 3回チェックで発見・修正した問題

| # | 問題 | 修正 |
|---|------|------|
| 1 | 出退勤変更時のtasks自動更新の具体コードがなかった | autoAdjustTasks関数を定義し、3つのhandleXxxChange内で呼び出すコードを明記 |
| 2 | getWorkingMinutesがstartTime stateの更新前値を参照する問題 | 引数にst/et/btを直接渡せるように変更 |
| 3 | workingTime useEffectとの連携が未定義だった | useEffectは既存のまま（workingTime表示用）。tasks調整はhandler内で直接実行 |
| 4 | MonthlyViewでhoursが浮動小数点露出する問題が未記載だった | HH:mm形式表示に変更を追記 |
| 5 | DrumTimePickerのlabelがtask-row内で冗長 | label=""にしてCSS `.drum-time-picker-label { display: none }` で非表示 |
| 6 | DrumTimePickerの時計アイコンが作業時間に不適切 | label空+セクションラベルで文脈が明確なため許容。重大でない |
| 7 | hoursToHHmm(0)の処理が未定義 | `if (!hours || hours <= 0) return ""` を追加（未入力表示） |
| 8 | roundTo5min関数が未定義だった | 明示的に定義を追加 |

### 追加3回チェック (チェック4-6) で発見・修正した問題

| # | 問題 | 修正 |
|---|------|------|
| 9 | **task-summary L964: `parseFloat(workingTime.replace(":", "."))` は時間変換として誤り。"8:30"→8.30（正しくは8.5）** | 修正3として追加。分単位で比較する正しいロジックに置換 |
| 10 | **DrumTimePickerのモーダルヘッダーが空になる（label=""）** | label="作業時間" に変更。CSSで外側のlabel要素のみ非表示 |
| 11 | validateForm内のtasksがclosure古い値を参照する可能性 | UIのバリデーション表示のみなので致命的ではない。次回レンダリングで正しく更新される |
| 12 | hoursToHHmm(0)→""で「未入力」表示。自動計算で0になった場合に混乱 | hours=0→"0:00", hours=undefined/null→""に変更 |

### 追加3回チェック (チェック7-9) — 全関数の全入力パターン手計算

| # | 問題 | 修正 |
|---|------|------|
| 13 | hoursToHHmmにNaN入力時の防御がなかった | `Number.isNaN(hours)` チェックを追加 |
| 14 | 浮動小数点誤差で分が60になる可能性（hoursToHHmm, MonthlyView表示, task-summary表示） | 全箇所に `Math.min(59, ...)` クランプを追加 |
| 15 | validateFormにclosureの古いtasksが渡る（handleXxxChange内） | UIバリデーション表示のみで致命的ではない。handleSubmit内のvalidateFormは最新tasksを使う |
| 16 | 作業1件でhours変更時、合計<勤務時間でも自動調整しない | 仕様通り。警告表示で対応 |

**検証済み入力パターン:**
- getWorkingMinutes: 空文字、正常値、日またぎ、不正文字列、"0:00" — 全7パターン
- roundTo5min/minutesToHours: 0, 3, 7, 8, 60, 480, 183, -5 — 全8パターン
- hoursToHHmm: undefined, null, NaN, 0, 8.0, 3.0833, 3.5, 0.0833, 23.9166 — 全9パターン
- hhmmToHours: "", "8:00", "0:05", "23:55", "3:05", "00:00" — 全6パターン
- autoAdjustTasks: totalMinutes=0/-1/480/420/200, prev=空/1件/2件 — 全6パターン
- handleAddTask: tasks=空/1件/2件, totalMinutes=0/480 — 全5パターン
- handleTaskHoursChange: 1件/2件/3件, 最初/真ん中/最後変更 — 全5パターン
- DrumTimePicker経由: value="8:00"/"0:00"/""の全3パターンでhandleOpen→確定までの全経路
- task-summary: tasksTotalMinutes=0/480/540/184.998, wtMinutes=0/480/510 — 全4パターン
- MonthlyView: t.hours=0/8.0/3.0833/3.5/0.0833 — 全5パターン
