/**  src/utils/apiService.ts                              ${new Date().getFullYear()}‑${String(new Date().getMonth() + 1).padStart(2, '0')}‑${String(new Date().getDate()).padStart(2, '0')}-vX
 *  ──────────────────────────────────────────────────────────
 *  - login / logout / saveKintai / getHistory / getMonthlyData
 *  - getKintaiDataByDate (特定日の勤怠データ取得) <--- 修正: 時刻と休憩時間の形式を整形
 *  - DEBUG_MODE で GAS 内部 debug を受信
 *  - strictNullChecks/noImplicitAny すべてエラー 0 を確認
 *  - 月間データ取得機能追加
 *  - 勤務場所対応追加
 *  ──────────────────────────────────────────────────────────
 */

import { KintaiData, KintaiRecord } from "../types";

/* ========= 定数 ========= */
// dev/prod 共通で Netlify Function 経由。netlify dev (port 8888) で同パスが解決される。
const FUNC_URL = "/.netlify/functions/kintai-api";
const AUTH_LOGIN_URL = "/.netlify/functions/auth-login";

// デバッグ用ログ
// API Service 初期化

const TOKEN_KEY = "kintai_token";
const USER_ID_KEY = "kintai_user_id";
const USER_NAME_KEY = "kintai_user_name";
const SHEET_ID_KEY = "kintai_spreadsheet_id";

// 月間データをセッションストレージに保存するためのキー
const MONTHLY_DATA_KEY = "kintai_monthly_data";
const MONTHLY_DATA_TIMESTAMP_KEY = "kintai_monthly_data_timestamp";

/* 開発時の可視化フラグ */
const DEBUG_MODE = true;

/* ========= 共通型 ========= */
interface ApiOk<T = unknown> {
  success?: true;
  ok?: true;
  token?: string;
  userId?: string;
  userName?: string;
  spreadsheetId?: string;
  data?: T;
  debug?: unknown;
  version?: string;
}

interface ApiErr {
  success?: false;
  ok?: false;
  error?: string;
  err?: string;
  debug?: unknown;
  version?: string;
}

type ApiResp<T = unknown> = ApiOk<T> | ApiErr;

/* ========= バージョン関連型 ========= */
export interface VersionInfo {
  version: string;
  timestamp: string;
  description: string;
}

export interface VersionHistoryItem {
  version: string;
  date: string;
  description: string;
}

/* ========= fetch ラッパ ========= */
// リクエスト重複防止のためのキャッシュ
const pendingRequests = new Map<string, Promise<ApiOk<any>>>();

/**
 * タイムアウト・リトライ設定（一元管理）
 * - Netlify Free プラン上限 10s、転送余裕込みで 10.5s
 * - Netlify Function 側で 7.5s で abort するので、実質 10.5s まで待つのは abnormal 検出用
 * - リトライは 1回のみ（実測でリトライ未発動、念のため残す）
 */
const TIMEOUT_CONFIG: {
  CLIENT_TIMEOUT_MS: number;
  CLIENT_MAX_RETRIES: number;
  CLIENT_RETRY_BACKOFF_MS: number;
} = {
  /** クライアントの fetch タイムアウト */
  CLIENT_TIMEOUT_MS: 10_500,
  /** リトライ最大回数（本リクエスト + リトライ1回 = 最大2回試行） */
  CLIENT_MAX_RETRIES: 1,
  /** リトライ待機（固定、指数バックオフ廃止） */
  CLIENT_RETRY_BACKOFF_MS: 1_500,
};

// タイムアウト付きfetch関数
function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeout = TIMEOUT_CONFIG.CLIENT_TIMEOUT_MS,
): Promise<Response> {
  return new Promise((resolve, reject) => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
      reject(new Error(`Request timeout after ${timeout}ms`));
    }, timeout);

    fetch(url, { ...options, signal: controller.signal })
      .then(resolve)
      .catch(reject)
      .finally(() => clearTimeout(timeoutId));
  });
}

// リトライ付きfetch関数（リトライ 1回のみ、固定待機）
// maxRetries/timeout を number として明示（as const のリテラル型伝播を回避）
async function fetchWithRetry(
  url: string,
  options: RequestInit,
  maxRetries: number = TIMEOUT_CONFIG.CLIENT_MAX_RETRIES,
  timeout: number = TIMEOUT_CONFIG.CLIENT_TIMEOUT_MS,
): Promise<Response> {
  let lastError: Error;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetchWithTimeout(url, options, timeout);
      return response;
    } catch (error) {
      lastError = error as Error;
      if (attempt < maxRetries) {
        await new Promise((resolve) =>
          setTimeout(resolve, TIMEOUT_CONFIG.CLIENT_RETRY_BACKOFF_MS),
        );
      }
    }
  }

  throw lastError!;
}

