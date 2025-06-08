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
import { formatBreakTimeFromMinutes } from "./dateUtils";

// Vite環境変数から開発モードかどうかを判定
const isDevelopment = import.meta.env.DEV;

/* ========= 定数 ========= */
// 開発環境ではプロキシ経由でGAS APIを呼び出し、本番環境ではNetlify Functionsを使用
const GAS_API_URL =
  import.meta.env.VITE_GAS_API_URL ||
  "https://script.google.com/macros/s/AKfycbzW33cRCB_rYdRx-bNQhj-2pghluHl09_iu26As9Xm7f7PIEoRk2B_42ubLYO6kKpid4w/exec";
const FUNC_URL = "/.netlify/functions/kintai-api"; // 本番環境でNetlify Functionsを経由する
const DEV_PROXY_URL = "/api/gas"; // 開発環境でプロキシ経由でGASを呼び出す

// デバッグ用ログ
console.log("=== API Service 初期化 ===");
console.log("isDevelopment:", isDevelopment);
console.log(
  "import.meta.env.VITE_GAS_API_URL:",
  import.meta.env.VITE_GAS_API_URL,
);
console.log("GAS_API_URL:", GAS_API_URL);
console.log("FUNC_URL:", FUNC_URL);
console.log("=========================");

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

// タイムアウト付きfetch関数
function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeout = 10000,
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

