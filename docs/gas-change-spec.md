# GAS変更仕様書（複数作業対応）

本ドキュメントはGAS/kintai.gsの変更を行番号レベルで定義する。
プラン本体 `docs/plan-multi-task-support.md` のStep 2に対応。

---

## 変更箇所一覧

| # | 行番号 | 変更種別 | 内容 |
|---|--------|---------|------|
| G1 | L21 | JSDoc追記 | KintaiPayloadに `tasks` プロパティ追加 |
| G2 | L76 | JSDoc追記 | KintaiRecordに `tasks` プロパティ追加 |
| G3 | L132 | 修正 | payload destructuringに `tasks` 追加 |
| G4 | L137 | 修正 | isDelete判定に `tasks` 考慮 |
| G5 | L252-269 | 置換 | 書き込みロジック全体を置換（C~E + F数式 + G JSON） |
| G6 | L611 | 修正 | lastCol = 7 固定化 |
| G7 | L647-686 | 修正 | G列JSONパース + result.pushにtasks追加 |

---

## G1: JSDoc追記 (L21)

```javascript
// 変更前:
 * @property {string} [location] - 勤務場所（オプション）

// 変更後:
 * @property {string} [location] - 勤務場所（後方互換用、オプション）
 * @property {Array<{job: string, hours: number}>} [tasks] - 作業内容配列（オプション）
```

---

## G2: JSDoc追記 (L76)

```javascript
// 変更前:
 * @property {string} location - 勤務場所

// 変更後:
 * @property {string} location - 勤務場所（互換用サマリ文字列）
 * @property {Array<{job: string, hours: number}>} tasks - 作業内容配列
```

---

## G3: payload destructuring (L132)

```javascript
// 変更前:
const { date, startTime, breakTime, endTime, spreadsheetId, userId, location } = payload;

// 変更後:
const { date, startTime, breakTime, endTime, spreadsheetId, userId, location, tasks } = payload;
```

---

## G4: isDelete判定 (L134-138)

```javascript
// 変更前:
// 削除意図の判定（時間が空、かつ勤務地も未指定なら削除）
// breakTime は空文字/"00:00" など多様な表現がありうるため削除判定から除外
/** @type {boolean} */
const isDelete = (!startTime && !endTime && (!location || String(location).trim() === ''));

// 変更後:
// 削除意図の判定（時間が空、かつ勤務地も未指定、かつtasksも空なら削除）
// breakTime は空文字/"00:00" など多様な表現がありうるため削除判定から除外
/** @type {boolean} */
const hasTasks = Array.isArray(tasks) && tasks.length > 0;
const isDelete = (!startTime && !endTime && (!location || String(location).trim() === '') && !hasTasks);
```

**テストケース:**
| startTime | endTime | location | tasks | isDelete | 最終結果 |
|-----------|---------|----------|-------|----------|---------|
| "" | "" | "" | [] | true | 削除実行 |
| "" | "" | "" | undefined | true | 削除実行 |
| "" | "" | "" | [{job:"草刈り",hours:3}] | false | **L141で「必須パラメータ不足」エラー** (startTime/endTimeが必須) |
| "09:00" | "18:00" | "" | [] | false | 保存実行（gValue=""） |
| "" | "" | "草刈り" | [] | false | **L141で「必須パラメータ不足」エラー** (startTime/endTimeが必須) |
| "09:00" | "18:00" | "" | [{job:"草刈り",hours:3}] | false | 保存実行（gValue=JSON） |

**注意:** isDelete=false の場合、L141のチェックで startTime/endTime が必須。
出退勤なしで作業だけ入力するケースはフロント側バリデーションで弾くため、GAS側では問題ない。

---

## G5: 書き込みロジック (L252-269を完全置換)

### 変更前（現在のコード L252-269）:
```javascript
      // データを準備（スプレッドシートの列に合わせる）
      // C列: 出勤時間、D列: 休憩時間、E列: 退勤時間、G列: 勤務場所のみ書き込み
      // A列（日付）、B列（月）、F列（勤務時間）は書き込み禁止

      // スプレッドシートに勤怠データを保存
      // C、D、E列のみ書き込み
      const cVal = isDelete ? '' : startTime;
      const dVal = isDelete ? '' : formatBreakTime(breakTime);
      const eVal = isDelete ? '' : endTime;
      sheet.getRange(rowIndex, 3, 1, 3).setValues([[cVal, dVal, eVal]]); // C〜E列を一括書き込み

      // G列（勤務場所）
      if (location) {
        sheet.getRange(rowIndex, 7, 1, 1).setValue(location);
      } else if (isDelete) {
        // 削除時はG列も必ず空にする
        sheet.getRange(rowIndex, 7, 1, 1).setValue('');
      }
```