async function callGAS<T = unknown>(
  action: string,
  payload: object = {},
  withToken = false,
): Promise<ApiOk<T>> {
  // callGAS 実行

  const body: Record<string, unknown> = { action, payload };
  if (withToken) body.token = localStorage.getItem(TOKEN_KEY);
  if (DEBUG_MODE) body.debug = true;

  // リクエストの重複チェック用キー
  const requestKey = `${action}-${JSON.stringify(payload)}-${withToken}`;

  // 同じリクエストが進行中の場合は待機
  if (pendingRequests.has(requestKey)) {
    // 重複リクエスト検出
    return pendingRequests.get(requestKey)!;
  }

  const fetchOptions: RequestInit = {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: JSON.stringify(body),
  };

  // リクエストをキャッシュに追加
  const requestPromise = (async (): Promise<ApiOk<T>> => {
    try {
      // dev/prod 共通で Netlify Function を経由（netlify dev で /.netlify/functions/* が
      // 解決される）。/api/gas プロキシ経由は GAS の 302 リダイレクトで CORS/CSP が
      // 不安定になるため使わない。
      const apiUrl = FUNC_URL;
      // API呼び出し中（タイムアウト・リトライは TIMEOUT_CONFIG で一元管理）
      const res = await fetchWithRetry(apiUrl, fetchOptions);

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }

      const json = (await res.json()) as ApiResp<T>;
      // API レスポンス受信

      // バージョン情報をローカルストレージに保存
      if (json.version) {
        localStorage.setItem("kintai_server_version", json.version);
      }

      /* ---------- 型安全にエラーチェック ---------- */
      const okFlag =
        (json as ApiOk<T>).success === true || (json as ApiOk<T>).ok === true;
      if (!okFlag) {
        const msg =
          typeof (json as ApiErr).error === "string"
            ? (json as ApiErr).error
            : typeof (json as ApiErr).err === "string"
              ? (json as ApiErr).err
              : "API error";
        throw new Error(msg);
      }

      return json as ApiOk<T>;
    } catch (error) {
      // API呼び出しエラー
      throw error;
    } finally {
      // リクエストキャッシュから削除
      pendingRequests.delete(requestKey);
    }
  })();

  // リクエストをキャッシュに追加
  pendingRequests.set(requestKey, requestPromise);

  return requestPromise;
}

/* ========= login ========= */
export async function login(
  name: string,
  password: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    // ログイン前に既存のlocalStorageを完全にクリア
    // ログイン処理開始

    // 既存の認証情報を完全にクリア
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_ID_KEY);
    localStorage.removeItem(USER_NAME_KEY);
    localStorage.removeItem(SHEET_ID_KEY);

    // セッションキャッシュもクリア
    sessionStorage.removeItem(MONTHLY_DATA_KEY);
    sessionStorage.removeItem(MONTHLY_DATA_TIMESTAMP_KEY);
    // 時給マスタキャッシュもクリア（旧 CSV 経路と新 GAS 経路の両方）
    sessionStorage.removeItem("job_wage_options");
    sessionStorage.removeItem("job_wage_options_ts");
    sessionStorage.removeItem("job_wage_options_v2");
    sessionStorage.removeItem("job_wage_options_v2_ts");
    clearMonthlyDataCache();

    // 既存データクリア完了

    // Phase 3: GAS 経由ではなく Netlify Function 直叩きで認証
    //   - メンバーリストを SA で読込 → 名前+パスワード照合 → HMAC token 発行
    //   - GAS 側 Auth.checkToken も同 HMAC 鍵で token を検証可能（Phase 3 GAS 更新）
    const res = await fetch(AUTH_LOGIN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, password }),
    });

    let r: {
      ok: boolean;
      err?: string;
      token?: string;
      userId?: string;
      userName?: string;
      spreadsheetId?: string;
    };
    try {
      r = await res.json();
    } catch {
      return {
        success: false,
        error: `認証サーバーから不正な応答 (HTTP ${res.status})`,
      };
    }

    if (!res.ok || !r.ok) {
      return {
        success: false,
        error: r.err || `認証に失敗 (HTTP ${res.status})`,
      };
    }

    if (!r.token || !r.userId || !r.userName || !r.spreadsheetId) {
      return {
        success: false,
        error: "認証応答に必須フィールドが欠落しています",
      };
    }

    // 新しい認証情報を保存
    localStorage.setItem(TOKEN_KEY, r.token);
    localStorage.setItem(USER_ID_KEY, r.userId);
    localStorage.setItem(USER_NAME_KEY, r.userName);
    localStorage.setItem(SHEET_ID_KEY, r.spreadsheetId);

    return { success: true };
  } catch (e) {
    return { success: false, error: (e as Error).message };
  }
}

/* ========= logout ========= */
export async function logout(): Promise<void> {
  try {
    await callGAS("logout", {}, true);
  } finally {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_ID_KEY);
    localStorage.removeItem(USER_NAME_KEY);
    localStorage.removeItem(SHEET_ID_KEY);

    // 月間データのキャッシュもクリア
    sessionStorage.removeItem(MONTHLY_DATA_KEY);
    sessionStorage.removeItem(MONTHLY_DATA_TIMESTAMP_KEY);
  }
}

/* ========= saveKintai (旧 API、互換のため残す) ========= */
/**
 * 同期保存（旧 API）。新規呼び出しは enqueueSave を推奨。
 * v12: 全月キャッシュ削除を廃止、該当月のみ invalidate に変更（SWR 破壊回避）
 */
export async function saveKintaiToServer(
  data: KintaiData,
): Promise<{ success: boolean; error?: string }> {
  const token = localStorage.getItem(TOKEN_KEY);
  const spreadsheetId = localStorage.getItem(SHEET_ID_KEY);
  const userId = localStorage.getItem(USER_ID_KEY);

  if (!token || !spreadsheetId || !userId) {
    return { success: false, error: "ログイン情報が不足しています" };
  }

  try {
    await callGAS(
      "saveKintai",
      {
        date: data.date,
        startTime: data.startTime,
        breakTime: data.breakTime,
        endTime: data.endTime,
        location: data.location || "",
        tasks: data.tasks || [],
        spreadsheetId,
        userId,
      },
      true,
    );

    // 該当月のみ invalidate（旧来の全月削除は SWR を破壊するため廃止）
    invalidateMonthCache(data.date);

    return { success: true };
  } catch (e) {
    return { success: false, error: (e as Error).message };
  }
}

