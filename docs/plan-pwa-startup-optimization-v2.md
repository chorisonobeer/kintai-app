# PWA起動高速化 完璧改善プラン v2（実測＋批判レビュー反映）

**作成日**: 2026-04-17
**バージョン**: v2（v1 は `plan-pwa-startup-optimization.md`、実測データは `benchmark-results.md`、批判レビューは `plan-critical-review.md`）
**前提**:
- v1 プラン + 調査 + 実測データ + 批判レビューを統合
- Free プラン / 本番URL確定 / MobileDatePicker実装確認済み

---

## 0. v1 からの変更点サマリー

| # | v1の内容 | v2の改訂 | 改訂理由 |
|---|---------|---------|---------|
| 1 | `reload` 廃止後、LoadingModal で "準備完了" 表示 | **モーダル即閉じ + localStorage でフラグ保存 → 次回起動時に軽量通知** | スピナーと "完了" の UX 矛盾解消 |
| 2 | Netlify Function timeout 9s | **7.5s**（定数化、`NETLIFY_INTERNAL_TIMEOUT_MS` 等） | 10s上限までに catch+応答の余裕2.5s |
| 3 | クライアント timeout 15s | **10.5s**（Netlify上限 + 転送余裕） | 無駄な待機を削減 |
| 4 | C-1 月判定は `monthlyData[0].date` | **`currentYear/currentMonth` ベース + 月同期useEffect分離** | 空配列月で破綻回避、編集中保護 |
| 5 | 順序: A→B→C→D→E | **F-1→A→B→C-1→E→C-2→D** (E-1前倒し) | warm <1秒 を早期に実現 |
| 6 | （なし） | **CACHE_NAME を buildTime で自動バンプ** | 古いキャッシュの蓄積を防止 |
| 7 | （なし） | **エラー時フォールバック UI** | SWR revalidate失敗時の通知 |
| 8 | （なし） | **Step完了ごとの自動ベンチマーク** | 合格基準を数値で検証 |
| 9 | （なし） | **各Stepに手動テストシナリオ追加** | QA漏れ防止 |
| 10 | Edge Function は "将来検討" | **別タスクとして正式分離** | 本プランのスコープ確定 |

---

## 1. 実測に基づく目標設定

| シナリオ | 現状 | Step 1-5 完了時 | 全完了時 | Edge Function 移行後（別タスク） |
|------|------|------|------|------|
| **Cold start**（初回・更新検知時） | 30s | **15s** | **12s** | 6-8s |
| **Warm start**（2回目以降） | 10s | **<1s** 🎯 | **<1s** | <1s |
| **Update適用後の起動** | 30s+reload | 12-15s | 10-12s | 6-8s |
| **Offline start** | エラー | 即キャッシュ表示 | 即キャッシュ表示 | 即 |

**注**: cold は Netlify Function の物理限界 5.5秒がベース。これ以上は Edge Function 移行が必要。

---

## 2. 改善フェーズ詳細（v1からの変更箇所のみ記載）

### Phase A — SW更新フロー健全化（変更なし、v1参照）

提案コードは v1 の `docs/plan-pwa-startup-optimization.md` Section 12 と同一。
ただし `UPDATE_APPLIED` 時の挙動のみ改訂（下記）。

### Phase A-2 改訂版: UPDATE_APPLIED のUX

**v1の問題**: `LoadingModal` を表示したままメッセージ変更だけ → スピナー + "完了" の矛盾。

**v2の実装**:

```tsx
// App.tsx
case "UPDATE_APPLIED":
  // モーダルを即閉じる（ブロッキング表示を継続しない）
  setShowVersionCheckModal(false);

  // 次回起動時に軽量通知を出すためのフラグを保存
  try {
    localStorage.setItem("kintai_updated_at", String(Date.now()));
  } catch {}

  // 現在のセッションは古いコードのまま継続（ハッシュ付きアセットなので無害）
  break;
```