### 変更後:
```javascript
      // データを準備（スプレッドシートの列に合わせる）
      // C列: 出勤時間、D列: 休憩時間、E列: 退勤時間
      // F列: 勤務時間（数式で再設定）
      // G列: 作業内容（JSON形式）
      // A列（日付）、B列（月）は書き込み禁止

      // G列に書き込むJSON値を生成
      /** @type {string} */
      let gValue = '';
      if (!isDelete) {
        if (hasTasks) {
          // 新形式: tasks配列をJSON化
          gValue = JSON.stringify(tasks);
        } else if (location && String(location).trim() !== '') {
          // 旧形式互換: 単一locationを1件のtasks配列に変換
          gValue = JSON.stringify([{ job: String(location).trim(), hours: 0 }]);
        }
        // どちらも該当しない場合: gValue = '' (空文字のまま)
      }

      if (isDelete) {
        // 削除時: C~E列とG列を空にする。F列の既存数式は温存（触らない）
        sheet.getRange(rowIndex, 3, 1, 3).setValues([['', '', '']]);
        sheet.getRange(rowIndex, 7, 1, 1).setValue('');
      } else {
        // 通常保存
        // (1) C~E列: 出勤・休憩・退勤を一括書き込み
        sheet.getRange(rowIndex, 3, 1, 3).setValues([
          [startTime, formatBreakTime(breakTime), endTime]
        ]);

        // (2) F列: 勤務時間の数式を設定
        //     setFormula()を使用（setValues()ではリテラル文字列になるため）
        //     失敗してもC~E+Gは保存済みなので、エラーにせず診断情報に記録のみ
        try {
          const fFormula = '=IF(E' + rowIndex + '<C' + rowIndex
            + ',(E' + rowIndex + '+1)-C' + rowIndex + '-D' + rowIndex
            + ',E' + rowIndex + '-C' + rowIndex + '-D' + rowIndex + ')';
          sheet.getRange(rowIndex, 6, 1, 1).setFormula(fFormula);
        } catch (formulaErr) {
          diagInfo.formulaError = String(formulaErr);
        }

        // (3) G列: 作業内容JSONを書き込み
        sheet.getRange(rowIndex, 7, 1, 1).setValue(gValue);
      }

      diagInfo.gValue = gValue;
      diagInfo.updated = true;
      diagInfo.rowUpdated = rowIndex;
```

### 書き込み回数の比較

| ケース | 現状 | 変更後 | 差異 |
|--------|------|--------|------|
| 通常保存(location有) | setValues(C~E) + setValue(G) = 2回 | setValues(C~E) + setFormula(F) + setValue(G) = 3回 | +1回 |
| 通常保存(location無) | setValues(C~E) = 1回 | setValues(C~E) + setFormula(F) + setValue(G) = 3回 | +2回 |
| 削除 | setValues(C~E) + setValue(G) = 2回 | setValues(C~E) + setValue(G) = 2回 | 変わらず |

**+1回の影響:** SpreadsheetApp APIの1回のsetXxx呼び出しは約200-500ms。合計で200-500ms増加。
ただし、F列の数式が**毎回確実に正しく設定される**メリットがある（数式消失リスクゼロ）。

**setFormula()の安全性:** try/catchで囲んでいるため、万が一失敗してもC~E+G列の保存は完了済み。F列は既存数式が温存される。最悪ケースでも既存機能が壊れない。

---

## G6: lastCol固定化 (L611)

```javascript
// 変更前:
const lastCol = Math.min(sheet.getLastColumn(), 7); // A〜G列までを対象

// 変更後:
const lastCol = 7; // A〜G列を常に読む（G列が全行空でもundefinedとして安全に読める）
```

**安全性の根拠:**
- `sheet.getRange(startRow, 1, numRows, 7)` でG列まで取得
- G列にデータがない行は `row[6]` が `''`（空文字）になる
- 後続の `String(locationVal || '')` で安全にハンドルされる

---

## G7: G列JSONパース + result.pushにtasks追加 (L647-686)

**挿入位置:** L676（月の値の数値変換の後）とL677（`// レコード作成`）の間にJSONパースコードを挿入。
result.push内のlocationとtasksフィールドを変更。

### 変更前 (L647, L678-686):
```javascript
      const locationVal = row[6];

      // ... (L649-675: 日付・月変換は変更なし) ...

      // レコード作成
      result.push({
        date: dateStr,
        month: monthNum,
        startTime: String(startTimeVal || ''),
        breakTime: String(breakTimeVal || ''),
        endTime: String(endTimeVal || ''),
        workingTime: String(workingTimeVal || ''),
        location: String(locationVal || '')
      });
```