/* ========= 楽観的更新（saveKintai 新 API） ========= */

const PENDING_QUEUE_KEY = "pending_kintai_saves_v1";
const PENDING_QUEUE_MAX = 100;

export interface PendingSaveEntry {
  id: string;
  userId: string;
  spreadsheetId: string;
  data: KintaiData;
  rollback: KintaiRecord | null; // 適用直前の値、無ければ null（新規）
  cacheKey: string; // `${year}-${month}`
  attempts: number;
  enqueuedAt: number;
  status: "pending" | "in_flight" | "failed";
}

let isFlushing = false;

function readPendingQueue(): PendingSaveEntry[] {
  try {
    const raw = localStorage.getItem(PENDING_QUEUE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as PendingSaveEntry[]) : [];
  } catch {
    return [];
  }
}

function writePendingQueue(queue: PendingSaveEntry[]): void {
  try {
    localStorage.setItem(PENDING_QUEUE_KEY, JSON.stringify(queue));
  } catch {
    /* localStorage 容量超過等は無視 */
  }
}

function dateToCacheKey(dateYYYYMMDD: string): string {
  // "2026-05-07" → "2026-5"
  const m = dateYYYYMMDD.match(/^(\d{4})-(\d{1,2})/);
  if (!m) return "";
  return `${parseInt(m[1], 10)}-${parseInt(m[2], 10)}`;
}

function invalidateMonthCache(dateYYYYMMDD: string): void {
  try {
    const cacheKey = dateToCacheKey(dateYYYYMMDD);
    if (!cacheKey) return;
    sessionStorage.removeItem(`${MONTHLY_DATA_TIMESTAMP_KEY}_${cacheKey}`);
    // データ自体は残す（楽観値のため）。次回 getMonthlyData で age=null → cold fetch
  } catch {
    /* ignore */
  }
}

