# 作業内容入力システム調査報告

調査日: 2026-03-26

## 1. 概要

現在の勤怠入力画面では「勤務場所 / Work Task」として、**1日1件の作業内容**をドロップダウンから選択する仕組みになっている。複数作業の入力や時間配分の機能は存在しない。

---

## 2. データフロー全体像

```
Google Sheets (公開CSV)          Google Sheets (個人スプレッドシート)
  gid=55512795                     「データ」シート
  [仕事内容, 時給]                   A列:日付  B列:月  C列:出勤  D列:休憩  E列:退勤  F列:勤務時間  G列:勤務場所
        │                                              ↑
        │ fetch (CSV)                                   │ saveKintai (GAS)
        ↓                                              │
  apiService.ts                                         │
  getJobWageOptionsFromCsv()                            │
        │                                              │
        ↓                                              │
  KintaiForm.tsx ──────── handleSubmit() ──→ saveKintaiToServer() ──→ GAS kintai.gs
  [<select> UI]              ↑
                       validateForm()
```

---

## 3. 作業内容マスタの取得

### ソース: `src/utils/apiService.ts` L527-586

**関数**: `getJobWageOptionsFromCsv()`

- **取得元**: Google Sheets公開CSV（`gid=55512795`）
  - URL: 環境変数 `VITE_CSV_LOCATION_URL` 優先、未設定時はハードコードのfallback URL
  - 注意: fallback URLのスプレッドシートIDは`1Mg15XrXkyIQZa4xp9Lzz447MBGcP5ThsomemAogjF-Q`（ユーザー提供）とは異なるID（`2PACX-1vTMitO8...`）が使われている
- **キャッシュ**: sessionStorageに30分TTLで保存（キー: `job_wage_options` / `job_wage_options_ts`）
- **パース処理**:
  1. CSVをフェッチ（リトライ2回、タイムアウト8秒）
  2. 改行分割→空行除去
  3. 1行目がヘッダ（`仕事内容`, `時給`を含む）ならスキップ
  4. カンマ分割→`{ job: string, wage: number | null }` の配列を返す
- **戻り値の型**: `Array<{ job: string; wage: number | null }>`

### マスタデータ（2026-03-26時点）

| 仕事内容 | 時給(円) |
|---------|---------|
| 育苗 | 1200 |
| 草刈り | 1200 |
| 田んぼ | 1000 |
| 柿農園 | 1200 |
| 事務所 | 1000 |
| 稲起こし | 1400 |
| E | 1000 |
| F | 1000 |
| G | 1100 |
| H | 1300 |

---

## 4. UI（入力画面）

### ソース: `src/components/KintaiForm.tsx` L847-877

- **UI要素**: `<select>` ドロップダウン（ラベル: 「勤務場所 / Work Task」）
- **初期値**: `""` (未選択)
- **選択肢の構成**:
  1. `<option value="">未選択 / Not selected</option>` — 常に先頭
  2. `jobOptions`（CSV取得成功時）: `{仕事内容} / ¥{時給}` 形式で表示（例: `育苗 / ¥1200`）
  3. フォールバック（CSV取得失敗時）: ハードコードの4択 — 田んぼ / 柿農園 / 事務所 / その他
- **無効化条件**: データロード中 or 保存済み＆非編集 or 古い日付（`isVeryOldDate()`）

### 状態管理

- state: `const [location, setLocation] = useState("")`
- state: `const [jobOptions, setJobOptions] = useState<Array<{job, wage}>>([])`
- `jobOptions`はコンポーネントマウント時に1回だけ取得（`useEffect([], [])`）

---

## 5. バリデーション

### ソース: `src/components/KintaiForm.tsx` L508-526

- **勤務場所は必須**: 空または空文字ならエラー
  - エラーメッセージ: `"勤務場所を選択してください / Please select a work location"`
- バリデーションは入力変更のたびにリアルタイム実行（`handleLocationChange` → `validateForm`）
- 送信時（`handleSubmit`）にも再実行

---

## 6. データ保存

### フロント側: `src/utils/apiService.ts` L261-295

**関数**: `saveKintaiToServer(data: KintaiData)`

送信ペイロード:
```json
{
  "action": "saveKintai",
  "date": "2026-03-26",
  "startTime": "09:00",
  "breakTime": "01:00",
  "endTime": "18:00",
  "location": "育苗",
  "spreadsheetId": "xxx",
  "userId": "xxx"
}
```

- `location`は `data.location || ""` で送信（空文字許容）
- 勤務時間（workingTime）はフロントからは送信しない（GAS側で計算or数式）

### GAS側: `GAS/kintai.gs` L132-269

- スプレッドシートの「データ」シートに書き込み
- **列マッピング**:
  - C列: 出勤時間 (`startTime`)
  - D列: 休憩時間 (`breakTime`)
  - E列: 退勤時間 (`endTime`)
  - F列: 勤務時間（**書き込み禁止** — スプレッドシート数式で自動計算）
  - G列: 勤務場所 (`location`)
- A列（日付）、B列（月）も書き込み禁止
- 削除時（全時間フィールド空＆場所未指定）: C~E列を空、G列も空にする

---

## 7. データ読み込み（既存データの復元）

### ソース: `src/components/KintaiForm.tsx` L298-345, `src/utils/apiService.ts` L640-690

- 日付変更時に `getKintaiDataByDate` API を呼び出し
- レスポンスの `location` フィールドでフォームの `location` state を復元
- KintaiRecord型に `location?: string` として含まれる

---

## 8. 月次一覧での表示

### ソース: `src/components/MonthlyView.tsx` L425, L457

- テーブルに「勤務場所 / Location」列あり
- `record.location || "-"` で表示（未設定なら`-`）

---

## 9. 型定義

### `src/types.ts` (主に使われている方)

```typescript
interface KintaiData {
  date: string;       // yyyy-MM-dd
  startTime: string;  // HH:mm
  breakTime: string;  // HH:mm
  endTime: string;    // HH:mm
  location?: string;  // 勤務場所（optional）
  workingTime?: string;
}

type KintaiRecord = {
  date: string;
  userName: string;
  userId: string;
  startTime: string;
  breakTime: string;
  endTime: string;
  workingTime: string;
  location?: string;
}
```

---

## 10. 現状の制約・課題

1. **1日1作業しか入力できない**: locationフィールドは1つの文字列。1日に複数作業（午前:草刈り、午後:育苗など）の入力は不可
2. **時給は表示のみ**: ドロップダウンに`¥1200`等が表示されるが、保存・計算には使われていない。給与計算機能は存在しない
3. **CSVのURL二重管理**: fallback URLがハードコードされており、マスタのスプレッドシートIDと一致しない可能性がある
4. **フォールバック選択肢の乖離**: CSV取得失敗時のハードコード4択（田んぼ/柿農園/事務所/その他）がマスタの10項目と一致しない
5. **スプレッドシートのG列が1列**: 複数作業を保存するにはシート構造の変更が必要