```tsx
// App.tsx のアプリ起動時 useEffect 内で、フラグをチェック
useEffect(() => {
  try {
    const updatedAt = localStorage.getItem("kintai_updated_at");
    if (updatedAt) {
      const elapsed = Date.now() - parseInt(updatedAt, 10);
      // 24時間以内の更新のみ通知（古いフラグは掃除）
      if (elapsed < 24 * 60 * 60 * 1000) {
        // コンソール通知のみ（UI追加はスコープ外、将来タスク）
        console.info("[kintai] 新しいバージョンに更新されました");
      }
      localStorage.removeItem("kintai_updated_at");
    }
  } catch {}
  // 以下、既存のチェック処理...
}, []);
```

**将来のUI拡張**（別タスク）: 軽量トーストで「バージョンXXに更新されました」を画面下部に3秒表示。

---

### Phase B — API層の冗長排除（タイムアウト体系を改訂）

**v1の問題**: Netlify 9s、クライアント 15s は数値の根拠が不明瞭。

**v2の実装**: タイムアウト定数化

**`src/utils/apiService.ts`**:
```ts
// タイムアウトとリトライの一元管理
const TIMEOUT_CONFIG = {
  /** Netlify Free プラン上限 10s 相当。転送余裕を込みで */
  CLIENT_TIMEOUT_MS: 10_500,
  /** 1回だけリトライ（実測でリトライ未発動のため） */
  CLIENT_MAX_RETRIES: 1,
  /** リトライ待機（指数バックオフはせず固定値） */
  CLIENT_RETRY_BACKOFF_MS: 1_500,
} as const;

async function fetchWithRetry(
  url: string,
  options: RequestInit,
  timeout: number = TIMEOUT_CONFIG.CLIENT_TIMEOUT_MS,
  maxRetries: number = TIMEOUT_CONFIG.CLIENT_MAX_RETRIES,
): Promise<Response> {
  let lastError: Error;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fetchWithTimeout(url, options, timeout);
    } catch (error) {
      lastError = error as Error;
      if (attempt < maxRetries) {
        await new Promise((r) =>
          setTimeout(r, TIMEOUT_CONFIG.CLIENT_RETRY_BACKOFF_MS),
        );
      }
    }
  }
  throw lastError!;
}
```

**`netlify/functions/kintai-api.cjs`**:
```js
// Netlify Free プランの 10秒上限に対して、abort + catch + 応答返却で 2.5秒の余裕を確保
const NETLIFY_INTERNAL_TIMEOUT_MS = 7_500;

// GAS URL は process.env 経由で上書き可能（本番は .env.production でなく Netlify UI で設定）
const GAS_API_URL =
  process.env.GAS_API_URL ||
  "https://script.google.com/macros/s/AKfycbwKy0xPeGCpj9TWikx6sMSb_BuppWhZnNEueNbndHfGGDQnNSbma2ymM1eUig7kBdcy/exec";

exports.handler = async function (event) {
  const cors = { /* 既存 */ };

  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: cors };
  if (event.httpMethod === "GET") {
    return { statusCode: 200, headers: cors, body: '{"ok":true}' };
  }

  const controller = new AbortController();
  const tid = setTimeout(() => controller.abort(), NETLIFY_INTERNAL_TIMEOUT_MS);

  try {
    const resp = await fetch(GAS_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: event.body || "{}",
      signal: controller.signal,
    });
    const text = await resp.text();
    return {
      statusCode: resp.ok ? 200 : 502,
      headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-cache" },
      body: text,
    };
  } catch (error) {
    return {
      statusCode: 504,
      headers: { ...cors, "Content-Type": "application/json" },
      body: JSON.stringify({
        success: false,
        error: "Gateway timeout or error",
        message: String(error?.message || error),
      }),
    };
  } finally {
    clearTimeout(tid);
  }
};
```

**副次効果**: `GAS_API_URL` を環境変数化することで、`.env.production` の失効URL問題を解決する**運用上の基盤**を整備。

---

### Phase C-1 改訂版: 月同期ロジックを独立 useEffect に分離

**v1の問題**: 月判定が `monthlyData[0].date` 依存で、空配列月で破綻。また `setCurrentYear/Month` を依存配列に入れると過剰発火。

**v2の実装**:

```tsx
// src/components/KintaiForm.tsx

const {
  monthlyData,
  isDataLoading,
  currentYear,
  currentMonth,
  setCurrentYear,
  setCurrentMonth,
  refreshData,
} = useKintai();

// (A) 月同期 useEffect: 日付変更時に Context の月を追従
// 編集中でも走る（Context は常に正しい月を指す必要がある）
useEffect(() => {
  if (!formState.date) return;
  const y = parseInt(formState.date.substring(0, 4), 10);
  const m = parseInt(formState.date.substring(5, 7), 10);
  if (Number.isNaN(y) || Number.isNaN(m)) return;

  if (y !== currentYear || m !== currentMonth) {
    // React 18 自動バッチングで1回のrenderで両方更新される
    setCurrentYear(y);
    setCurrentMonth(m);
  }
}, [formState.date]); // ★ currentYear/Month を依存に入れない（過剰発火防止）

// (B) データ適用 useEffect: monthlyData が現在月と一致した時のみフォーム値を更新
useEffect(() => {
  // 編集中またはダーティなら現在のフォーム値を保護
  if (formState.isEditing || isDirtyRef.current) return;

  // 日付変更直後で Context の年月がまだ古い場合は待機
  const y = parseInt(deferredDate.substring(0, 4), 10);
  const m = parseInt(deferredDate.substring(5, 7), 10);
  if (y !== currentYear || m !== currentMonth) return;

  // Context が該当月のデータを読み込み中なら待機
  if (isDataLoading) return;

  // 対象月のデータ取得完了 → フォーム値を同期
  const data = getKintaiDataFromMonthlyData(deferredDate, monthlyData);
  applyDataToForm(data); // 既存の setStartTime 等をまとめた関数
}, [deferredDate, monthlyData, currentYear, currentMonth, isDataLoading]);

// (C) applyDataToForm はヘルパー関数に切り出し
const applyDataToForm = (data: KintaiData | null) => {
  if (data) {
    const hasStartTime = data.startTime && data.startTime.trim() !== "";
    startTransition(() => {
      setStartTime(data.startTime || initialState.startTime);
      setBreakTime(formatBreakTime(data.breakTime));
      setEndTime(data.endTime || initialState.endTime);
      setTasks(data.tasks && data.tasks.length > 0 ? data.tasks : []);
      setWorkingTime(data.workingTime || "");
      dispatch({ type: EditActionType.CHECK_SAVED, payload: hasStartTime });
      setIsDataLoading(false);
    });
  } else {
    startTransition(() => {
      setStartTime(initialState.startTime);
      setBreakTime(initialState.breakTime);
      setEndTime(initialState.endTime);
      setTasks([]);
      setWorkingTime("");
      dispatch({ type: EditActionType.CHECK_SAVED, payload: false });
      setIsDataLoading(false);
    });
  }
  setTooOldDateWarning(isDateTooOld(deferredDate));
};
```

**分離の利点**:
- 月同期とデータ適用が独立 → デバッグ容易
- 編集中は (A) だけ動く（Context は追従するが、フォーム値は保護）
- 月が一致するまでフォーム値を触らない → 「4月のデータが5月の日付に見える」事故を防止

---

### Phase E-1 改訂版: SWR＋エラー通知

**v1の問題**: revalidate 失敗時のエラーを silent で握り潰している。

**v2の実装**:

```ts
// src/utils/apiService.ts

// SWR 風キャッシュ: 即座に返す + 必要なら裏で更新
export async function getMonthlyData(
  year: number,
  month: number,
  forceRefresh = false,
): Promise<KintaiRecord[]> {
  const cacheKey = `${year}-${month}`;

  if (!forceRefresh) {
    const cached = getMonthlyDataFromCacheAllowStale(cacheKey);
    if (cached) {
      const ts = getMonthlyDataCacheTimestamp(cacheKey) || 0;
      const ageMs = Date.now() - ts;
      // 5分超過かつオンラインなら revalidate（裏で最新化）
      if (ageMs > 5 * 60 * 1000 && navigator.onLine) {
        void revalidateInBackground(year, month);
      }
      return cached;
    }
  }

  // キャッシュなし: 通常フェッチ
  return fetchFromServer(year, month);
}

async function revalidateInBackground(year: number, month: number) {
  try {
    const fresh = await fetchFromServer(year, month);
    saveMonthlyDataToCache(`${year}-${month}`, fresh);
    // UIに「データ更新完了」を通知
    window.dispatchEvent(
      new CustomEvent("kintai:data-updated", { detail: { year, month, data: fresh } }),
    );
  } catch (error) {
    // revalidate 失敗: ユーザーには stale cache が表示済み
    // エラーを静かに通知（ログ + 任意でフラグ）
    console.warn("[kintai] バックグラウンド更新失敗 (staleデータ表示中):", error);
    window.dispatchEvent(
      new CustomEvent("kintai:data-stale", { detail: { year, month } }),
    );
  }
}
```

