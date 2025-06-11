# GAS スプレッドシートデータ取得ロジック

## 概要

Google Apps Script (GAS) の `kintai.gs` ファイルにおけるスプレッドシートからの勤怠データ取得ロジックの詳細解析。

## 主要関数: `handleGetMonthlyData`

### 1. 初期処理

```javascript
// トークン検証
const tokenValidation = validateToken(payload.token);
if (!tokenValidation.isValid) {
  return createErrorResponse("INVALID_TOKEN", tokenValidation.message);
}

// 必須パラメータのチェック
if (
  !payload.spreadsheetId ||
  !payload.userId ||
  !payload.year ||
  !payload.month
) {
  return createErrorResponse(
    "MISSING_PARAMETERS",
    "必須パラメータが不足しています"
  );
}
```

### 2. スプレッドシートアクセス

```javascript
// スプレッドシートを開く
const spreadsheet = SpreadsheetApp.openById(payload.spreadsheetId);
const dataSheetName = `${payload.userId}_data`;
const dataSheet = spreadsheet.getSheetByName(dataSheetName);

// データシートの存在確認
if (!dataSheet) {
  return createErrorResponse(
    "SHEET_NOT_FOUND",
    `シート「${dataSheetName}」が見つかりません`
  );
}
```

### 3. データ取得

```javascript
// 全データを取得（ヘッダー行を含む）
const allData = dataSheet.getDataRange().getValues();
console.log("取得したデータ行数:", allData.length);

// ヘッダー行をスキップして2行目からデータを処理
const dataRows = allData.slice(1);
```

### 4. データ構造

スプレッドシートの列構成:

- **A列**: 日付 (date)
- **B列**: 月 (month)
- **C列**: 出勤時間 (startTime)
- **D列**: 休憩時間 (breakTime)
- **E列**: 退勤時間 (endTime)
- **F列**: 勤務時間 (workingTime)
- **G列**: 勤務場所 (location)

### 5. データ処理ループ

```javascript
for (let i = 0; i < dataRows.length; i++) {
  const row = dataRows[i];

  // 各列の値を取得
  const dateValue = row[0]; // A列: 日付
  const monthValue = row[1]; // B列: 月
  const startTime = row[2]; // C列: 出勤時間
  const breakTime = row[3]; // D列: 休憩時間
  const endTime = row[4]; // E列: 退勤時間
  const workingTime = row[5]; // F列: 勤務時間
  const location = row[6]; // G列: 勤務場所

  console.log(
    `行${i + 2}: 日付=${dateValue}, 月=${monthValue}, 出勤=${startTime}, 休憩=${breakTime}, 退勤=${endTime}, 勤務=${workingTime}, 場所=${location}`
  );
}
```

### 6. 日付フィルタリング

```javascript
// 対象年月でフィルタリング
const targetYear = parseInt(payload.year);
const targetMonth = parseInt(payload.month);

// 日付の様々な形式に対応
let parsedDate;
if (dateValue instanceof Date) {
  parsedDate = dateValue;
} else if (typeof dateValue === "string") {
  // 様々な日付形式をパース
  // 例: "2024/5/13", "2024-05-13", "2024年5月13日"
  parsedDate = parseFlexibleDate(dateValue);
}

// 年月が一致するかチェック
if (
  parsedDate &&
  parsedDate.getFullYear() === targetYear &&
  parsedDate.getMonth() + 1 === targetMonth
) {
  // データ処理を続行
}
```

### 7. 時刻データ変換とクレンジング

#### 開始時間・終了時間の処理

```javascript
let processedStartTime = "";
if (startTime instanceof Date) {
  // Dateオブジェクトの場合
  processedStartTime = formatTime(startTime);
} else if (typeof startTime === "number") {
  // シリアル値の場合（Excelの時刻形式）
  processedStartTime = serialToTime(startTime);
} else if (typeof startTime === "string") {
  // 文字列の場合
  processedStartTime = startTime;
}
```

#### 休憩時間のクレンジング処理（修正済み）

```javascript
// 休憩時間の処理
let finalBreakTime;
if (breakTimeValue instanceof Date) {
  const hours = breakTimeValue.getHours();
  const minutes = breakTimeValue.getMinutes();
  finalBreakTime = `${hours}:${minutes.toString().padStart(2, "0")}`;
} else {
  finalBreakTime = breakTimeValue || "";
}
```

#### 勤務時間のクレンジング処理（修正済み）

```javascript
// 勤務時間の処理
let finalWorkingTime;
if (workingTimeValue instanceof Date) {
  const hours = workingTimeValue.getHours();
  const minutes = workingTimeValue.getMinutes();
  finalWorkingTime = `${hours}:${minutes.toString().padStart(2, "0")}`;
} else {
  finalWorkingTime = workingTimeValue || "";
}
```

### 8. データクレンジングの実装

**修正内容**: スプレッドシートのデータがDate型として保存されている場合、ISO日付形式（`"1899-12-29T15:45:00.000Z"`）で返されてしまう問題を解決するため、GAS側でクレンジング処理を実装。

#### 修正前の問題

- `breakTime`: `"1899-12-29T15:45:00.000Z"` → 期待値: `"0:45"`
- `workingTime`: `"1899-12-29T23:15:00.000Z"` → 期待値: `"8:15"`

#### 修正後の処理

