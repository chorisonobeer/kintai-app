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

import { KintaiData, KintaiRecord } from '../types';
import { formatBreakTimeFromMinutes } from './dateUtils';

/* ========= 定数 ========= */
const FUNC_URL        = '/.netlify/functions/kintai-api';

const TOKEN_KEY       = 'kintai_token';
const USER_ID_KEY     = 'kintai_user_id';
const USER_NAME_KEY   = 'kintai_user_name';
const SHEET_ID_KEY    = 'kintai_spreadsheet_id';

// 月間データをセッションストレージに保存するためのキー
const MONTHLY_DATA_KEY = 'kintai_monthly_data';
const MONTHLY_DATA_TIMESTAMP_KEY = 'kintai_monthly_data_timestamp';

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
async function callGAS<T = unknown>(
  action:  string,
  payload: object = {},
  withToken = false
): Promise<ApiOk<T>> {

  const body: Record<string, unknown> = { action, payload };
  if (withToken) body.token = localStorage.getItem(TOKEN_KEY);
  if (DEBUG_MODE) body.debug = true;

  const res  = await fetch(FUNC_URL, {
    method : 'POST',
    headers: { 'Content-Type': 'application/json' },
    body   : JSON.stringify(body)
  });

  const json = await res.json() as ApiResp<T>;

  // バージョン情報をローカルストレージに保存
  if (json.version) {
    localStorage.setItem('kintai_server_version', json.version);
  }

  /* ---------- 型安全にエラーチェック ---------- */
  const okFlag = (json as ApiOk<T>).success === true || (json as ApiOk<T>).ok === true;
  if (!okFlag) {
    const msg =
      typeof (json as ApiErr).error === 'string' ? (json as ApiErr).error :
      typeof (json as ApiErr).err   === 'string' ? (json as ApiErr).err   :
      'API error';
    throw new Error(msg);
  }
  return json as ApiOk<T>;
}

/* ========= login ========= */
export async function login(
  name: string,
  password: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const r = await callGAS<never>('login', { name, password });

    localStorage.setItem(TOKEN_KEY,     r.token as string);
    localStorage.setItem(USER_ID_KEY,   r.userId as string);
    localStorage.setItem(USER_NAME_KEY, r.userName as string);
    localStorage.setItem(SHEET_ID_KEY,  r.spreadsheetId as string);

    return { success: true };
  } catch (e) {
    return { success: false, error: (e as Error).message };
  }
}

/* ========= logout ========= */
export async function logout(): Promise<void> {
  try {
    await callGAS('logout', {}, true);
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
  data: KintaiData // KintaiData型は { date: string; startTime: string; breakTime: string; endTime: string; location?: string; }
): Promise<{ success: boolean; error?: string }> {
  const token         = localStorage.getItem(TOKEN_KEY);
  const spreadsheetId = localStorage.getItem(SHEET_ID_KEY);
  const userId        = localStorage.getItem(USER_ID_KEY);

  if (!token || !spreadsheetId || !userId) {
    return { success:false, error:'ログイン情報が不足しています' };
  }

  try {
    // 送信するペイロードには、date, startTime, breakTime (HH:mm形式), endTime, location のみ含まれる
    // F列に相当する「計算された勤務時間」はフロントエンドからは送信していない
    await callGAS('saveKintai', { 
      date: data.date,
      startTime: data.startTime, // "HH:mm"
      breakTime: data.breakTime, // string (HH:mm)
      endTime: data.endTime,     // "HH:mm"
      location: data.location || '',
      spreadsheetId, 
      userId 
    }, true);
    
    clearMonthlyDataCache();
    
    return { success: true };
  } catch (e) {
    return { success:false, error:(e as Error).message };
  }
}

/* ========= getHistory ========= */
export async function getKintaiHistory(
  year: number,
  month: number
): Promise<KintaiRecord[]> {

  const token         = localStorage.getItem(TOKEN_KEY);
  const spreadsheetId = localStorage.getItem(SHEET_ID_KEY);
  const userId        = localStorage.getItem(USER_ID_KEY);

  if (!token || !spreadsheetId || !userId) {
    throw new Error('認証情報が不足しています');
  }

  const r = await callGAS<KintaiRecord[]>(
    'getHistory',
    { spreadsheetId, userId, year, month },
    true
  );
  return r.data as KintaiRecord[];
}

/* ========= getMonthlyData ========= */
export async function getMonthlyData(
  year: number,
  month: number, 
  forceRefresh = false
): Promise<KintaiRecord[]> {
  const token         = localStorage.getItem(TOKEN_KEY);
  const spreadsheetId = localStorage.getItem(SHEET_ID_KEY);
  const userId        = localStorage.getItem(USER_ID_KEY);

  if (!token || !spreadsheetId || !userId) {
    throw new Error('認証情報が不足しています');
  }
  
  // キャッシュキー
  const cacheKey = `${year}-${month}`;
  
  // 既存のキャッシュをチェック（強制更新フラグがOFFの場合）
  if (!forceRefresh) {
    const cachedData = getMonthlyDataFromCache(cacheKey);
    if (cachedData) {

      return cachedData;
    }
  }
  
  // キャッシュになければサーバーから取得

  const r = await callGAS<KintaiRecord[]>(
    'getMonthlyData',
    { spreadsheetId, userId, year, month },
    true
  );
  
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
    const timestamp = parseInt(sessionStorage.getItem(MONTHLY_DATA_TIMESTAMP_KEY + '_' + cacheKey) || '0', 10);
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
    sessionStorage.setItem(MONTHLY_DATA_TIMESTAMP_KEY + '_' + cacheKey, Date.now().toString());
    

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
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      if (key && key.startsWith(MONTHLY_DATA_TIMESTAMP_KEY)) {
        keys.push(key);
      }
    }
    
    keys.forEach(key => sessionStorage.removeItem(key));
    

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
  if (!timeValue || (typeof timeValue === 'string' && timeValue.trim() === '')) {
    return '';
  }
  
  try {
    const date = new Date(timeValue); // 文字列でもDateオブジェクトでも対応
    const hours = date.getUTCHours().toString().padStart(2, '0'); // スプレッドシートの時刻はUTCとして解釈される場合がある
    const minutes = date.getUTCMinutes().toString().padStart(2, '0');
    if (isNaN(parseInt(hours,10)) || isNaN(parseInt(minutes,10))) {
        // もしパースに失敗したら、文字列からの直接抽出を試みる
        if (typeof timeValue === 'string') {
            const match = timeValue.match(/(\d{2}):(\d{2})/);
            if (match && match.length > 2) return `${match[1]}:${match[2]}`;
        }
        return ''; // それでもダメなら空文字
    }
    return `${hours}:${minutes}`;
  } catch (e) {
    // 解析失敗時は空文字列を返す
    return ''; // パース失敗時のフォールバック
  }
}




