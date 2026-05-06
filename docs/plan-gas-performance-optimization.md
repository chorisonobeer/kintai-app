# GAS 経由 操作の高速化 + 給与計算バグ修正 — 実装プラン v2

- **作成日**: 2026-05-06（v1）/ **更新**: 2026-05-06（v2: I 列バグ + 作業内容候補マスタ化を追加）
- **対象ブランチ**: `feat/gas-performance`（main から派生済み）
- **ステータス**: 🟡 計画完了、実装着手中

---

## §0 本プランで解決する 3 つの問題

| # | 問題 | 影響 |
|---|---|---|
| **P1** | `saveKintai` warm avg ≈ 5.1s, `getMonthlyData` warm ≈ 4s | UX: 保存ボタン押下後 5 秒待ち |
| **P2** | 個人シート **I 列が `#VALUE!`**（旧 VLOOKUP が新 G 列 JSON 形式に未対応、複数作業合計に未対応） | 給与計算ができない |
| **P3** | 日報入力 UI の作業内容候補が **時給設定マスタを反映していない** | 入力 UX とデータ整合性 |

---

## §1 ベストプラクティス選定（v2 確定）

### 採用 5 案

| 案 | 内容 | 効果 | 解決対象 |
|---|---|---|---|
| **A** | 書込を **`setValues(rowIndex, 3, 1, 5)` 1 範囲に集約**（C/D/E/F=formula文字列/G を 1 trip） | save -2s | P1 |
| **C** | 行特定: 計算 + 1 セル read 検証、不一致時のみ TextFinder fallback | save/get 各 -500ms〜 | P1 |
| **D** | `CacheService` で `getMonthlyData` を 5 分キャッシュ、save 時に該当月 invalidate | get warm 4s → ~50ms | P1 |
| **E** | **時給マスタ取得 API** `Kintai.handleGetJobWageOptions` 新規。`SpreadsheetApp.openById('1XF8QI...').getSheetByName('時給設定')` から直読、CacheService 30 分 | UI 候補がマスタ反映 | P3 |
| **F** | **I 列給与計算**: saveKintai 内で `Σ(時給×時間)` を計算して I 列に setValue | I 列バグ解消 | P2 |
| **G** | **フロント切替**: `getJobWageOptionsFromCsv`（公開 CSV 直叩き）を廃止 → `getJobWageOptions`（GAS 経由）に置換、KintaiForm の候補生成を切替 | UI が真のマスタを参照 | P3 |

### 不採用 案（理由つき）

- **B. F 列 formula 既設チェック**: `getFormula()` が **flush 強制発火**で逆効果。setValues に formula 文字列を含めれば毎回 1 trip で済むため B は不要
- **E（旧）**: 楽観的更新 → A+C+D+F で save が 1.5–2s に収まれば許容範囲。フロント rollback UX 複雑化で投資対効果劣後
- **F（旧）**: Sheets API 直叩き → SA 共有運用が大きすぎる
- **個人シート I 列の旧データマイグレーション**: setValue は数式を上書きするので新規保存で自然修復。再保存されない過去 #VALUE! 行は将来の集計タスクで `IFERROR` ハンドリング

---

## §2 期待効果

| 操作 | 現状 | 目標（A+C+D+F 後） |
|---|---|---|
| `saveKintai` | 5.1s | **1.5–2s** |
| `getMonthlyData` cold | 4s | **1–1.5s** |
| `getMonthlyData` warm（cache hit）| 4s | **~50ms** |
| `getJobWageOptions` warm | N/A（CSV 直叩き ~500ms）| **~50ms** |
| I 列値 | `#VALUE!` または旧式数式 | **数値（合計金額）** |
| 作業内容候補 | 公開 CSV 経由（古い）| **時給設定マスタを直接反映** |

---

## §3 実装内容（具体）

### A. 書込 1 round-trip 化（kintai.gs `Kintai.handleSaveKintai` 内）

**前提**: GAS の `Range.setValues()` は値が `=` で始まる文字列を**自動的に formula として解釈する**（公式仕様）。これを利用して F 列を range に含めて 1 trip で書く。

