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

// Vite環境変数から開発モードかどうかを判定
const isDevelopment = import.meta.env.DEV;

/* ========= 定数 ========= */
// 開発環境ではプロキシ経由でGAS APIを呼び出し、本番環境ではNetlify Functionsを使用
const FUNC_URL = "/.netlify/functions/kintai-api"; // 本番環境でNetlify Functionsを経由する
const DEV_PROXY_URL = import.meta.env.VITE_DEV_PROXY_PATH || "/api/gas"; // 開発環境でプロキシ経由でGASを呼び出す

// デバッグ用ログ
// API Service 初期化

const TOKEN_KEY = "kintai_token";
const USER_ID_KEY = "kintai_user_id";
const USER_NAME_KEY = "kintai_user_name";
// SHEET_ID_KEY定数は削除 - 現在開いているスプレッドシートを使用するため不要

// 月間データをセッションストレージに保存するためのキー
const MONTHLY_DATA_KEY = "kintai_monthly_data";
const MONTHLY_DATA_TIMESTAMP_KEY = "kintai_monthly_data_timestamp";

/* 開発時の可視化フラグ */
const DEBUG_MODE = () => localStorage.getItem("kintai_debug_mode") === "true";

/* ========= 共通型 ========= */
interface ApiOk<T = unknown> {
  success?: true;
  ok?: true;
  token?: string;
  userId?: string;
  userName?: string;
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
      // API呼び出し試行
      const response = await fetchWithTimeout(url, options, timeout);
      return response;
    } catch (error) {
      lastError = error as Error;
      // 試行失敗

      // 最後の試行でない場合は少し待機
      if (attempt < maxRetries) {
        const delay = Math.min(1000 * 2 ** attempt, 5000); // 指数バックオフ（最大5秒）
        // リトライ待機
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
  // callGAS 実行

  const body: Record<string, unknown> = { action, payload };
  if (withToken) body.token = localStorage.getItem(TOKEN_KEY);
  if (DEBUG_MODE()) body.debug = true;

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
      // VITE_MASTER_CONFIG_API_URLを直接使用
      const apiUrl = import.meta.env.VITE_MASTER_CONFIG_API_URL;
      if (!apiUrl) {
        console.error(
          "VITE_MASTER_CONFIG_API_URL is not defined. Please check your .env file or environment variables.",
        );
        throw new Error("API URL is not configured. Contact administrator.");
      }
      // API呼び出し中
      const res = await fetchWithRetry(apiUrl, fetchOptions, 2, 8000);

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }

      // レスポンステキストを取得してJSONパース前にチェック
      const responseText = await res.text();

      // HTMLレスポンスの検出
      if (
        responseText.trim().startsWith("<!DOCTYPE") ||
        responseText.trim().startsWith("<html")
      ) {
        console.error("HTMLレスポンスを受信:", {
          url: apiUrl,
          action,
          responsePreview: responseText.substring(0, 200) + "...",
        });
        throw new Error(
          `GASからHTMLレスポンスが返されました。GAS側の設定を確認してください。\nAction: ${action}\nURL: ${apiUrl}`,
        );
      }

      let json: ApiResp<T>;
      try {
        json = JSON.parse(responseText) as ApiResp<T>;
      } catch (parseError) {
        console.error("JSONパースエラー:", {
          url: apiUrl,
          action,
          responseText: responseText.substring(0, 500),
          parseError,
        });
        throw new Error(
          `GASからの応答をJSONとして解析できませんでした。\nAction: ${action}\nResponse: ${responseText.substring(0, 100)}...`,
        );
      }

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
      console.error("callGAS エラー詳細:", {
        action,
        payload,
        withToken,
        apiUrl: isDevelopment ? DEV_PROXY_URL : FUNC_URL,
        error: error instanceof Error ? error.message : String(error),
      });
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

    // セッションキャッシュもクリア
    sessionStorage.removeItem(MONTHLY_DATA_KEY);
    sessionStorage.removeItem(MONTHLY_DATA_TIMESTAMP_KEY);
    clearMonthlyDataCache();

    // 既存データクリア完了

    const r = await callGAS<never>("login", { name, password });

    // ログイン成功

    // 新しい認証情報を保存
    localStorage.setItem(TOKEN_KEY, r.token as string);
    localStorage.setItem(USER_ID_KEY, r.userId as string);
    localStorage.setItem(USER_NAME_KEY, r.userName as string);

    // デバッグ: 保存後の値を確認
    // localStorage保存完了

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
  const userId = localStorage.getItem(USER_ID_KEY);

  if (!token || !userId) {
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
  const userId = localStorage.getItem(USER_ID_KEY);

  if (!token || !userId) {
    throw new Error("認証情報が不足しています");
  }

  const r = await callGAS<KintaiRecord[]>(
    "getHistory",
    { userId, year, month },
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
  const userId = localStorage.getItem(USER_ID_KEY);

  // デバッグ: データ取得時の認証情報を確認
  // 月次データ取得開始

  if (!token || !userId) {
    // 認証情報不足エラー
    throw new Error("認証情報が不足しています");
  }

  // キャッシュキー
  const cacheKey = `${year}-${month}`;

  // 既存のキャッシュをチェック（強制更新フラグがOFFの場合）
  if (!forceRefresh) {
    const cachedData = getMonthlyDataFromCache(cacheKey);
    if (cachedData) {
      // キャッシュからデータを取得
      return cachedData;
    }
  }

  // キャッシュになければサーバーから取得
  // GASにリクエスト送信

  const r = await callGAS<KintaiRecord[]>(
    "getMonthlyData",
    { userId, year, month },
    true,
  );

  // デバッグ: GASからのレスポンスを確認
  // GASからのレスポンス受信

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

      // 休憩時間は他の時間フィールドと同じく文字列として処理
      const breakTime = record.breakTime || "00:00";

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

      // 休憩時間は他の時間フィールドと同じく文字列として処理
      const breakTime = record.breakTime || "00:00";

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

  // 全ての必要な認証情報が存在するかチェック
  const isValid = token !== null && userId !== null && userName !== null;

  // デバッグ: 認証状態を詳細ログ出力
  // 認証状態チェック

  return isValid;
};

export const getUserName = (): string | null =>
  localStorage.getItem(USER_NAME_KEY);

export const getUserId = (): string | null => localStorage.getItem(USER_ID_KEY);

// getSpreadsheetId関数は削除 - 現在開いているスプレッドシートを使用するため不要

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

/* ========= Join機能 ========= */

/**
 * 顧客情報の型定義
 */
export interface CustomerInfo {
  customerCode: string;
  serverName: string;
  spreadsheetId: string;
}

/**
 * 顧客コード（サーバー名）で顧客情報を検索
 * @param customerCode 検索する顧客コード（サーバー名）
 * @returns 顧客情報またはエラー
 */
/**
 * MasterConfig.gs用のAPIエンドポイントを取得
 * 開発環境ではプロキシ経由、本番環境では直接GAS URLを使用
 * @returns MasterConfig.gsのAPIエンドポイントURL
 */
const getMasterConfigApiUrl = (): string => {
  if (isDevelopment) {
    // 開発環境ではプロキシ経由でアクセス
    return (
      import.meta.env.VITE_DEV_MASTER_CONFIG_PROXY_PATH || "/api/master-config"
    );
  } else {
    // 本番環境では直接GAS URLを使用
    return (
      import.meta.env.VITE_MASTER_CONFIG_API_URL ||
      "https://script.google.com/macros/s/AKfycbxPMNkuofB1CMjD872rhc6XomIckDxCjd0mYxn-szgQP2AIxkb7v5IC-qxx4P5dEK_x/exec"
    );
  }
};

export const findCustomerByCode = async (
  customerCode: string,
): Promise<ApiResp<CustomerInfo>> => {
  if (!customerCode || customerCode.trim() === "") {
    return {
      success: false,
      error: "顧客コードが指定されていません",
    };
  }

  const payload = {
    action: "findCustomerByCode",
    customerCode: customerCode.trim(),
  };

  if (DEBUG_MODE()) {
    console.log("🔍 findCustomerByCode API呼び出し:", payload);
  }

  try {
    const response = await fetchWithRetry(getMasterConfigApiUrl(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const result = await response.json();

    if (DEBUG_MODE()) {
      console.log("🔍 findCustomerByCode API応答:", result);
    }

    if (result.success && result.data) {
      return {
        success: true,
        data: result.data as CustomerInfo,
      };
    } else {
      return {
        success: false,
        error: result.error || result.message || "顧客情報の取得に失敗しました",
      };
    }
  } catch (error) {
    if (DEBUG_MODE()) {
      console.error("🚨 findCustomerByCode APIエラー:", error);
    }
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "通信エラーが発生しました",
    };
  }
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