### 変更後:
```javascript
      const locationVal = row[6];

      // G列のJSONパース（後方互換: 旧形式の文字列にも対応）
      /** @type {Array<{job: string, hours: number}>} */
      let parsedTasks = [];
      /** @type {string} */
      let locationCompat = '';
      const gRaw = String(locationVal || '').trim();

      if (gRaw.startsWith('[')) {
        // JSON形式（新形式）
        try {
          parsedTasks = JSON.parse(gRaw);
          // パース成功: tasksからlocationサマリを生成
          locationCompat = parsedTasks.map(function(t) { return t.job; }).join(', ');
        } catch (jsonErr) {
          // JSONパース失敗: 旧形式として扱う
          locationCompat = gRaw;
          parsedTasks = [{ job: gRaw, hours: 0 }];
        }
      } else if (gRaw !== '') {
        // 旧形式（単一文字列）
        locationCompat = gRaw;
        parsedTasks = [{ job: gRaw, hours: 0 }];
      }
      // gRaw === '' の場合: parsedTasks = [], locationCompat = ''

      // ... (L649-675: 日付・月変換は変更なし、既存コードそのまま) ...

      // ↓ ここにJSONパースコードを挿入（L676の後、L677の前）

      // レコード作成
      result.push({
        date: dateStr,
        month: monthNum,
        startTime: String(startTimeVal || ''),
        breakTime: String(breakTimeVal || ''),
        endTime: String(endTimeVal || ''),
        workingTime: String(workingTimeVal || ''),
        location: locationCompat,
        tasks: parsedTasks
      });
```

### JSONパースのテストケース

| G列の値 | 判定 | parsedTasks | locationCompat |
|---------|------|-------------|----------------|
| `[{"job":"草刈り","hours":3},{"job":"育苗","hours":2}]` | JSON新形式 | `[{job:"草刈り",hours:3},{job:"育苗",hours:2}]` | `"草刈り, 育苗"` |
| `[{"job":"草刈り","hours":0}]` | JSON新形式(旧データ変換済み) | `[{job:"草刈り",hours:0}]` | `"草刈り"` |
| `"草刈り"` | 旧形式文字列 | `[{job:"草刈り",hours:0}]` | `"草刈り"` |
| `""` (空) | 空 | `[]` | `""` |
| `undefined` | 空 | `[]` | `""` |
| `"[壊れたJSON"` | JSONパース失敗 | `[{job:"[壊れたJSON",hours:0}]` | `"[壊れたJSON"` |

---

## GAS変更の整合性チェックリスト

| チェック項目 | 結果 |
|-------------|------|
| L132: `tasks` がpayloadに含まれない場合（旧クライアント） → `undefined` | `hasTasks` = false → 旧locationロジックにフォールバック |
| L137: tasks=undefined + location="" + startTime="" + endTime="" → isDelete=true | 正しい |
| L137: tasks=[{job:"草刈り",hours:3}] + startTime="" + endTime="" → isDelete=false | 正しい（作業のみ入力は許可） |
| G5: tasks=[] + location="" → gValue="" → G列は空文字 | 正しい（バリデーションで弾かれるが防御的に安全） |
| G5: setFormulaが失敗 → try/catchで吸収、C~E+Gは保存済み | 安全 |
| G5: 削除時 → F列温存、C~E+G空 | 現状の挙動を維持 |
| G7: 旧データ（文字列）→ JSON変換して返す | 後方互換あり |
| G7: 新データ（JSON）→ パースして返す | 正常動作 |
| G7: 空データ → tasks=[], location="" | 安全 |
| G7: 壊れたJSON → 旧形式フォールバック | 安全 |

---

## 4回チェックで発見・修正した問題

| # | チェック | 問題 | 修正 |
|---|---------|------|------|
| C1 | 構文・ロジック | isDelete=falseだがstartTime/endTime空の場合、L141で必須パラメータエラーになる。テストケース表の「作業のみ入力は許可」は不正確 | テストケース表に「最終結果」列を追加し、L141の必須チェックとの相互作用を明記 |
| C2 | 変数スコープ | 変更後コードにL270-271 (`diagInfo.updated/rowUpdated`) が欠落していた | 追記済み |
| C3 | コード重複 | setFormulaのtry/catch版と非try/catch版が併記されていた | try/catch版に統一、重複を削除 |
| C4 | 挿入位置 | G7のJSONパースコードの挿入位置が「L647の後」と曖昧だった | 「L676の後、L677の前」に明確化 |

---

## 既存機能への影響なしの証明

1. **旧クライアントからの保存**: `tasks`がundefined → `hasTasks`=false → 旧`location`ロジックで処理 → G列にJSON変換して保存 → 読み込み時にJSON形式で返る → 旧クライアントは`location`フィールドを読む → **動作する**

2. **新クライアントで旧データを読む**: G列が旧文字列 → JSONパース失敗 → フォールバック `[{job:旧文字列, hours:0}]` → フロントにtasks配列で返る → **動作する**

3. **削除**: 現状と同じ挙動（C~E+G空、F温存） → **変更なし**

4. **F列の数式**: setFormulaで毎回再設定。失敗してもtry/catchで吸収。最悪でも既存数式が温存される → **壊れない**