```javascript
// 休憩時間のクレンジング
let finalBreakTime;
if (breakTimeValue instanceof Date) {
  const hours = breakTimeValue.getHours();
  const minutes = breakTimeValue.getMinutes();
  finalBreakTime = `${hours}:${minutes.toString().padStart(2, "0")}`;
} else {
  finalBreakTime = breakTimeValue || "";
}

// 勤務時間のクレンジング
let finalWorkingTime;
if (workingTimeValue instanceof Date) {
  const hours = workingTimeValue.getHours();
  const minutes = workingTimeValue.getMinutes();
  finalWorkingTime = `${hours}:${minutes.toString().padStart(2, "0")}`;
} else {
  finalWorkingTime = workingTimeValue || "";
}
```

### 9. レスポンスデータ作成

```javascript
// 月間データ配列に追加
monthlyData.push({
  date: dateStr,
  startTime: formattedStartTime,
  endTime: formattedEndTime,
  breakTime: finalBreakTime, // ✅ 修正済み: クレンジング済みの値を使用
  workingTime: finalWorkingTime, // ✅ 修正済み: クレンジング済みの値を使用
  location: locationValue || "",
});
```

## 問題の特定と修正

### 問題1: Date型データのISO形式出力問題（修正済み）

**症状**:

- `breakTime`: `"1899-12-29T15:45:00.000Z"` → 期待値: `"0:45"`
- `workingTime`: `"1899-12-29T23:15:00.000Z"` → 期待値: `"8:15"`

**原因**: スプレッドシートでDate型として保存されたデータが、JavaScriptでISO文字列に変換されていた

**修正内容**: GAS側でDate型データを検出し、`HH:mm`形式の文字列に変換するクレンジング処理を実装

```javascript
// 修正後のクレンジング処理
if (breakTimeValue instanceof Date) {
  const hours = breakTimeValue.getHours();
  const minutes = breakTimeValue.getMinutes();
  finalBreakTime = `${hours}:${minutes.toString().padStart(2, "0")}`;
}
```

### 問題2: スプレッドシートデータの直接出力（修正済み）

**症状**: GASが独自の変換・計算ロジックを実行し、スプレッドシートの正しいデータを上書きしていた

**修正内容**: 余計な変換処理を削除し、スプレッドシートの値をそのまま使用（ただしDate型のみクレンジング）

**原因調査**:

1. **スプレッドシートのF列（勤務時間）の値**: `workingTimeValue = rows[i][5]`
2. **処理の優先順位**:
   ```javascript
   // 1. スプレッドシートのF列に値がある場合
   if (
     typeof workingTimeValue === "string" &&
     workingTimeValue.match(/^\d{1,2}:\d{2}$/)
   ) {
     finalWorkingTime = workingTimeValue; // そのまま使用
   }
   // 2. F列がシリアル値の場合
   else if (typeof workingTimeValue === "number" && workingTimeValue > 0) {
     // シリアル値から時:分形式に変換
   }
   // 3. F列が空の場合は計算で求める
   else {
     const totalWorkMinutes =
       endMinutes - startMinutes - (breakTimeInMinutes || 0);
   }
   ```

**推定原因**:

- スプレッドシートのF列に `"9:00"` という値が直接入力されている
- または、スプレッドシートで計算式が設定されているが、休憩時間を考慮していない計算になっている

### 修正済み箇所

1. **Date型データのクレンジング処理**: ✅ 完了

   ```javascript
   // 休憩時間のクレンジング
   if (breakTimeValue instanceof Date) {
     const hours = breakTimeValue.getHours();
     const minutes = breakTimeValue.getMinutes();
     finalBreakTime = `${hours}:${minutes.toString().padStart(2, "0")}`;
   }

   // 勤務時間のクレンジング
   if (workingTimeValue instanceof Date) {
     const hours = workingTimeValue.getHours();
     const minutes = workingTimeValue.getMinutes();
     finalWorkingTime = `${hours}:${minutes.toString().padStart(2, "0")}`;
   }
   ```

2. **スプレッドシートデータの直接使用**: ✅ 完了
   - 余計な変換・計算処理を削除
   - スプレッドシートの値をそのまま出力（Date型のみクレンジング）

### 期待される出力形式

- **修正前**: `"1899-12-29T15:45:00.000Z"`
- **修正後**: `"0:45"` または `"8:15"`

```

## データフロー図（修正後）

```

スプレッドシート
↓
[A列:日付] [B列:月] [C列:出勤] [D列:休憩] [E列:退勤] [F列:勤務] [G列:場所]
↓
getDataRange().getValues()
↓
年月フィルタリング
↓
Date型データクレンジング ← ✅ 新規追加
↓
monthlyData配列作成
↓
JSON レスポンス

```

## 解決策（実装済み）

1. **Date型データのクレンジング**: スプレッドシートのDate型データを`HH:mm`形式の文字列に変換
2. **余計な処理の削除**: スプレッドシートのデータをそのまま使用（クレンジング以外の変換処理を削除）
3. **データ整合性の確保**: フロントエンドで期待される形式での出力を保証

---

*作成日: 2025年1月13日*
*最終更新: 2025年1月13日*
*対象ファイル: kintai.gs*
*調査範囲: 481行目〜950行目*
*修正内容: Date型データクレンジング処理追加、余計な変換処理削除*
```