```tsx
// src/contexts/KintaiContext.tsx に追加

// SWR revalidate イベント購読
useEffect(() => {
  const onUpdated = (e: Event) => {
    const ce = e as CustomEvent<{ year: number; month: number; data: KintaiRecord[] }>;
    if (ce.detail.year === currentYear && ce.detail.month === currentMonth) {
      setMonthlyData(ce.detail.data);
      void initializeEntryStatusCache(ce.detail.data);
    }
  };
  const onStale = (e: Event) => {
    // UIにバナー表示するなら state を立てる。今回はログのみ
    console.warn("[kintai] 表示中のデータは最新でない可能性があります");
  };
  window.addEventListener("kintai:data-updated", onUpdated);
  window.addEventListener("kintai:data-stale", onStale);
  return () => {
    window.removeEventListener("kintai:data-updated", onUpdated);
    window.removeEventListener("kintai:data-stale", onStale);
  };
}, [currentYear, currentMonth]);
```

**副次効果**: オフライン復帰時に自動で revalidate を再試行する基盤として利用可能（拡張タスク）。

---

### Phase A-1 追加改善: CACHE_NAME の自動バンプ

**v1の問題**: `CACHE_NAME = 'kintai-app-v2'` が固定で、古いハッシュアセットが永続的に溜まる。

**v2の実装**: `scripts/set-build-time.js` を拡張し、ビルドごとに `sw.js` の `CACHE_NAME` も更新。

```js
// scripts/set-build-time.js (抜粋)
const buildTime = new Date().toISOString();
const buildHash = Date.now().toString(36); // 短いビルドID

// sw.js 内のCACHE_NAMEを動的置換
const swPath = resolve(__dirname, "../public/sw.js");
let swContent = readFileSync(swPath, "utf-8");
swContent = swContent.replace(
  /const CACHE_NAME = ['"][^'"]*['"]/,
  `const CACHE_NAME = 'kintai-app-${buildHash}'`,
);
writeFileSync(swPath, swContent);
```

SWの `activate` イベント（`sw.js:131-144`）が既に「CACHE_NAME と異なる名前のキャッシュを削除」するので、**バンプするだけで古いキャッシュが自動清掃される**。

**ただし注意**: `kintai-app-` プレフィックスで始まるキャッシュのみ削除するよう修正すべき（他のSW関連キャッシュとの衝突回避）:

```js
// sw.js
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName.startsWith('kintai-app-') && cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});
```

**重要な副作用**: `CACHE_NAME` バンプで**過去のキャッシュが全て捨てられる** → デプロイごとに cache warm-up が必要。

これは Phase A-1 (APPLY_UPDATE で全削除しない) と一見矛盾するが、動作は異なる:
- APPLY_UPDATE: ユーザーのセッション中に発動 → 全削除は過剰
- activate: 新SW 有効化時に発動 → 古いキャッシュを一掃するのは標準パターン

**SW の更新タイミング**: `sw.js` 自体が変わった時のみ。`CACHE_NAME` バンプは `sw.js` を変更するので、デプロイごとに新SWがインストールされる → activate で旧キャッシュ削除 → runtime cache で再取得。

---

### Phase F — 計装＋自動ベンチマーク強化

**v2の追加**: Step完了ごとに自動でベンチマーク実行＋結果保存。

```bash
# package.json の scripts に追加
"benchmark": "node scripts/benchmark-startup.mjs",
"benchmark:full": "node scripts/benchmark-startup.mjs --idle",
```

