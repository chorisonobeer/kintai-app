/**  src/apiService.ts                              2025‑05‑01-v1
 *  ──────────────────────────────────────────────────────────
 *  - login / logout / saveKintai / getHistory / getMonthlyData
 *  - DEBUG_MODE で GAS 内部 debug を受信
 *  - strictNullChecks/noImplicitAny すべてエラー 0 を確認
 *  - 月間データ取得機能追加
 *  ──────────────────────────────────────────────────────────
 */

import { KintaiData, KintaiRecord } from '../types';

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
}

interface ApiErr {
  success?: false;
  ok?: false;
  error?: string;
  err?: string;
  debug?: unknown;
}

type ApiResp<T = unknown> = ApiOk<T> | ApiErr;

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

  console.groupCollapsed(`[GAS] ${action}`);
  console.log('status:', res.status);
  console.log('json  :', json);
  console.groupEnd();

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
  email: string,
  password: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const r = await callGAS<never>('login', { email, password });

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
  data: KintaiData
): Promise<{ success: boolean; error?: string }> {
  const token         = localStorage.getItem(TOKEN_KEY);
  const spreadsheetId = localStorage.getItem(SHEET_ID_KEY);
  const userId        = localStorage.getItem(USER_ID_KEY);

  if (!token || !spreadsheetId || !userId) {
    return { success:false, error:'ログイン情報が不足しています' };
  }

  try {
    await callGAS('saveKintai', { ...data, spreadsheetId, userId }, true);
    
    // 保存が成功したら月間データのキャッシュをクリア（強制再取得のため）
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
      console.log(`キャッシュから${year}年${month}月のデータを取得しました`);
      return cachedData;
    }
  }
  
  // キャッシュになければサーバーから取得
  console.log(`サーバーから${year}年${month}月のデータを取得します`);
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
      console.log('キャッシュ期限切れです');
      return null;
    }
    
    return cachedData;
  } catch (e) {
    console.error('キャッシュ読み込みエラー:', e);
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
    
    console.log(`${cacheKey}のデータをキャッシュに保存しました`);
  } catch (e) {
    console.error('キャッシュ保存エラー:', e);
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
    
    console.log('月間データキャッシュをクリアしました');
  } catch (e) {
    console.error('キャッシュクリアエラー:', e);
  }
}

/* ========= 日付ユーティリティ ========= */
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
    console.error('日付確認エラー:', e);
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

/* ========= ユーティリティ ========= */
export const isAuthenticated = (): boolean =>
  localStorage.getItem(TOKEN_KEY) !== null;

export const getUserName = (): string | null =>
  localStorage.getItem(USER_NAME_KEY);

export const getUserId = (): string | null =>
  localStorage.getItem(USER_ID_KEY);

export const getSpreadsheetId = (): string | null =>
  localStorage.getItem(SHEET_ID_KEY);