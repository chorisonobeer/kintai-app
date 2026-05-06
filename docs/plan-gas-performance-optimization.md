# GAS 経由 操作の高速化 — 次セッション引継ぎ

- **作成日**: 2026-05-06
- **着手前提**: 本セッション（認証脱 GAS + saveKintai bug fix）の作業が main にマージ済み
- **対象ブランチ**: 新規 `feat/gas-performance` を main から派生
- **ステータス**: 🟡 計画完了、実装未着手（パッション承認済み案: A+B+C+D を 1 バッチ）

---

## §0 前回までの状態（Why this matters）

- 認証経路は脱 GAS 化完了（`/.netlify/functions/auth-login` が HMAC token 発行）
- `saveKintai` の Code.gs 引数順バグも修正済み（パッション側 GAS デプロイ済）
- ただし**性能は遅い**ままで残課題：
  - `saveKintai` warm avg ≈ **5.1s** (min 2.9s / max 6.7s)
  - `getMonthlyData` warm avg ≈ **4s**
  - GAS の sheet 操作 round-trip オーバーヘッドが支配的

UX としては「保存ボタンを押してから 5 秒待たされる」状態。
性能改善が次の優先タスク。

---

## §1 ベストプラクティス選定（前セッション結論）

### 採用 4 案
| 案 | 内容 | 効果 |
|---|---|---|
| **A** | 書込を `setValues` 1 回に集約（C/D/E/G を 1 round-trip） | save -1s |
| **B** | F 列 formula 既設なら `setFormula` 省略 | save -300〜500ms |
| **C** | 行特定を計算優先 + 1 セル read で検証、不一致時のみ TextFinder fallback | save/get 両方 -500〜1000ms |
| **D** | `CacheService` で `getMonthlyData` を 5 分キャッシュ、`saveKintai` で該当月 invalidate | get warm 4s → **50ms** |

### 不採用 2 案（理由つき）
- **E. 楽観的更新（Optimistic UI）**: A+B+C+D で save 1.5–2s に収まれば許容範囲。E はフロント rollback UX が複雑化、投資対効果劣後
- **F. Sheets API 直叩き**: 全ユーザーの個人 sheet を SA に共有する運用変更が大きすぎる

---

## §2 期待効果（数値）

| 操作 | 現状 | 目標（A+B+C+D 後） |
|---|---|---|
| `saveKintai` | 5.1s | **1.5–2s** |
| `getMonthlyData` cold | 4s | **1–1.5s** |
| `getMonthlyData` warm（cache hit）| 4s | **~50ms** |

---

## §3 実装内容（具体）

### A. 書込集約（kintai.gs `Kintai.handleSaveKintai` 内）

旧（3 round-trip）:
```js
sheet.getRange(rowIndex, 3, 1, 3).setValues([[startTime, breakTime, endTime]]);
sheet.getRange(rowIndex, 6).setFormula(fFormula);
sheet.getRange(rowIndex, 7).setValue(gValue);
```

新（1 round-trip + 必要時のみ formula 更新）:
```js
// C/D/E/F-空/G を一発で書き込み
sheet.getRange(rowIndex, 3, 1, 5).setValues([
  [startTime, _formatBreakTime(breakTime), endTime, '', _buildGValue(tasks, location)]
]);
// F は formula なので別途、ただし B で省略可能
```

### B. F 列 formula 既設チェック

```js
var expectedFormula = '=IF(E' + rowIndex + '<C' + rowIndex + ',(E' + rowIndex
  + '+1)-C' + rowIndex + '-D' + rowIndex + ',E' + rowIndex + '-C' + rowIndex
  + '-D' + rowIndex + ')';
var existing = sheet.getRange(rowIndex, 6).getFormula();
if (existing !== expectedFormula) {
  try {
    sheet.getRange(rowIndex, 6).setFormula(expectedFormula);
  } catch (e) {
    diagInfo.formulaError = String(e);
  }
}
```

注: A の `setValues` で F 列に空文字を書くと既存 formula が消える。順序として B のチェックを A より**前**に行うか、F 列だけ `setValues` から除外して別途 setRange で書き込む形に変更が必要。実装時に整理。

### C. 行特定の高速化（kintai.gs `_findOrCalculateRowByDate`）