/* ========= getKintaiDataByDate ========= */
export async function getKintaiDataByDate(dateString: string): Promise<KintaiData | null> {
  try {
    // dateString (YYYY-MM-DD) から年と月を取得
    const dateObj = new Date(dateString);
    const year = dateObj.getFullYear();
    const month = dateObj.getMonth() + 1; // getMonthは0始まりなので+1


    
    const monthlyRecords = await getMonthlyData(year, month);
    const record = monthlyRecords.find(r => r.date === dateString);

    if (record) {

      
      const formattedStartTime = extractHHMM(record.startTime);
      const formattedEndTime = extractHHMM(record.endTime);
      
      // breakTimeが文字列の場合は分数に変換してから再度文字列に変換
      let breakTime: string;
      if (typeof record.breakTime === 'string') {
        // 既にHH:mm形式の場合はそのまま使用
        breakTime = record.breakTime;
      } else {
        // 数値の場合は分数からHH:mm形式に変換
        const breakTimeMinutes = record.breakTime !== undefined ? record.breakTime : 0;
        breakTime = formatBreakTimeFromMinutes(breakTimeMinutes);
      }



      return {
        date: record.date,
        startTime: formattedStartTime,
        breakTime: breakTime,
        endTime: formattedEndTime,
        location: record.location || '',
        workingTime: record.workingTime || '', // スプレッドシートのF列から取得
      };
    } else {

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
    return monthlyData.some(record => record.date === dateStr);
  } catch (e) {
    return false;
  }
}

// 比較用の日付フォーマット（YYYY-MM-DD）
function formatDateForComparison(date: Date): string {
  const year = date.getFullYear();
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/* ========= ユーティリティ (isAuthenticated などはこちらに既に定義があります) ========= */
export const isAuthenticated = (): boolean =>
  localStorage.getItem(TOKEN_KEY) !== null;

export const getUserName = (): string | null =>
  localStorage.getItem(USER_NAME_KEY);

export const getUserId = (): string | null =>
  localStorage.getItem(USER_ID_KEY);

export const getSpreadsheetId = (): string | null =>
  localStorage.getItem(SHEET_ID_KEY);

/* ========= バージョン管理 ========= */
/**
 * サーバーのバージョン情報を取得
 */
export async function getVersionInfo(): Promise<VersionInfo> {
  const response = await callGAS<VersionInfo>('getVersion');
  return response.data as VersionInfo;
}

/**
 * サーバーのバージョン履歴を取得
 */
export async function getVersionHistory(): Promise<VersionHistoryItem[]> {
  const response = await callGAS<VersionHistoryItem[]>('getVersionHistory');
  return response.data as VersionHistoryItem[];
}

/**
 * ローカルストレージからサーバーバージョンを取得
 */
export const getServerVersion = (): string | null =>
  localStorage.getItem('kintai_server_version');

/**
 * クライアントバージョンを取得（package.jsonから）
 */
export const getClientVersion = (): string => {
  // 実際のプロジェクトではpackage.jsonから取得するが、
  // ここでは固定値を返す
  return '0.1.0';
};

/**
 * バージョン互換性チェック
 */
export const checkVersionCompatibility = (): { compatible: boolean; message?: string } => {
  const serverVersion = getServerVersion();
  const clientVersion = getClientVersion();
  
  if (!serverVersion) {
    return { compatible: true }; // サーバーバージョンが不明な場合は互換性ありとする
  }
  
  // 簡単なバージョン互換性チェック
  // 実際のプロジェクトではより詳細なチェックを実装
  const serverMajor = parseInt(serverVersion.split('-')[0].replace('v', ''));
  const clientMajor = parseInt(clientVersion.split('.')[0]);
  
  if (Math.abs(serverMajor - clientMajor * 10) > 5) {
    return {
      compatible: false,
      message: `バージョンの互換性に問題があります。サーバー: ${serverVersion}, クライアント: ${clientVersion}`
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