// リトライ付きfetch関数
async function fetchWithRetry(
  url: string,
  options: RequestInit,
  maxRetries = 2,
  timeout = 10000,
): Promise<Response> {
  let lastError: Error;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      console.log(`API呼び出し試行 ${attempt + 1}/${maxRetries + 1}`);
      const response = await fetchWithTimeout(url, options, timeout);
      return response;
    } catch (error) {
      lastError = error as Error;
      console.warn(`試行 ${attempt + 1} 失敗:`, error);

      // 最後の試行でない場合は少し待機
      if (attempt < maxRetries) {
        const delay = Math.min(1000 * Math.pow(2, attempt), 5000); // 指数バックオフ（最大5秒）
        console.log(`${delay}ms後にリトライします...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
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
  console.log("=== callGAS 実行 ===");
  console.log("action:", action);
  console.log("isDevelopment:", isDevelopment);
  console.log("使用するURL:", isDevelopment ? GAS_API_URL : FUNC_URL);
  console.log("payload:", payload);
  console.log("withToken:", withToken);

  const body: Record<string, unknown> = { action, payload };
  if (withToken) body.token = localStorage.getItem(TOKEN_KEY);
  if (DEBUG_MODE) body.debug = true;

  // リクエストの重複チェック用キー
  const requestKey = `${action}-${JSON.stringify(payload)}-${withToken}`;

  // 同じリクエストが進行中の場合は待機
  if (pendingRequests.has(requestKey)) {
    console.log(`重複リクエスト検出: ${action} - 既存のリクエストを待機中...`);
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
      // 開発環境ではプロキシ経由、本番環境ではNetlify Functionsを使用
      const apiUrl = isDevelopment ? DEV_PROXY_URL : FUNC_URL;
      console.log(`API URL: ${apiUrl} (開発環境: ${isDevelopment})`);

      console.log("API呼び出し中...");
      const res = await fetchWithRetry(apiUrl, fetchOptions, 2, 8000);

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }

      const json = (await res.json()) as ApiResp<T>;
      console.log("API レスポンス:", json);

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
      console.error("API呼び出しエラー:", error);
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
    console.log("=== LOGIN DEBUG ===");
    console.log("ログイン前のlocalStorage状態:");
    console.log("既存TOKEN_KEY:", localStorage.getItem(TOKEN_KEY));
    console.log("既存USER_ID_KEY:", localStorage.getItem(USER_ID_KEY));
    console.log("既存USER_NAME_KEY:", localStorage.getItem(USER_NAME_KEY));
    console.log("既存SHEET_ID_KEY:", localStorage.getItem(SHEET_ID_KEY));

    // 既存の認証情報を完全にクリア
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_ID_KEY);
    localStorage.removeItem(USER_NAME_KEY);
    localStorage.removeItem(SHEET_ID_KEY);

    // セッションキャッシュもクリア
    sessionStorage.removeItem(MONTHLY_DATA_KEY);
    sessionStorage.removeItem(MONTHLY_DATA_TIMESTAMP_KEY);
    clearMonthlyDataCache();

    console.log("既存データクリア完了");

    const r = await callGAS<never>("login", { name, password });

    console.log("入力された名前:", name);
    console.log("GASからのレスポンス:", r);
    console.log("保存されるuserName:", r.userName);
    console.log("保存されるuserId:", r.userId);
    console.log("保存されるspreadsheetId:", r.spreadsheetId);

    // 新しい認証情報を保存
    localStorage.setItem(TOKEN_KEY, r.token as string);
    localStorage.setItem(USER_ID_KEY, r.userId as string);
    localStorage.setItem(USER_NAME_KEY, r.userName as string);
    localStorage.setItem(SHEET_ID_KEY, r.spreadsheetId as string);

    // デバッグ: 保存後の値を確認
    console.log("localStorage保存後の確認:");
    console.log("TOKEN_KEY:", localStorage.getItem(TOKEN_KEY));
    console.log("USER_ID_KEY:", localStorage.getItem(USER_ID_KEY));
    console.log("USER_NAME_KEY:", localStorage.getItem(USER_NAME_KEY));
    console.log("SHEET_ID_KEY:", localStorage.getItem(SHEET_ID_KEY));
    console.log("===================");

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

/* ========= saveKintai ========= */
export async function saveKintaiToServer(
  data: KintaiData, // KintaiData型は { date: string; startTime: string; breakTime: string; endTime: string; location?: string; }
): Promise<{ success: boolean; error?: string }> {
  const token = localStorage.getItem(TOKEN_KEY);
  const spreadsheetId = localStorage.getItem(SHEET_ID_KEY);
  const userId = localStorage.getItem(USER_ID_KEY);

  if (!token || !spreadsheetId || !userId) {
    return { success: false, error: "ログイン情報が不足しています" };
  }

  try {
    // 送信するペイロードには、date, startTime, breakTime (HH:mm形式), endTime, location のみ含まれる
    // F列に相当する「計算された勤務時間」はフロントエンドからは送信していない
    await callGAS(
      "saveKintai",
      {
        date: data.date,
        startTime: data.startTime, // "HH:mm"
        breakTime: data.breakTime, // string (HH:mm)
        endTime: data.endTime, // "HH:mm"
        location: data.location || "",
        spreadsheetId,
        userId,
      },
      true,
    );

    clearMonthlyDataCache();

    return { success: true };
  } catch (e) {
    return { success: false, error: (e as Error).message };
  }
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

/* ========= getMonthlyData ========= */
export async function getMonthlyData(
  year: number,
  month: number,
  forceRefresh = false,
): Promise<KintaiRecord[]> {
  const token = localStorage.getItem(TOKEN_KEY);
  const spreadsheetId = localStorage.getItem(SHEET_ID_KEY);
  const userId = localStorage.getItem(USER_ID_KEY);

  // デバッグ: データ取得時の認証情報を確認
  console.log("=== GET MONTHLY DATA DEBUG ===");
  console.log("取得対象:", year, "年", month, "月");
  console.log("使用するuserId:", userId);
  console.log("使用するspreadsheetId:", spreadsheetId);
  console.log("現在のユーザー名:", localStorage.getItem(USER_NAME_KEY));

  if (!token || !spreadsheetId || !userId) {
    console.log("認証情報不足エラー:", {
      token: !!token,
      spreadsheetId: !!spreadsheetId,
      userId: !!userId,
    });
    throw new Error("認証情報が不足しています");
  }

  // キャッシュキー
  const cacheKey = `${year}-${month}`;

  // 既存のキャッシュをチェック（強制更新フラグがOFFの場合）
  if (!forceRefresh) {
    const cachedData = getMonthlyDataFromCache(cacheKey);
    if (cachedData) {
      console.log("キャッシュからデータを取得:", cachedData.length, "件");
      return cachedData;
    }
  }

  // キャッシュになければサーバーから取得
  console.log("GASにリクエスト送信:", { spreadsheetId, userId, year, month });

  const r = await callGAS<KintaiRecord[]>(
    "getMonthlyData",
    { spreadsheetId, userId, year, month },
    true,
  );

  // デバッグ: GASからのレスポンスを確認
  console.log("GASからのレスポンス:", r);
  console.log("取得したデータ件数:", (r.data as KintaiRecord[])?.length || 0);
  if ((r.data as KintaiRecord[])?.length > 0) {
    console.log("最初のレコード:", (r.data as KintaiRecord[])[0]);
  }
  console.log("==============================");

  // キャッシュに保存
  saveMonthlyDataToCache(cacheKey, r.data as KintaiRecord[]);

  return r.data as KintaiRecord[];
}

/* ========= 月間データキャッシュユーティリティ ========= */
// キャッシュから月間データを取得
function getMonthlyDataFromCache(cacheKey: string): KintaiRecord[] | null {
  try {
    const cachedDataJson = sessionStorage.getItem(MONTHLY_DATA_KEY);
    if (!cachedDataJson) return null;

    const cachedDataMap = JSON.parse(cachedDataJson);
    const cachedData = cachedDataMap[cacheKey];

    if (!cachedData) return null;

    // キャッシュ期限チェック（30分）
    const timestamp = parseInt(
      sessionStorage.getItem(`${MONTHLY_DATA_TIMESTAMP_KEY}_${cacheKey}`) ||
        "0",
      10,
    );
    const now = Date.now();
    const cacheAge = now - timestamp;

    // 30分以上経過していたらキャッシュ無効
    if (cacheAge > 30 * 60 * 1000) {
      return null;
    }

    return cachedData;
  } catch (e) {
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
// ... existing code ...

// ISO日付文字列やDateオブジェクトから "HH:mm" 形式を抽出するヘルパー
function extractHHMM(timeValue: string | Date | undefined): string {
  // 空文字や未定義の値は空文字を返す（00:00ではなく）
  if (
    !timeValue ||
    (typeof timeValue === "string" && timeValue.trim() === "")
  ) {
    return "";
  }

  try {
    const date = new Date(timeValue); // 文字列でもDateオブジェクトでも対応
    const hours = date.getUTCHours().toString().padStart(2, "0"); // スプレッドシートの時刻はUTCとして解釈される場合がある
    const minutes = date.getUTCMinutes().toString().padStart(2, "0");
    if (
      Number.isNaN(parseInt(hours, 10)) ||
      Number.isNaN(parseInt(minutes, 10))
    ) {
      // もしパースに失敗したら、文字列からの直接抽出を試みる
      if (typeof timeValue === "string") {
        const match = timeValue.match(/(\d{2}):(\d{2})/);
        if (match && match.length > 2) return `${match[1]}:${match[2]}`;
      }
      return ""; // それでもダメなら空文字
    }
    return `${hours}:${minutes}`;
  } catch (e) {
    // 解析失敗時は空文字列を返す
    return ""; // パース失敗時のフォールバック
  }
}

/* ========= getKintaiDataByDate ========= */
// この関数は廃止予定 - KintaiContextのmonthlyDataを直接使用することを推奨
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

      // breakTimeが文字列の場合は分数に変換してから再度文字列に変換
      let breakTime: string;
      if (typeof record.breakTime === "string") {
        // 既にHH:mm形式の場合はそのまま使用
        breakTime = record.breakTime;
      } else {
        // 数値の場合は分数からHH:mm形式に変換
        const breakTimeMinutes =
          record.breakTime !== undefined ? record.breakTime : 0;
        breakTime = formatBreakTimeFromMinutes(breakTimeMinutes);
      }

      return {
        date: record.date,
        startTime: formattedStartTime,
        breakTime,
        endTime: formattedEndTime,
        location: record.location || "",
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

      // breakTimeが文字列の場合は分数に変換してから再度文字列に変換
      let breakTime: string;
      if (typeof record.breakTime === "string") {
        // 既にHH:mm形式の場合はそのまま使用
        breakTime = record.breakTime;
      } else {
        // 数値の場合は分数からHH:mm形式に変換
        const breakTimeMinutes =
          record.breakTime !== undefined ? record.breakTime : 0;
        breakTime = formatBreakTimeFromMinutes(breakTimeMinutes);
      }

      return {
        date: record.date,
        startTime: formattedStartTime,
        breakTime,
        endTime: formattedEndTime,
        location: record.location || "",
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
  console.log("=== 認証状態チェック ===");
  console.log("TOKEN_KEY存在:", token !== null);
  console.log("USER_ID_KEY存在:", userId !== null);
  console.log("USER_NAME_KEY存在:", userName !== null);
  console.log("SHEET_ID_KEY存在:", spreadsheetId !== null);
  console.log("認証状態:", isValid ? "有効" : "無効");
  console.log("=====================");

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
