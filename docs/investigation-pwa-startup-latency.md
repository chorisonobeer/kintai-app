# PWA起動時の初期読込が約30秒かかる件 — 調査報告

**調査日**: 2026-04-17
**ブランチ**: feat/multi-task-support
**観測事象**: PWAとして立ち上げた際、最初のデータ表示まで約30秒かかる

---

## 結論（先出し）

30秒の内訳は「**単一のボトルネック**」ではなく、以下の**4つの遅延要因が直列に積み上がった結果**である。

| # | 要因 | 典型的な寄与時間 |
|---|------|------|
| 1 | Service Worker の「更新あり→全キャッシュ削除→フルリロード」サイクル | **+5〜10秒**（2回目の起動ライフサイクルが丸ごと発生） |
| 2 | GAS API のコールドスタート + スプレッドシートアクセス | **3〜10秒／1コール** |
| 3 | クライアント層とNetlify関数層の**二重リトライ**（最悪 8s×3回×2層） | **+8〜16秒**（1回でも失敗すると跳ね上がる） |
| 4 | 起動時のAPIコール**3本**（うち2本は実質重複） | **逐次実行で+α** |

特に効いているのは **要因1（SW更新リロードの二重起動）と要因3（二重リトライでのタイムアウト）**。これらが同時に発動すると容易に30秒級になる。

---

## 起動シーケンスの実測トレース

コードパスを追った起動フロー：

```
[t=0] index.html 受信 → main.tsx 実行
  ↓
[t=0] App.tsx マウント
  ├─ isAuthenticated() チェック
  └─ initializeServiceWorker()
        ├─ navigator.serviceWorker.register('/sw.js')
        ├─ navigator.serviceWorker.ready (SW活性化待ち)
        └─ SW に CHECK_FOR_UPDATES ポスト
              ↓
              SW: fetch('/version.json?t=' + now, cache: 'no-cache')
              ↓
              storedVersion(キャッシュ) と buildTime 比較
              ↓
              ★ 差分あり → VERSION_CHECK_RESULT = update_available
  ↓
[並行] KintaiProvider マウント
  └─ useEffect([currentYear, currentMonth]) → fetchMonthlyData()
        └─ callGAS('getMonthlyData')   ← API call #1
              └─ /.netlify/functions/kintai-api  (8s timeout × 3 retry)
                    └─ GAS doPost → Kintai.handleGetMonthlyData
                          └─ openById → TextFinder×2 → getValues → filter
  ↓
[並行] KintaiForm マウント
  ├─ useEffect([]) → getJobWageOptionsFromCsv()   ← API call #2
  │     └─ docs.google.com CSV 直取得
  └─ useEffect([deferredDate]) → getKintaiDataByDateApi()
        └─ 内部で再度 getMonthlyData()            ← API call #3（※pendingRequestsで重複排除される想定）
  ↓
[★ SW更新検知時] APPLY_UPDATE を SW にポスト
  └─ SW: caches.keys() → 全削除 → version.json だけ再キャッシュ
        → UPDATE_APPLIED
              ↓
              App: window.location.reload()   ← ★ここで2回目の起動が始まる
```

---

## ボトルネック詳細

### 要因1: Service Worker の更新リロードが「二重起動」を起こす

**該当箇所**: `public/sw.js:31-60`, `src/App.tsx:113-135`

- 起動時に必ず `CHECK_FOR_UPDATES` が走り、`version.json` の buildTime 差を見る
- 差分があると `APPLY_UPDATE` → **`caches.delete()` で全キャッシュ削除** → `window.location.reload()` で**フルリロード**
- その結果：
  1. **1回目の起動**でアセット（index.html, JS, CSS, fonts）をネットワークから取得
  2. **リロード後の2回目の起動**でも、キャッシュが全削除されたためにネットワークから再取得
  3. おまけに `/version.json` のキャッシュキーが初回 install では `/version.json`、`checkForUpdates` では `/version.json?t=...` でミスマッチするため、**"update_available" が毎回誤発火しがち**

**最悪のケース**: `urlsToCache` の初回 install（fonts.googleapis.com 含む）が完了する前に差分検知→キャッシュ全削除→再取得、を2巡する。

### 要因2: GAS API のコールドスタート + スプレッドシートアクセス

**該当箇所**: `GAS/kintai.gs:534-767` (`handleGetMonthlyData`)

1 回の月次データ取得で以下が実行される：

- Apps Script コールドスタート（初回 1〜3秒）
- `Auth.checkToken(token)` — スプレッドシート別シートを開く
- `SpreadsheetApp.openById(spreadsheetId)` — 0.5〜2秒
- `findOrCalculateRowByDate` **×2回**（startRow と endRow、各回 `TextFinder.findNext()`）
- `sheet.getRange().getValues()` で範囲読込
- 行ループ処理と JSON.parse

Apps Script の doPost は無料枠だと **typ 2〜6秒、最悪 10秒超**。

### 要因3: クライアント × Netlify関数 の二重リトライ

**該当箇所**: `src/utils/apiService.ts:78-126`, `netlify/functions/kintai-api.cjs:45-82`

**クライアント側**（`apiService.ts:160`）:
```
fetchWithRetry(apiUrl, fetchOptions, 2, 8000)   // 8s timeout × 3回試行
```

**Netlify関数側**（`kintai-api.cjs:85`）:
```
fetchWithRetry(GAS_API_URL, {...})   // 8s timeout × 3回試行（内蔵）
```