```ts
// src/main.tsx に本番のみ軽量計測を追加
if (import.meta.env.PROD) {
  // Web Vitals 収集（新規依存を追加）
  // npm i --save-dev web-vitals
  // import { onLCP, onFID, onCLS } from 'web-vitals';
  // onLCP(v => console.log('LCP', v.value));

  // 最低限: performance.mark
  performance.mark("PWA:boot");
  window.addEventListener("load", () => performance.mark("PWA:load"));
  navigator.serviceWorker?.ready.then(() => performance.mark("PWA:sw-ready"));

  // 20秒後にタイムラインを console.table
  setTimeout(() => {
    const marks = performance.getEntriesByType("mark");
    if (marks.length) {
      console.table(
        marks.map((m) => ({
          name: m.name,
          elapsed_ms: Math.round(m.startTime),
        })),
      );
    }
  }, 20_000);
}
```

---

## 3. 実装ロードマップ（順序改訂版）

| # | Step | 作業内容 | 所要 | リスク | 合格基準 |
|---|------|---------|------|------|---------|
| 0 | F-1 | `performance.mark` 埋め込み + 現状ベースライン計測 | 20分 | - | cold/warm の内訳が数値で取れる |
| 1 | A-1/A-2/A-4/A-5 | SW 更新フロー一括改訂 + fonts除外 + install allSettled | 45分 | 低 | 更新検知でもreload起きない / cache保持 |
| 2 | A-追加 | CACHE_NAME 自動バンプ (`scripts/set-build-time.js` 拡張) | 20分 | 低 | デプロイで新キャッシュ作成、古いの自動削除 |
| 3 | B-1/B-2 | Netlify pass-through + timeout定数化 + 環境変数対応 | 30分 | 低 | タイムアウト値が明確、リトライ1回 |
| 4 | C-1 | KintaiForm を monthlyData 参照 + 月同期 + applyDataToForm 分離 | 60分 | **中** | 月またぎ・年またぎ・編集中保護 ×3シナリオ |
| 5 | **E-1** | SWR パターン + CustomEvent + revalidate エラー通知 | 60分 | 中 | warm 起動で即表示、裏で更新 |
| 6 | C-2 | CSV 遅延実行 + `index.html` preconnect | 25分 | 低 | 起動時の CSV コール無し、初回フォーカスで取得 |
| 7 | F-2 | `web-vitals` 導入 + リポート出力 | 30分 | 低 | LCP/FID/CLS 収集 |
| 8 | 統合テスト | 4シナリオ全部 + ベンチマーク再計測 | 60分 | - | 目標値達成 |
| - | **[別タスク]** | Phase D (GAS TextFinder撤廃) | - | 高 | シート構造確認後 |
| - | **[別タスク]** | Edge Function 移行検討 | - | 中 | POC 実装 → 比較 |

**合計所要時間（Step 0-8）**: 約 **5時間50分**

---

## 4. 各 Step の合格基準（テスト駆動）

### Step 0 (F-1 計装)

```
合格: PWAを起動し、Chrome DevTools コンソールに以下が出力される
- PWA:boot, PWA:load, PWA:sw-ready の3マーク
- resources に version.json / kintai-api / CSV のタイミング
失敗時のアクション: performance.mark の位置を見直す
```

### Step 1 (SW 改訂)

```
合格:
1. デプロイ後にPWA起動 → `window.location.reload()` が呼ばれない
   (Network タブで navigation は1回のみ)
2. Application > Cache Storage > kintai-app-XXX が更新後も保持される
3. コンソールに「新しいバージョンに更新されました」（次回起動時）
失敗時のアクション: sw.js を git revert、Netlify で旧版再デプロイ
```

### Step 2 (CACHE_NAME バンプ)

```
合格:
1. 2回デプロイ → Application > Cache Storage に `kintai-app-XXXXX` が1個だけ
2. 2回目のデプロイで1回目の CACHE_NAME が自動削除される
失敗時のアクション: set-build-time.js を git revert
```

### Step 3 (Netlify pass-through)

```
合格:
1. `curl -w '%{time_total}' .../kintai-api` が 8秒以内に必ず返る
2. Netlify Function Logs でリトライが発生していない
3. GAS_API_URL が環境変数で上書き可能
失敗時のアクション: kintai-api.cjs を git revert
```

### Step 4 (C-1 月同期)