```javascript
} else {
  var fFormula = '=IF(E' + rowIndex + '<C' + rowIndex
    + ',(E' + rowIndex + '+1)-C' + rowIndex + '-D' + rowIndex
    + ',E' + rowIndex + '-C' + rowIndex + '-D' + rowIndex + ')';
  var gValue = _buildGValue(p.tasks, p.location);

  // C/D/E/F(formula)/G を 1 範囲で書込（1 round-trip）
  sheet.getRange(rowIndex, 3, 1, 5).setValues([
    [p.startTime, _formatBreakTime(p.breakTime), p.endTime, fFormula, gValue]
  ]);

  // I 列: 給与合計を計算して setValue（H 列は触らない）
  try {
    var salary = _calculateSalary(p.tasks);
    sheet.getRange(rowIndex, 9).setValue(salary);
  } catch (salaryErr) {
    diagInfo.salaryError = String(salaryErr);
  }
}
```

**delete パスも同じく 1 範囲化**（F は formula 温存、I は 0 リセット）:

```javascript
if (isDelete) {
  var fFormulaDel = '=IF(E' + rowIndex + '<C' + rowIndex
    + ',(E' + rowIndex + '+1)-C' + rowIndex + '-D' + rowIndex
    + ',E' + rowIndex + '-C' + rowIndex + '-D' + rowIndex + ')';
  sheet.getRange(rowIndex, 3, 1, 5).setValues([
    ['', '', '', fFormulaDel, '']
  ]);
  sheet.getRange(rowIndex, 9).setValue(0);
}
```

### C. 行特定の高速化（kintai.gs `_findOrCalculateRowByDate`）

```javascript
function _findOrCalculateRowByDate(sheet, dateStr) {
  var ymd = dateStr.split('/');
  if (ymd.length !== 3) return _searchRowByDate(sheet, dateStr);
  var year = parseInt(ymd[0], 10);
  var month = parseInt(ymd[1], 10);
  var day = parseInt(ymd[2], 10);
  if (isNaN(year) || isNaN(month) || isNaN(day)) {
    return _searchRowByDate(sheet, dateStr);
  }
  var calcRow = 1 + _getDayOfYear(year, month, day);

  // 1 セル read で検証（高速パス）
  var lastRow = sheet.getLastRow();
  if (calcRow >= 2 && calcRow <= lastRow) {
    var aVal = sheet.getRange(calcRow, 1).getValue();
    var aStr = '';
    if (aVal instanceof Date) {
      aStr = aVal.getFullYear() + '/'
        + String(aVal.getMonth() + 1).padStart(2, '0') + '/'
        + String(aVal.getDate()).padStart(2, '0');
    } else if (typeof aVal === 'string') {
      aStr = _normalizeDate(aVal);
    }
    if (aStr === dateStr) return calcRow;  // 高速パス成功
  }

  // 計算ミス時のみ TextFinder fallback
  var found = _searchRowByDate(sheet, dateStr);
  if (found > 0) return found;
  return calcRow;  // 行が無ければ計算行を返す（既存仕様維持）
}
```

### D. CacheService（kintai.gs）

```javascript
function _monthlyCacheKey(spreadsheetId, year, month) {
  return 'm:' + spreadsheetId + ':' + year + '-' + month;
}
```

`handleGetMonthlyData` 冒頭（パラメータ検証後）でキャッシュ確認 → ヒット時は即返却。
取得結果を返す前に `cache.put(ck, JSON.stringify(result), 300)`。
`handleSaveKintai` 成功時に `cache.remove(_monthlyCacheKey(...))`。

### E. 時給マスタ API（kintai.gs 新規）

**定数**:
```javascript
var WAGE_MASTER_SPREADSHEET_ID = '1XF8QIoudGmRSYavHZ4CkZQjlEUlaaEULxcuWZVOlIuE';
var WAGE_MASTER_SHEET_NAME = '時給設定';
```