```js
function _findOrCalculateRowByDate(sheet, dateStr) {
  // 1. 計算で行推定
  var ymd = dateStr.split('/');
  var year = parseInt(ymd[0], 10);
  var month = parseInt(ymd[1], 10);
  var day = parseInt(ymd[2], 10);
  var calcRow = 1 + _getDayOfYear(year, month, day);

  // 2. 1 セル read で検証（~100–200ms）
  var lastRow = sheet.getLastRow();
  if (calcRow >= 2 && calcRow <= lastRow) {
    var aVal = sheet.getRange(calcRow, 1).getValue();
    var aStr = (aVal instanceof Date)
      ? (aVal.getFullYear() + '/' + String(aVal.getMonth()+1).padStart(2,'0') + '/' + String(aVal.getDate()).padStart(2,'0'))
      : (typeof aVal === 'string' ? _normalizeDate(aVal) : '');
    if (aStr === dateStr) return calcRow;  // 高速パス（成功）
  }

  // 3. 計算ミス時のみ TextFinder fallback（既存 _searchRowByDate を呼ぶ）
  return _searchRowByDate(sheet, dateStr);
}
```

### D. CacheService（kintai.gs 全体に追加）

- ヘルパ:
```js
function _monthlyCacheKey(spreadsheetId, year, month) {
  return 'm:' + spreadsheetId + ':' + year + '-' + month;
}
```

- `handleGetMonthlyData` 冒頭（パラメータ検証後）でキャッシュ確認:
```js
var cache = CacheService.getScriptCache();
var ck = _monthlyCacheKey(p.spreadsheetId, p.year, p.month);
var cached = cache.get(ck);
if (cached) {
  diagInfo.cacheHit = true;
  return Utils.createResponse({
    ok: true,
    data: JSON.parse(cached),
    debug: debug ? diagInfo : undefined,
  });
}
```

- 既存の取得結果を返す前にキャッシュ:
```js
try { cache.put(ck, JSON.stringify(result), 300); } catch (_) { /* 100KB 超は無視 */ }
return Utils.createResponse({ ok: true, data: result, ... });
```

- `handleSaveKintai` 末尾（成功時）で該当月キャッシュ invalidate:
```js
try {
  var saveYear = parseInt(normalizedDate.split('/')[0], 10);
  var saveMonth = parseInt(normalizedDate.split('/')[1], 10);
  CacheService.getScriptCache().remove(_monthlyCacheKey(p.spreadsheetId, saveYear, saveMonth));
} catch (_) {}
```

---

## §4 実装手順（次セッション着手時）

### Step 1. ブランチ作成
```bash
git checkout main && git pull
git checkout -b feat/gas-performance
```

### Step 2. `GAS/kintai.gs` を編集
- A, B, C, D の変更を一括で実装
- ローカル構文チェック: `cp GAS/kintai.gs /tmp/k.js && node --check /tmp/k.js && rm /tmp/k.js`

### Step 3. パッション側で GAS デプロイ
- GAS エディタで kintai.gs を全置換
- デプロイ管理 → 既存編集 → 新バージョン → デプロイ
- VERSION 定数を `v12-perf-optim` 等に更新（デプロイ確認用）

### Step 4. 性能検証
```bash
# 既存ベンチを再実行
node --env-file=.env.local scripts/benchmark-gas-actions.mjs
```

期待値:
- saveKintai avg < 2000ms ✅
- getMonthlyData warm hit < 200ms（同月再 fetch） ✅
- 既存 audit (`scripts/audit-auth-migration.mjs`) も全 pass

### Step 5. 既存 functional 確認
- `scripts/audit-auth-migration.mjs` で I1–I12 全 pass を再確認
- ブラウザ E2E（任意）：ログイン → 月次表示 → 保存 → 月次再表示で速度体感

### Step 6. コミット → push → main マージ

---

## §5 リスクと安全網

| リスク | 対策 |
|---|---|
| **C: A 列が壊れているシートで誤動作** | 1 セル read で検証、不一致なら TextFinder fallback。安全 |
| **D: キャッシュ古い情報が見える** | save 時に該当月キー remove |
| **A: setValues に formula 文字列を渡すと literal になる** | F 列を setValues 範囲から除外、別途 setFormula で書き込み |
| **CacheService 100KB 上限** | 1 月 30 行 × 200byte ≈ 6KB、余裕。try/catch で 100KB 超え時は cache スキップ |
| **regression（既存機能破壊）** | audit script で I1-I12 自動検証 |

---

## §6 着手時の留意点

1. **まず本セッションのコミットが main にマージ済みであることを確認**（main から派生のため）
2. **dev サーバー** (`netlify dev`) を再起動してから検証（kintai-api.cjs は変更なしだが、念のため）
3. **既存の `verify-sa-access.mjs` は触らない**（SA 動作確認用、変更不要）
4. **ベンチマーク中はテストデータ用日付を使う**（`2099-12-31` 等、実データに影響しない日）

---

## §7 やらないこと（明示）

- `auth-login.cjs` の変更（既に動作中）
- フロントエンド `apiService.ts` の変更（既に動作中）
- Code.gs の変更（既にパッション側で修正・デプロイ済み）
- E（楽観的更新）/ F（Sheets API 直叩き）→ 別タスクで再検討