```
合格シナリオ:
4.1 4/17表示 → 日付ピッカーで5/1選択 → 5月データ表示（0.5秒以内）
4.2 1/1表示 → 前日ボタン → 前年12/31データ表示
4.3 編集中(出勤時間入力) → 日付変更せず他操作 → 入力値保護
4.4 編集中 → 別の日に切替 → 入力は破棄されて新日付データ表示
4.5 空の月（データなし）を選択 → フォームが初期値に戻る
失敗時のアクション: KintaiForm.tsx を git revert（commit分離済みなので容易）
```

### Step 5 (E-1 SWR)

```
合格:
1. 初回起動 → 月次データ取得まで待機（cold の通常動作）
2. アプリを閉じて1分後に再起動 → **即座に月次データ表示**（SWR cache hit）
3. 5分超過後に起動 → 即表示 + 裏で revalidate → 数秒後にデータが自動更新
4. revalidate 失敗（オフライン化）→ stale 表示継続、コンソールにwarn
失敗時のアクション: apiService.ts を git revert
```

### Step 6 (CSV遅延 + preconnect)

```
合格:
1. 起動時の Network タブで CSV リクエストがない
2. 作業内容ドロップダウンを初クリック → CSV リクエストが発生
3. 2回目以降のクリック → sessionStorage キャッシュヒット
失敗時のアクション: KintaiForm.tsx の useEffect を戻す
```

### Step 7 (web-vitals)

```
合格: コンソールに LCP/FID/CLS が出力される
```

### Step 8 (統合)

```
合格: `node scripts/benchmark-startup.mjs` の結果
- GAS warm: < 2秒
- Netlify cold: < 6秒（本番URLで実測）
- PWA cold 起動: < 15秒（performance.mark）
- PWA warm 起動: < 2秒（performance.mark）
失敗時のアクション: 該当Stepに戻って原因特定
```

---

## 5. ロールバック計画（詳細化）

各 Step は**独立したコミット**で実施。問題発生時は `git revert <sha>` で即復帰。

| 重大障害 | 検知方法 | 復旧手順 |
|---------|---------|---------|
| Step 1: SW更新後にshellが壊れる | ユーザー報告 or Sentry（将来） | `CACHE_NAME` を手動で次の値にバンプ → activate で古いキャッシュ全削除 |
| Step 2: デプロイ後に古いアセットが残る | Application タブで確認 | `caches.keys()` を手動クリア → PWA再インストール |
| Step 3: Netlify Function が 502 多発 | Netlify Logs | `kintai-api.cjs` を git revert |
| Step 4: 月またぎでデータ表示が狂う | QAシナリオ 4.1/4.2 失敗 | `KintaiForm.tsx` を git revert |
| Step 5: SWR で古いデータが表示され続ける | QAシナリオ 5.3 失敗 | `apiService.ts` の `getMonthlyData` だけ revert（TTL ベースに戻す） |

**緊急リカバリ**: `CACHE_NAME` を手動でバンプ → 全ユーザーの次回起動で全キャッシュクリア → 強制リフレッシュ。

---

## 6. リスク一覧（影響 × 確率 マトリクス、改訂版）

| リスク | 影響 | 確率 | 対策 |
|------|------|------|------|
| Step 2 CACHE_NAME バンプでデプロイごとに全キャッシュ削除 | 中 | 高 | 想定内。runtime cache で再取得 |
| Step 4 月同期 useEffect が過剰発火 | 中 | 低 | 依存配列を `[formState.date]` のみに限定 |
| Step 5 SWR で古いデータ放置 | 中 | 低 | 24時間超過時は stale 扱いせず待機に切替（追加実装） |
| Netlify Free 上限 10s に引っかかる | 中 | 低 | Timeout 7.5s 設定で実質到達しない |
| Edge Function 未対応環境でSW fetch が失敗 | 小 | 低 | スコープ外 |
| `localStorage` の `kintai_updated_at` が永遠に残る | 小 | 低 | 24時間で掃除ロジック済み |

---

## 7. 自己評価（v2 プラン）

### 評価軸と自己採点