function getCacheMap(): Record<string, KintaiRecord[]> {
  try {
    const raw = sessionStorage.getItem(MONTHLY_DATA_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function setCacheForMonth(cacheKey: string, records: KintaiRecord[]): void {
  try {
    const map = getCacheMap();
    map[cacheKey] = records;
    sessionStorage.setItem(MONTHLY_DATA_KEY, JSON.stringify(map));
    // タイムスタンプは更新しない（楽観値は revalidate 対象、age=null → 即 fetch 可）
  } catch {
    /* ignore */
  }
}

/**
 * 楽観値を sessionStorage cache に適用し、適用直前の値を entry.rollback に保存。
 * - cache 不在時は新規 cache を作成
 * - delete (全フィールド空 + tasks=[]) は array から remove
 * - タイムスタンプは更新しない（revalidate を促すため）
 */
function applyOptimisticToCache(entry: PendingSaveEntry): void {
  const map = getCacheMap();
  const list = Array.isArray(map[entry.cacheKey]) ? map[entry.cacheKey] : [];
  const idx = list.findIndex((r) => r.date === entry.data.date);

  // rollback 用に適用直前の値を記録
  entry.rollback = idx >= 0 ? { ...list[idx] } : null;

  const isDelete =
    !entry.data.startTime &&
    !entry.data.endTime &&
    (!entry.data.tasks || entry.data.tasks.length === 0) &&
    (!entry.data.location || entry.data.location.trim() === "");

  let next = list.slice();
  if (isDelete) {
    if (idx >= 0) next.splice(idx, 1);
  } else {
    const optimisticRecord: KintaiRecord = {
      date: entry.data.date,
      userName: list[idx]?.userName || "",
      userId: entry.userId,
      startTime: entry.data.startTime,
      breakTime: entry.data.breakTime,
      endTime: entry.data.endTime,
      workingTime: entry.data.workingTime || list[idx]?.workingTime || "",
      location: entry.data.location || "",
      tasks: entry.data.tasks || [],
    };
    if (idx >= 0) {
      next[idx] = optimisticRecord;
    } else {
      next.push(optimisticRecord);
      next.sort((a, b) => a.date.localeCompare(b.date));
    }
  }
  setCacheForMonth(entry.cacheKey, next);
}

/**
 * rollback: 適用直前の値で復元。
 * - rollback あり → record を rollback で置換
 * - rollback null → array から remove
 */
function applyRollbackToCache(entry: PendingSaveEntry): void {
  const map = getCacheMap();
  const list = Array.isArray(map[entry.cacheKey]) ? map[entry.cacheKey] : [];
  const idx = list.findIndex((r) => r.date === entry.data.date);
  const next = list.slice();
  if (entry.rollback) {
    if (idx >= 0) next[idx] = entry.rollback;
    else {
      next.push(entry.rollback);
      next.sort((a, b) => a.date.localeCompare(b.date));
    }
  } else {
    if (idx >= 0) next.splice(idx, 1);
  }
  setCacheForMonth(entry.cacheKey, next);
}

/**
 * revalidate 完了時、サーバ確定値に queue 内 pending を再 apply して merge した array を返す。
 * 同月の pending entry が複数ある場合は enqueue 順に上書き適用（FIFO）。
 */
export function overlayPendingOnto(
  serverData: KintaiRecord[],
  year: number,
  month: number,
): KintaiRecord[] {
  const cacheKey = `${year}-${month}`;
  const queue = readPendingQueue().filter((e) => e.cacheKey === cacheKey);
  if (queue.length === 0) return serverData;

  let merged = serverData.slice();
  for (const entry of queue) {
    const idx = merged.findIndex((r) => r.date === entry.data.date);
    const isDelete =
      !entry.data.startTime &&
      !entry.data.endTime &&
      (!entry.data.tasks || entry.data.tasks.length === 0) &&
      (!entry.data.location || entry.data.location.trim() === "");
    if (isDelete) {
      if (idx >= 0) merged.splice(idx, 1);
      continue;
    }
    const optimistic: KintaiRecord = {
      date: entry.data.date,
      userName: merged[idx]?.userName || "",
      userId: entry.userId,
      startTime: entry.data.startTime,
      breakTime: entry.data.breakTime,
      endTime: entry.data.endTime,
      workingTime: entry.data.workingTime || merged[idx]?.workingTime || "",
      location: entry.data.location || "",
      tasks: entry.data.tasks || [],
    };
    if (idx >= 0) merged[idx] = optimistic;
    else {
      merged.push(optimistic);
      merged.sort((a, b) => a.date.localeCompare(b.date));
    }
  }
  return merged;
}

/**
 * 楽観的保存: 即時 cache & UI 更新 + 裏で送信。
 * 失敗時は applyRollbackToCache + kintai:save-failed イベント発火。
 */
export function enqueueSave(data: KintaiData): {
  success: boolean;
  error?: string;
} {
  const token = localStorage.getItem(TOKEN_KEY);
  const spreadsheetId = localStorage.getItem(SHEET_ID_KEY);
  const userId = localStorage.getItem(USER_ID_KEY);

  if (!token || !spreadsheetId || !userId) {
    return { success: false, error: "ログイン情報が不足しています" };
  }

  const cacheKey = dateToCacheKey(data.date);
  if (!cacheKey) {
    return { success: false, error: "日付形式が不正です" };
  }

  const entry: PendingSaveEntry = {
    id:
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    userId,
    spreadsheetId,
    data,
    rollback: null,
    cacheKey,
    attempts: 0,
    enqueuedAt: Date.now(),
    status: "pending",
  };

  // 楽観 cache 適用（rollback フィールドが entry に書き込まれる）
  applyOptimisticToCache(entry);

  // queue 追加 + 容量制御
  const queue = readPendingQueue();
  queue.push(entry);
  while (queue.length > PENDING_QUEUE_MAX) queue.shift();
  writePendingQueue(queue);

  // UI 即時通知（Context が monthlyData を再構築）
  const [yearStr, monthStr] = cacheKey.split("-");
  window.dispatchEvent(
    new CustomEvent("kintai:save-optimistic", {
      detail: {
        year: parseInt(yearStr, 10),
        month: parseInt(monthStr, 10),
        date: data.date,
      },
    }),
  );

  // 裏で送信開始（fire-and-forget）
  void flushSaveQueue();

  return { success: true };
}

/**
 * queue を FIFO で送信。同時実行排他制御 + ユーザー一致チェック。
 * 失敗時は 1 回 retry、再失敗で rollback + イベント発火。
 */
export async function flushSaveQueue(): Promise<void> {
  if (isFlushing) return;
  isFlushing = true;
  try {
    const currentUserId = localStorage.getItem(USER_ID_KEY);
    const currentSheet = localStorage.getItem(SHEET_ID_KEY);
    const token = localStorage.getItem(TOKEN_KEY);
    if (!currentUserId || !currentSheet || !token) return;

    while (true) {
      const queue = readPendingQueue();
      // 現在ユーザーと一致する pending entry を先頭から拾う
      const idx = queue.findIndex(
        (e) =>
          e.status !== "failed" &&
          e.userId === currentUserId &&
          e.spreadsheetId === currentSheet,
      );
      if (idx < 0) break;

      const entry = queue[idx];
      entry.status = "in_flight";
      entry.attempts += 1;
      writePendingQueue(queue);

      try {
        await callGAS(
          "saveKintai",
          {
            date: entry.data.date,
            startTime: entry.data.startTime,
            breakTime: entry.data.breakTime,
            endTime: entry.data.endTime,
            location: entry.data.location || "",
            tasks: entry.data.tasks || [],
            spreadsheetId: entry.spreadsheetId,
            userId: entry.userId,
          },
          true,
        );

        // 成功: queue から remove。cache 楽観値はそのままサーバ確定値と一致。
        const after = readPendingQueue().filter((e) => e.id !== entry.id);
        writePendingQueue(after);

        // 次回 getMonthlyData でサーバ最新を取り込めるよう該当月 invalidate
        invalidateMonthCache(entry.data.date);

        const [y, m] = entry.cacheKey.split("-");
        window.dispatchEvent(
          new CustomEvent("kintai:save-confirmed", {
            detail: {
              year: parseInt(y, 10),
              month: parseInt(m, 10),
              date: entry.data.date,
            },
          }),
        );
      } catch (err) {
        const msg = (err as Error)?.message || String(err);
        if (entry.attempts < 2) {
          // 1 回 retry: queue の先頭を pending に戻して次ループで再送
          const after = readPendingQueue();
          const eIdx = after.findIndex((e) => e.id === entry.id);
          if (eIdx >= 0) {
            after[eIdx].status = "pending";
            writePendingQueue(after);
          }
          // backoff
          await new Promise((resolve) => setTimeout(resolve, 1500));
          continue;
        }
        // 再失敗: rollback + failed マーク + イベント発火
        applyRollbackToCache(entry);
        const after = readPendingQueue();
        const eIdx2 = after.findIndex((e) => e.id === entry.id);
        if (eIdx2 >= 0) {
          after[eIdx2].status = "failed";
          writePendingQueue(after);
        }
        const [y, m] = entry.cacheKey.split("-");
        window.dispatchEvent(
          new CustomEvent("kintai:save-failed", {
            detail: {
              year: parseInt(y, 10),
              month: parseInt(m, 10),
              date: entry.data.date,
              error: msg,
              entryId: entry.id,
            },
          }),
        );
        // 失敗エントリは queue に残す（手動 retry / 起動時再送の対象外）
        break;
      }
    }
  } finally {
    isFlushing = false;
  }
}

/**
 * App 起動時に呼ぶ: localStorage の queue をチェックして未送信があれば送信開始。
 * online イベントでも flushSaveQueue が走るよう listener を登録。
 */
export function initPendingSaveQueue(): void {
  // online 復帰時に再送
  if (typeof window !== "undefined") {
    window.addEventListener("online", () => {
      void flushSaveQueue();
    });
    // 起動時: 失敗マークでないものを再送
    const queue = readPendingQueue();
    if (queue.some((e) => e.status !== "failed")) {
      void flushSaveQueue();
    }
  }
}

/**
 * 失敗エントリの手動 retry（UI から呼ぶ用）。
 */
export function retryFailedSave(entryId: string): void {
  const queue = readPendingQueue();
  const idx = queue.findIndex((e) => e.id === entryId);
  if (idx < 0) return;
  queue[idx].status = "pending";
  queue[idx].attempts = 0;
  writePendingQueue(queue);
  void flushSaveQueue();
}

/* ========= getHistory ========= */
export async function getKintaiHistory(
  year: number,
  month: number,
): Promise<KintaiRecord[]> {
  const token = localStorage.getItem(TOKEN_KEY);
  const spreadsheetId = localStorage.getItem(SHEET_ID_KEY);
  const userId = localStorage.getItem(USER_ID_KEY);

  if (!token || !spreadsheetId || !userId) {
    throw new Error("認証情報が不足しています");
  }

  const r = await callGAS<KintaiRecord[]>(
    "getHistory",
    { spreadsheetId, userId, year, month },
    true,
  );
  return r.data as KintaiRecord[];
}

/* ========= getMonthlyData (SWR: Stale-While-Revalidate) ========= */
/**
 * Phase E-1: SWR パターン
 * - 5分以内のキャッシュはそのまま返す（旧来の30分TTLと挙動同じ）
 * - 5分超過でも stale cache を即返す → 裏で revalidate（ネットワーク最新化）
 * - 裏タスクの成功: CustomEvent('kintai:data-updated') を発火 → UIが自動更新
 * - 裏タスクの失敗: CustomEvent('kintai:data-stale') を発火 → UIが stale 警告
 * - forceRefresh=true の場合は必ず同期フェッチ（ユーザー明示リフレッシュ）
 */
const SWR_FRESH_THRESHOLD_MS = 5 * 60 * 1000; // 5分以内はキャッシュのみ
const SWR_STALE_THRESHOLD_MS = 24 * 60 * 60 * 1000; // 24時間超過は stale扱いせず必ず待機

export async function getMonthlyData(
  year: number,
  month: number,
  forceRefresh = false,
): Promise<KintaiRecord[]> {
  const token = localStorage.getItem(TOKEN_KEY);
  const spreadsheetId = localStorage.getItem(SHEET_ID_KEY);
  const userId = localStorage.getItem(USER_ID_KEY);

  if (!token || !spreadsheetId || !userId) {
    throw new Error("認証情報が不足しています");
  }

  const cacheKey = `${year}-${month}`;

  // 強制更新でなければキャッシュ判定
  if (!forceRefresh) {
    const cached = getMonthlyDataFromCacheAllowStale(cacheKey);
    if (cached) {
      const age = getMonthlyDataCacheAge(cacheKey);
      // 24時間超過: stale すぎるので即座にはキャッシュを使わず通常フェッチ
      if (age !== null && age < SWR_STALE_THRESHOLD_MS) {
        // 5分超過 かつ オンライン なら裏で revalidate
        if (age > SWR_FRESH_THRESHOLD_MS && navigator.onLine) {
          void revalidateMonthlyDataInBackground(
            year,
            month,
            spreadsheetId,
            userId,
          );
        }
        return cached;
      }
    }
  }

  // キャッシュなし / 24h超過 / forceRefresh: 通常フェッチ
  return fetchMonthlyDataFromServer(year, month, spreadsheetId, userId);
}

// サーバーから月次データを取得して正規化＋キャッシュ保存
async function fetchMonthlyDataFromServer(
  year: number,
  month: number,
  spreadsheetId: string,
  userId: string,
): Promise<KintaiRecord[]> {
  const r = await callGAS<KintaiRecord[]>(
    "getMonthlyData",
    { spreadsheetId, userId, year, month },
    true,
  );

  // 正規化ヘルパー
  const normalizeBreak = (bt: any): string => {
    if (bt === undefined || bt === null || bt === "") return "00:00";
    if (typeof bt === "string") {
      const m = bt.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
      if (m) return `${m[1].padStart(2, "0")}:${m[2].padStart(2, "0")}`;
      const asNum = parseInt(bt, 10);
      if (!Number.isNaN(asNum) && asNum >= 0) {
        const h = Math.floor(asNum / 60);
        const mm = asNum % 60;
        return `${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
      }
      // 文字列中のHH:mm抽出
      const anyM = bt.match(/(\d{1,2}):(\d{2})/);
      if (anyM)
        return `${anyM[1].padStart(2, "0")}:${anyM[2].padStart(2, "0")}`;
      return "00:00";
    }
    if (typeof bt === "number" && bt >= 0) {
      const h = Math.floor(bt / 60);
      const mm = bt % 60;
      return `${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
    }
    return "00:00";
  };

  const normalizeWork = (wt: any): string => {
    if (!wt) return "";
    if (typeof wt === "string") {
      // 既にHH:mm
      const hhmm = wt.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
      if (hhmm)
        return `${hhmm[1].padStart(2, "0")}:${hhmm[2].padStart(2, "0")}`;
      // ISO(T/Z)
      if (wt.includes("T") && wt.includes("Z")) {
        const d = new Date(wt);
        if (!Number.isNaN(d.getTime())) {
          return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
        }
      }
      // 8.5h / 8h
      const hourMatch = wt.match(/^(\d+)(?:\.(\d+))?h?$/);
      if (hourMatch) {
        const h = parseInt(hourMatch[1], 10);
        const dec = hourMatch[2] ? parseFloat(`0.${hourMatch[2]}`) : 0;
        const total = h * 60 + Math.round(dec * 60);
        const hh = Math.floor(total / 60);
        const mm = total % 60;
        return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
      }
      // 数値文字列（分）
      const asNum = parseInt(wt, 10);
      if (!Number.isNaN(asNum) && asNum >= 0) {
        const hh = Math.floor(asNum / 60);
        const mm = asNum % 60;
        return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
      }
      // 任意の文字列からHH:mm抽出
      const anyM = wt.match(/(\d{1,2}):(\d{2})/);
      if (anyM)
        return `${anyM[1].padStart(2, "0")}:${anyM[2].padStart(2, "0")}`;
      return wt;
    }
    if (typeof wt === "number" && wt >= 0) {
      const hh = Math.floor(wt / 60);
      const mm = wt % 60;
      return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
    }
    return "";
  };

  const raw = (r.data as KintaiRecord[]) || [];
  const normalized = raw.map((rec) => ({
    ...rec,
    startTime: extractHHMM(rec.startTime),
    endTime: extractHHMM(rec.endTime),
    breakTime: normalizeBreak(rec.breakTime),
    workingTime: normalizeWork(rec.workingTime),
    tasks: rec.tasks || [],
  }));

  // キャッシュに保存
  saveMonthlyDataToCache(`${year}-${month}`, normalized);

  return normalized;
}

// 裏で revalidate（SWR パターン）
async function revalidateMonthlyDataInBackground(
  year: number,
  month: number,
  spreadsheetId: string,
  userId: string,
): Promise<void> {
  try {
    const fresh = await fetchMonthlyDataFromServer(
      year,
      month,
      spreadsheetId,
      userId,
    );
    // UI に通知（KintaiContext が購読してフォーム/月次ビューを更新）
    window.dispatchEvent(
      new CustomEvent("kintai:data-updated", {
        detail: { year, month, data: fresh },
      }),
    );
  } catch (error) {
    // revalidate 失敗: stale cache は既にUIに表示済み。サイレントに通知
    // eslint-disable-next-line no-console
    console.warn(
      "[kintai] バックグラウンド更新失敗（表示中のデータは古い可能性あり）:",
      error,
    );
    window.dispatchEvent(
      new CustomEvent("kintai:data-stale", {
        detail: { year, month },
      }),
    );
  }
}

/* ========= 月間データキャッシュユーティリティ（SWR対応） ========= */

/**
 * Phase E-1 SWR: TTLを無視して生のキャッシュを返す
 * 返却後、呼び出し側が getMonthlyDataCacheAge() で年齢を確認して revalidate を判断する
 */
function getMonthlyDataFromCacheAllowStale(
  cacheKey: string,
): KintaiRecord[] | null {
  try {
    const cachedDataJson = sessionStorage.getItem(MONTHLY_DATA_KEY);
    if (!cachedDataJson) return null;

    const cachedDataMap = JSON.parse(cachedDataJson);
    const cachedData = cachedDataMap[cacheKey];
    if (!cachedData) return null;

    return cachedData;
  } catch {
    return null;
  }
}

/**
 * キャッシュの経過時間（ms）を返す。なければ null。
 */
function getMonthlyDataCacheAge(cacheKey: string): number | null {
  try {
    const timestamp = parseInt(
      sessionStorage.getItem(`${MONTHLY_DATA_TIMESTAMP_KEY}_${cacheKey}`) ||
        "0",
      10,
    );
    if (!timestamp) return null;
    return Date.now() - timestamp;
  } catch {
    return null;
  }
}

// キャッシュに月間データを保存
function saveMonthlyDataToCache(cacheKey: string, data: KintaiRecord[]): void {
  try {
    // 既存のキャッシュを取得
    const cachedDataJson = sessionStorage.getItem(MONTHLY_DATA_KEY);
    const cachedDataMap = cachedDataJson ? JSON.parse(cachedDataJson) : {};

    // 新しいデータを追加
    cachedDataMap[cacheKey] = data;

    // キャッシュを保存
    sessionStorage.setItem(MONTHLY_DATA_KEY, JSON.stringify(cachedDataMap));
    sessionStorage.setItem(
      `${MONTHLY_DATA_TIMESTAMP_KEY}_${cacheKey}`,
      Date.now().toString(),
    );
  } catch (e) {
    // キャッシュ保存エラーは無視
  }
}

// 月間データキャッシュをクリア
export function clearMonthlyDataCache(): void {
  try {
    sessionStorage.removeItem(MONTHLY_DATA_KEY);

    // タイムスタンプキーもクリア
    const keys = [];
    for (let i = 0; i < sessionStorage.length; i += 1) {
      const key = sessionStorage.key(i);
      if (key && key.startsWith(MONTHLY_DATA_TIMESTAMP_KEY)) {
        keys.push(key);
      }
    }

    keys.forEach((key) => sessionStorage.removeItem(key));
  } catch (e) {
    // キャッシュクリアエラーは無視
  }
}

/* ========= getKintaiDataByDate ========= */
/**  src/utils/apiService.ts                              ${new Date().getFullYear()}‑${String(new Date().getMonth() + 1).padStart(2, '0')}‑${String(new Date().getDate()).padStart(2, '0')}-vX
 *  ──────────────────────────────────────────────────────────
 *  - login / logout / saveKintai / getHistory / getMonthlyData
 *  - getKintaiDataByDate (特定日の勤怠データ取得) <--- 修正: 時刻と休憩時間の形式を整形
 *  - DEBUG_MODE で GAS 内部 debug を受信
 *  - strictNullChecks/noImplicitAny すべてエラー 0 を確認
 *  - 月間データ取得機能追加
 *  - 勤務場所対応追加
 *  ──────────────────────────────────────────────────────────
 */
/**
 * 時給マスタ（仕事内容・時給）を GAS 経由で取得。
 * v12: 公開 CSV 直叩き廃止 → GAS の handleGetJobWageOptions を呼ぶ。
 *      GAS 側で CacheService 30 分、フロント側でも sessionStorage 30 分でフォールバック。
 *      API 失敗時は前回キャッシュを TTL 切れでも返す（UX 維持）。
 *      キャッシュキーは _v2 サフィックスで旧 CSV キャッシュ（job_wage_options）と分離。
 */
export async function getJobWageOptions(): Promise<
  Array<{ job: string; wage: number | null }>
> {
  const cacheKey = "job_wage_options_v2";
  const tsKey = "job_wage_options_v2_ts";
  const ttlMs = 30 * 60 * 1000; // 30分

  // 旧キャッシュを起動時に掃除（残存していると別経路で誤参照される可能性を排除）
  try {
    sessionStorage.removeItem("job_wage_options");
    sessionStorage.removeItem("job_wage_options_ts");
  } catch {}

  const readCache = (): Array<{ job: string; wage: number | null }> | null => {
    try {
      const cached = sessionStorage.getItem(cacheKey);
      if (!cached) return null;
      return JSON.parse(cached) as Array<{
        job: string;
        wage: number | null;
      }>;
    } catch {
      return null;
    }
  };

  // 鮮度内キャッシュなら即返却
  try {
    const tsRaw = sessionStorage.getItem(tsKey);
    if (tsRaw) {
      const ts = parseInt(tsRaw, 10);
      if (!Number.isNaN(ts) && Date.now() - ts < ttlMs) {
        const fresh = readCache();
        if (fresh) return fresh;
      }
    }
  } catch {}

  try {
    const r = await callGAS<Array<{ job: string; wage: number | null }>>(
      "getJobWageOptions",
      {},
      true,
    );
    const data = (r.data as Array<{ job: string; wage: number | null }>) || [];

    try {
      sessionStorage.setItem(cacheKey, JSON.stringify(data));
      sessionStorage.setItem(tsKey, String(Date.now()));
    } catch {}

    return data;
  } catch {
    // API 失敗時は TTL 切れでもキャッシュを返す
    const stale = readCache();
    return stale ?? [];
  }
}
// ISO日付文字列やDateオブジェクトから "HH:mm" 形式を抽出するヘルパー
function extractHHMM(timeValue: string | Date | undefined): string {
  if (
    !timeValue ||
    (typeof timeValue === "string" && timeValue.trim() === "")
  ) {
    return "";
  }

  // 既にHH:mm / HH:mm:ss形式の文字列なら正規化して返す
  if (typeof timeValue === "string") {
    const hhmmss = timeValue.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
    if (hhmmss) {
      const h = hhmmss[1].padStart(2, "0");
      const m = hhmmss[2].padStart(2, "0");
      return `${h}:${m}`;
    }
  }

  try {
    const date = new Date(timeValue as any);
    // Dateが有効ならローカル時刻で抽出（JSTなどタイムゾーンを考慮）
    if (!Number.isNaN(date.getTime())) {
      const hours = date.getHours().toString().padStart(2, "0");
      const minutes = date.getMinutes().toString().padStart(2, "0");
      return `${hours}:${minutes}`;
    }
  } catch {}

  // Dateが無効な場合、文字列中のHH:mmを抽出（例: "Sat Dec 30 1899 07:30:00 GMT+0900 ..."）
  if (typeof timeValue === "string") {
    const match = timeValue.match(/(\d{1,2}):(\d{2})/);
    if (match && match.length >= 3) {
      const h = match[1].padStart(2, "0");
      const m = match[2].padStart(2, "0");
      return `${h}:${m}`;
    }
  }

  return "";
}
export async function getKintaiDataByDate(
  dateString: string,
): Promise<KintaiData | null> {
  try {
    // dateString (YYYY-MM-DD) から年と月を取得
    const dateObj = new Date(dateString);
    const year = dateObj.getFullYear();
    const month = dateObj.getMonth() + 1; // getMonthは0始まりなので+1

    const monthlyRecords = await getMonthlyData(year, month);
    const record = monthlyRecords.find((r) => r.date === dateString);

    if (record) {
      const formattedStartTime = extractHHMM(record.startTime);
      const formattedEndTime = extractHHMM(record.endTime);

      // 休憩時間は他の時間フィールドと同じく文字列として処理
      const breakTime = record.breakTime || "00:00";

      return {
        date: record.date,
        startTime: formattedStartTime,
        breakTime,
        endTime: formattedEndTime,
        location: record.location || "",
        tasks: record.tasks || [],
        workingTime: record.workingTime || "", // スプレッドシートのF列から取得
      };
    }

    return null;
  } catch (error) {
    // データ取得エラーは無視
    return null;
  }
}

/* ========= getKintaiDataFromMonthlyData ========= */
// KintaiContextのmonthlyDataから特定日のデータを取得する新しい関数
export function getKintaiDataFromMonthlyData(
  dateString: string,
  monthlyData: KintaiRecord[],
): KintaiData | null {
  try {
    const record = monthlyData.find((r) => r.date === dateString);

    if (record) {
      const formattedStartTime = extractHHMM(record.startTime);
      const formattedEndTime = extractHHMM(record.endTime);

      // 休憩時間は他の時間フィールドと同じく文字列として処理
      const breakTime = record.breakTime || "00:00";

      return {
        date: record.date,
        startTime: formattedStartTime,
        breakTime,
        endTime: formattedEndTime,
        location: record.location || "",
        tasks: record.tasks || [],
        workingTime: record.workingTime || "", // スプレッドシートのF列から取得
      };
    }

    return null;
  } catch (error) {
    // データ取得エラーは無視
    return null;
  }
}

/* ========= 日付ユーティリティ (isEnteredDate と formatDateForComparison はこちらに既に定義があります) ========= */
// 指定した日に入力済みかどうかを確認（月間データを利用）
export async function isEnteredDate(date: Date): Promise<boolean> {
  try {
    const year = date.getFullYear();
    const month = date.getMonth() + 1;

    // 日付文字列を取得（形式: YYYY-MM-DD）
    const dateStr = formatDateForComparison(date);

    // 該当月のデータを取得
    const monthlyData = await getMonthlyData(year, month);

    // データ内に該当日があるか確認
    return monthlyData.some((record) => record.date === dateStr);
  } catch (e) {
    return false;
  }
}

// 比較用の日付フォーマット（YYYY-MM-DD）
function formatDateForComparison(date: Date): string {
  const year = date.getFullYear();
  const month = (date.getMonth() + 1).toString().padStart(2, "0");
  const day = date.getDate().toString().padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/* ========= ユーティリティ (isAuthenticated などはこちらに既に定義があります) ========= */
export const isAuthenticated = (): boolean => {
  const token = localStorage.getItem(TOKEN_KEY);
  const userId = localStorage.getItem(USER_ID_KEY);
  const userName = localStorage.getItem(USER_NAME_KEY);
  const spreadsheetId = localStorage.getItem(SHEET_ID_KEY);

  // 全ての必要な認証情報が存在するかチェック
  const isValid =
    token !== null &&
    userId !== null &&
    userName !== null &&
    spreadsheetId !== null;

  // デバッグ: 認証状態を詳細ログ出力
  // 認証状態チェック

  return isValid;
};

export const getUserName = (): string | null =>
  localStorage.getItem(USER_NAME_KEY);

export const getUserId = (): string | null => localStorage.getItem(USER_ID_KEY);

export const getSpreadsheetId = (): string | null =>
  localStorage.getItem(SHEET_ID_KEY);

/* ========= バージョン管理 ========= */
/**
 * サーバーのバージョン情報を取得
 */
export async function getVersionInfo(): Promise<VersionInfo> {
  const response = await callGAS<VersionInfo>("getVersion");
  return response.data as VersionInfo;
}

/**
 * サーバーのバージョン履歴を取得
 */
export async function getVersionHistory(): Promise<VersionHistoryItem[]> {
  const response = await callGAS<VersionHistoryItem[]>("getVersionHistory");
  return response.data as VersionHistoryItem[];
}

/**
 * ローカルストレージからサーバーバージョンを取得
 */
export const getServerVersion = (): string | null =>
  localStorage.getItem("kintai_server_version");

/**
 * クライアントバージョンを取得（package.jsonから）
 */
export const getClientVersion = (): string =>
  // package.jsonから動的に取得
  "1.0.0"; // アプリのバージョン

/**
 * バージョン互換性チェック
 */
export const checkVersionCompatibility = (): {
  compatible: boolean;
  message?: string;
} => {
  const serverVersion = getServerVersion();
  const clientVersion = getClientVersion();

  if (!serverVersion) {
    return { compatible: true }; // サーバーバージョンが不明な場合は互換性ありとする
  }

  // 簡単なバージョン互換性チェック
  // 実際のプロジェクトではより詳細なチェックを実装
  const serverMajor = parseInt(serverVersion.split("-")[0].replace("v", ""));
  const clientMajor = parseInt(clientVersion.split(".")[0]);

  if (Math.abs(serverMajor - clientMajor * 10) > 5) {
    return {
      compatible: false,
      message: `バージョンの互換性に問題があります。サーバー: ${serverVersion}, クライアント: ${clientVersion}`,
    };
  }

  return { compatible: true };
};
//   const year = date.getFullYear();
//   const month = (date.getMonth() + 1).toString().padStart(2, '0');
//   const day = date.getDate().toString().padStart(2, '0');
//   return `${year}-${month}-${day}`;
// }

/* ========= ユーティリティ ========= */
// export const isAuthenticated = (): boolean => // 削除
//   localStorage.getItem(TOKEN_KEY) !== null;

// export const getUserName = (): string | null => // 削除 (これは重複していませんでしたが、関連箇所なので確認)
//   localStorage.getItem(USER_NAME_KEY);

// export const getUserId = (): string | null => // 削除 (これは重複していませんでしたが、関連箇所なので確認)
//   localStorage.getItem(USER_ID_KEY);

// export const getSpreadsheetId = (): string | null => // 削除 (これは重複していませんでしたが、関連箇所なので確認)
//   localStorage.getItem(SHEET_ID_KEY);