**新ハンドラ**:
```javascript
Kintai.handleGetJobWageOptions = function(payload, token, debug, diagInfo) {
  diagInfo = diagInfo || {};
  diagInfo.stage = 'getJobWageOptions';
  diagInfo.handlerVersion = 'v12-perf-optim';

  var authErr = _requireValidToken(token, diagInfo);
  if (authErr) return _err(authErr.err, debug, diagInfo);

  var cache = CacheService.getScriptCache();
  var cached = cache.get('job_wage_master_v1');
  if (cached) {
    diagInfo.cacheHit = true;
    return Utils.createResponse({ ok: true, data: JSON.parse(cached), debug: debug ? diagInfo : undefined });
  }

  try {
    var masterSheet = SpreadsheetApp.openById(WAGE_MASTER_SPREADSHEET_ID)
      .getSheetByName(WAGE_MASTER_SHEET_NAME);
    if (!masterSheet) return _err('時給マスタが見つかりません', debug, diagInfo);
    var lastRow = masterSheet.getLastRow();
    if (lastRow < 2) return Utils.createResponse({ ok: true, data: [], debug: debug ? diagInfo : undefined });
    var values = masterSheet.getRange(2, 1, lastRow - 1, 2).getValues();
    var data = [];
    for (var i = 0; i < values.length; i++) {
      var job = String(values[i][0] || '').trim();
      if (!job) continue;
      var wageRaw = values[i][1];
      var wage = (typeof wageRaw === 'number') ? wageRaw : parseInt(wageRaw, 10);
      data.push({ job: job, wage: isNaN(wage) ? null : wage });
    }
    try { cache.put('job_wage_master_v1', JSON.stringify(data), 1800); } catch (_) {}
    return Utils.createResponse({ ok: true, data: data, debug: debug ? diagInfo : undefined });
  } catch (e) {
    diagInfo.masterError = String(e);
    return _err('時給マスタ取得エラー', debug, diagInfo);
  }
};
```

### F. I 列給与計算ヘルパ（kintai.gs 新規）

```javascript
function _getJobWageMap() {
  var cache = CacheService.getScriptCache();
  var cached = cache.get('job_wage_master_map_v1');
  if (cached) {
    try { return JSON.parse(cached); } catch (_) {}
  }
  try {
    var masterSheet = SpreadsheetApp.openById(WAGE_MASTER_SPREADSHEET_ID)
      .getSheetByName(WAGE_MASTER_SHEET_NAME);
    if (!masterSheet) return {};
    var lastRow = masterSheet.getLastRow();
    if (lastRow < 2) return {};
    var values = masterSheet.getRange(2, 1, lastRow - 1, 2).getValues();
    var map = {};
    for (var i = 0; i < values.length; i++) {
      var job = String(values[i][0] || '').trim();
      if (!job) continue;
      var wageRaw = values[i][1];
      var wage = (typeof wageRaw === 'number') ? wageRaw : parseInt(wageRaw, 10);
      if (!isNaN(wage)) map[job] = wage;
    }
    try { cache.put('job_wage_master_map_v1', JSON.stringify(map), 1800); } catch (_) {}
    return map;
  } catch (_) {
    return {};
  }
}

function _calculateSalary(tasks) {
  if (!Array.isArray(tasks) || tasks.length === 0) return 0;
  var wageMap = _getJobWageMap();
  var total = 0;
  for (var i = 0; i < tasks.length; i++) {
    var t = tasks[i];
    if (!t || !t.job) continue;
    var hours = Number(t.hours);
    if (!isFinite(hours)) continue;
    var wage = wageMap[String(t.job).trim()];
    if (typeof wage === 'number' && isFinite(wage)) {
      total += wage * hours;
    }
  }
  return total;
}
```

### Code.gs ディスパッチ追加

```javascript
case 'getJobWageOptions':
  return Kintai.handleGetJobWageOptions(parsedRequest.payload, parsedRequest.token, parsedRequest.debug, diagInfo);
```

`VERSION` 定数を `v12-perf-optim` に更新、`VERSION_HISTORY` に 1 行追加。

### G. フロント切替（apiService.ts + KintaiForm.tsx）