**問題**:
- Netlify関数が内部で3回リトライ中にクライアントの8秒タイムアウトに当たる
- クライアント側がアボートしても関数側は動き続ける（AbortControllerは関数境界を越えない）
- クライアントが再試行 → 同じ重い処理が再び走る → **GAS側に重複リクエスト**がぶつかる
- 指数バックオフ（クライアント: 1s→2s→最大5s / Netlify: 1s→2s→最大3s）

1コールで失敗が1回挟まると、**8s＋1s＋8s＋2s＋8s ≈ 27秒**まで膨らむ。これがほぼ30秒の正体と見られる。

### 要因4: 起動時に API コールが実質3本、順次実行

**該当箇所**: `src/contexts/KintaiContext.tsx:122-132`, `src/components/KintaiForm.tsx:316-408`

起動直後に走る通信：

| # | 発火源 | 呼び出し | 備考 |
|---|------|---------|------|
| 1 | `KintaiContext` useEffect | `getMonthlyData(year, month)` | GAS |
| 2 | `KintaiForm` useEffect([]) | `getJobWageOptionsFromCsv()` | Google Sheets CSV（独立） |
| 3 | `KintaiForm` useEffect([deferredDate]) | `getKintaiDataByDateApi(today)` | 内部で `getMonthlyData` を再呼び出し |

#3 は `pendingRequests` の重複排除に頼る設計だが、これは「完全に同時に走っている」場合だけ機能する。タイミングずれ（Context が先に解決 → cache 書込前に #3 が走る）があると **GAS を2回叩く**。

CSV 取得（#2）は `fetchWithRetry(csvUrl, ..., 2, 8000)` で **8s × 3回 = 最大24秒**のリトライが入る。Google Sheets の CSV 公開URLも稀にタイムアウトする。

---

## 追加で見つかった問題点

1. **`fetchWithTimeout` の finally 節**（`apiService.ts:94`）: AbortController で abort しているが、`fetch` がすでに解決済みの場合は `reject` が先に呼ばれて無害。ただし二重解決の懸念は残る。
2. **`manualSync` が起動直後に走る**（`App.tsx:103-110`）: `BACKGROUND_SYNC_REQUEST` を受信すると `backgroundSyncManager.manualSync` が走り、内部の `entryStatusManager.syncIncrementalChanges` が呼ばれる。初期化直後のデータ競合リスク。
3. **GAS側 `searchRowByDate` で TextFinder → 失敗時は A列 全件走査**（`kintai.gs:502-518`）: データが年初からしっかり並んでいれば速いが、空行や混在があるとフォールバック経路に入り線形時間。
4. **`version.json` のキャッシュキーがクエリ付きで格納される経路**: SW `fetch` ハンドラで `document` 以外はキャッシュ保存対象（`sw.js:99-115`）。`/version.json?t=...` がキャッシュに何個も溜まる可能性。

---

## 推奨される改善（効果の大きい順）

### 最優先 — 30秒を数秒に縮める効果

1. **SW更新フローを"次回起動で自動適用"方式に変更**
   - 現在の「検知 → 全キャッシュ削除 → フルリロード」は、更新がない普通の起動にも影響しかねない設計。`self.skipWaiting()` + `clients.claim()` は既に入っているので、新SWに制御を渡すだけで十分。`APPLY_UPDATE` の `caches.delete(全部)` をやめて、個別に上書きする。
   - フルリロード（`window.location.reload()`）をやめ、ユーザーに通知してから任意適用にする。
2. **リトライの二重化を解消**
   - クライアント側 or Netlify関数側のどちらか一方だけに統一する。推奨: **Netlify関数側のリトライを削除**し、クライアント側だけに任せる。
   - クライアント側タイムアウトを **15s に延長**（GASコールドスタートを許容）、リトライは**1回のみ**。

### 次点 — 体感改善

3. **`getKintaiDataByDateApi` の廃止、`KintaiContext.monthlyData` から参照する**
   - すでに `KintaiContext` が月次データを持っているので、`getKintaiDataFromMonthlyData` を使えば APIコール#3 は不要。
4. **初回ペイント前のローディングUIを強化**
   - 30秒の間、ユーザーに何が起きているか見えない。スケルトン/プログレス表示を追加。
5. **GAS側の最適化**
   - `findOrCalculateRowByDate` で月初・月末を都度 TextFinder せず、**ヘッダー行 + dayOfYear の計算値**を信頼する（探索を省略）。データシートが年初から連番で並ぶ前提が成立しているなら、確定的に計算できる。
6. **version.json のキャッシュキー統一**
   - SWの `fetch` ハンドラで `?t=` クエリを無視してキャッシュキーを正規化する。

---

## 検証方法（改善実施時）

- Chrome DevTools の **Performance タブ** で PWA 起動を記録し、以下を計測:
  - `navigation start` から `LCP` までの時間
  - `serviceWorker.ready` の解決時間
  - 各 `fetch('/version.json')` と `callGAS('getMonthlyData')` の duration
- Network タブで **Waterfall を確認**し、`getMonthlyData` が何回走っているかをチェック
- 期待値: **改善後は 3〜5秒以内で初期データ表示**

---

## 参考: 該当ファイル

- `src/App.tsx:31-146` — SW登録・更新フロー
- `public/sw.js:30-60, 248-285` — バージョンチェックと適用
- `src/contexts/KintaiContext.tsx:60-132` — 月次データ取得
- `src/components/KintaiForm.tsx:316-408` — 日別データ再取得
- `src/utils/apiService.ts:78-201, 319-443, 529-588` — API層
- `netlify/functions/kintai-api.cjs:45-91` — Netlify関数のリトライ
- `GAS/kintai.gs:534-767` — GAS 月次データ取得処理