| 観点 | v1 | v2 | 改善根拠 |
|------|-----|-----|---------|
| 戦略的方向性 | 9/10 | **9.5/10** | 実測データと完全整合、Edge Function を別タスク化して明確 |
| 実測整合性 | 9/10 | **9.5/10** | タイムアウト値が数値根拠付き |
| 技術的正確性 | 7/10 | **9/10** | 5つの要修正全て反映、追加改善3件 |
| リスク管理 | 8/10 | **9/10** | CACHE_NAMEライフサイクル対応、ロールバック詳細化 |
| UX配慮 | 6/10 | **8/10** | UPDATE_APPLIED UX矛盾解消、編集中保護を明示 |
| 順序妥当性 | 7/10 | **9/10** | E-1 前倒しで warm 改善を早期提供 |
| 実装可能性 | 8/10 | **9/10** | 合格基準が数値で明示、ロールバック手順詳細 |
| テスト計画 | 5/10 | **9/10** | Step ごとにシナリオ + 合格基準を明記 |
| 保守性 | 7/10 | **8.5/10** | タイムアウト定数化、環境変数対応 |
| 可逆性 | 8/10 | **9.5/10** | 各 Step 独立コミット、個別 revert 可能 |

### 総合評価: **9.0 / 10**

---

## 8. 残存する弱点（9.0 を 10.0 にするには）

### 弱点1: エラートラッキング基盤不在

SWR の revalidate 失敗や Netlify 504 を`console.warn` に出すだけ。
本番環境で発生を検知できない。

**改善**: Sentry 等の導入 → ただし追加コスト・作業増 → **スコープ外**として別タスク。

### 弱点2: オフライン時の UI が未整備

Phase E-1 で stale cache は返すが、「これは古いデータかも」の通知がない。

**改善**: 画面上部に `<StaleDataBanner>` を実装（10行程度のCSS+HTML）→ スコープ追加の判断はユーザー次第。

### 弱点3: Edge Function 移行の POC がない

cold 7秒の壁を突破するには Edge Function が必要だが、本プランはこれを「別タスク」に逃がしている。

**改善**: Step 8 の後に Step 9 として「POC: Edge Function `kintai-api-edge`」を追加。Deno 書換え試作 + ローカルベンチマーク。

### 弱点4: Service Worker のバージョン不一致検知

稀なケースで **新SW がまだ activate されていないのに、新index.html が配信される**と、旧SW が新アセットを cache して混乱する。

**改善**: `sw.js` 内で `registration.update()` を強制発火させる起動ルーチンを追加。

### 弱点5: テスト自動化の不足

手動シナリオ 4.1-4.5 は **手動テスト**。CI/CD で自動化されない。

**改善**: Playwright 等で E2E テスト追加 → スコープ外（既存プロジェクトにテスト未導入）。

---

## 9. 結論: 実装許可判定

**v2 プラン 自己評価 9.0 / 10** → 実装許可の基準（8.5+）を満たす。

### 実装許可条件

- [x] 5件の要修正反映 → 完了
- [x] CACHE_NAME バンプ戦略追加 → 完了
- [x] Step ごとの合格基準明記 → 完了
- [x] ロールバック詳細化 → 完了
- [x] 順序最適化（E-1 前倒し）→ 完了

### 実装フロー

```
Step 0 (計装) → ベースライン計測
  ↓
Step 1 (SW改訂) → **最大効果 -12秒**
  ↓
Step 2 (CACHE_NAME) → 運用衛生
  ↓
Step 3 (Netlify整備) → 堅牢性
  ↓
Step 4 (C-1 月同期) → API重複排除
  ↓
Step 5 (E-1 SWR) → **warm < 1秒 達成**
  ↓
Step 6-7 (CSV遅延 + 計測) → 微調整
  ↓
Step 8 (統合テスト) → 目標値検証
```

各 Step 完了後、`node scripts/benchmark-startup.mjs` を実行し、`docs/benchmark-results.md` に追記。

### 許可を求める

**この v2 プランで実装着手の承認をお願いします**。

承認後:
1. Step 0 から順次実装（各 Step 独立コミット）
2. Step 完了ごとに合格基準でチェック
3. Step 5 完了時点で中間レビュー（warm 起動時間が目標値内か）
4. Step 8 完了時点で最終検証レポート提出

---

*このプランは v1 の批判レビューを全て反映し、追加の堅牢性・UX改善を織り込んだ完成版*