**apiService.ts**:
- 旧 `getJobWageOptionsFromCsv()` を削除
- 新 `getJobWageOptions()` を追加: `callGAS('getJobWageOptions', { spreadsheetId, userId }, true)` 経由 + sessionStorage キャッシュ 30 分（API 失敗時のフォールバック）

**KintaiForm.tsx**:
- `import { getJobWageOptionsFromCsv }` → `import { getJobWageOptions }`
- 呼び出し 1 行を置換

---

## §4 実装手順

### Step 1. ブランチ作成 ✅ 済
```bash
git checkout -b feat/gas-performance
```

### Step 2. ファイル編集
- `GAS/kintai.gs`: A + C + D + E + F 一括実装
- `GAS/Code.gs`: getJobWageOptions ディスパッチ + VERSION 更新
- `src/utils/apiService.ts`: getJobWageOptions 追加、旧 CSV 関数削除
- `src/components/KintaiForm.tsx`: import + 呼び出し置換

### Step 3. 構文・型・lint チェック
```bash
cp GAS/kintai.gs /tmp/k.js && node --check /tmp/k.js && rm /tmp/k.js
cp GAS/Code.gs /tmp/c.js && node --check /tmp/c.js && rm /tmp/c.js
npm run quality:check
```

### Step 4. パッション側で GAS デプロイ
- GAS エディタで kintai.gs / Code.gs を全置換
- 「時給設定」シートへのアクセス権限確認（GAS execute as = me、パッションがオーナーなので OK）
- デプロイ管理 → 既存編集 → 新バージョン → デプロイ

### Step 5. 性能・機能検証
```bash
node --env-file=.env.local scripts/benchmark-gas-actions.mjs
node --env-file=.env.local scripts/audit-auth-migration.mjs
```

期待値:
- saveKintai avg < 2000ms
- getMonthlyData warm hit < 200ms
- 個人シート I 列に正しい合計金額が入る（例: `[{"job":"田んぼ","hours":8}]` → 1000×8 = 8000）
- 作業内容候補に「育苗/草刈り/田んぼ/柿農園/事務所/稲起こし/E/F/G/H」が表示される

### Step 6. コミット → push → main マージ

---

## §5 リスクと安全網

| リスク | 対策 |
|---|---|
| **A: setValues の formula 文字列が literal 化（GAS の locale 等で）** | 実機検証で確認（パッション）。万が一 literal 化したら setFormula を別途 1 trip で書く保険を入れる |
| **C: A 列が壊れているシートで誤動作** | 1 セル read で検証、不一致なら TextFinder fallback。安全 |
| **D: キャッシュ古い情報が見える** | save 時に該当月キー remove |
| **E/F: 時給マスタへの GAS 読み権限不足** | execute as = me 前提。失敗時は wage map 空で salary=0 にフォールバック（save 自体は成功） |
| **F: 既存 #VALUE! 行のマイグレーション** | 不要。新規保存で自然修復、UI には影響なし（getMonthlyData は A-G のみ読む） |
| **G: フロント切替で候補が空になる** | sessionStorage キャッシュ 30 分 + API 失敗時は前回キャッシュ返却 |
| **CacheService 100KB 上限** | 1 月 30 行 × 200byte ≈ 6KB / マスタ 10 行 ≈ 1KB。余裕 |

---

## §6 着手時の留意点

1. **時給マスタの spreadsheetId は GAS にハードコード**（個人シートと違い全ユーザー共通）
2. **dev サーバー** (`netlify dev`) 再起動推奨
3. **ベンチマーク中はテスト用日付**（`2099-12-31` 等）
4. **既存 #VALUE! データはマイグレーションしない**（新規保存で自然修復）

---

## §7 やらないこと（明示）

- `auth-login.cjs` の変更
- Code.gs のディスパッチ追加以外の変更
- Auth.gs / passwordreset.gs / Utils.gs の変更
- 個人シート I 列の旧データ一括クリア（マイグレーション不要）
- フロントの楽観的更新（別タスクで再検討）
- Sheets API 直叩き（SA 運用変更が大きすぎる）
