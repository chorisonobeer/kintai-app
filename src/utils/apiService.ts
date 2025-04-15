import { KintaiData } from '../types';

// Apps Scriptのデプロイ済みウェブアプリURL
const API_URL = 'https://script.google.com/macros/s/AKfycbxRLlPOm5YCZKwnM92b27feUP-Vadp0ygPJAAV4mCK7kDkZAWsthIOl6pJ3dQz8Oy8BGw/exec';

// ローカルストレージのキー
const TOKEN_KEY = 'kintai_token';
const USER_ID_KEY = 'kintai_user_id';
const USER_NAME_KEY = 'kintai_user_name';

/**
 * ログイン処理
 * @param email メールアドレス
 * @param password パスワード
 * @returns ログイン結果
 */
export const login = async (email: string, password: string): Promise<{success: boolean, error?: string}> => {
  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        action: 'login',
        payload: {
          email,
          passwordPlain: password
        }
      })
    });

    const data = await response.json();

    if (data.success) {
      // トークン情報をlocalStorageに保存
      localStorage.setItem(TOKEN_KEY, data.token);
      localStorage.setItem(USER_ID_KEY, data.userId);
      localStorage.setItem(USER_NAME_KEY, data.userName);
      return { success: true };
    } else {
      return { success: false, error: data.error || 'ログインに失敗しました' };
    }
  } catch (error) {
    console.error('Login error:', error);
    return { success: false, error: '通信エラーが発生しました' };
  }
};

/**
 * ログアウト処理
 */
export const logout = async (): Promise<void> => {
  const token = localStorage.getItem(TOKEN_KEY);
  
  if (token) {
    try {
      // サーバー側でもトークンを無効化
      await fetch(API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          action: 'logout',
          token
        })
      });
    } catch (error) {
      console.error('Logout error:', error);
    }
  }

  // ローカルストレージからトークン情報を削除
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_ID_KEY);
  localStorage.removeItem(USER_NAME_KEY);
};

/**
 * 勤怠データを保存
 * @param kintaiData 勤怠データ
 * @returns 保存結果
 */
export const saveKintaiToServer = async (kintaiData: KintaiData): Promise<{success: boolean, error?: string}> => {
  const token = localStorage.getItem(TOKEN_KEY);
  
  if (!token) {
    return { success: false, error: 'ログインが必要です' };
  }

  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        action: 'saveKintai',
        token,
        payload: {
          date: kintaiData.date,
          startTime: kintaiData.startTime,
          breakTime: kintaiData.breakTime,
          endTime: kintaiData.endTime,
          location: kintaiData.location || '' // locationが未定義の場合は空文字を送信
        }
      })
    });

    const data = await response.json();

    if (data.success) {
      return { success: true };
    } else {
      return { success: false, error: data.error || 'データの保存に失敗しました' };
    }
  } catch (error) {
    console.error('Save kintai error:', error);
    return { success: false, error: '通信エラーが発生しました' };
  }
};

/**
 * 認証状態を確認
 * @returns 認証状態
 */
export const isAuthenticated = (): boolean => {
  return localStorage.getItem(TOKEN_KEY) !== null;
};

/**
 * ユーザー名を取得
 * @returns ユーザー名
 */
export const getUserName = (): string | null => {
  return localStorage.getItem(USER_NAME_KEY);
};

/**
 * ユーザーIDを取得
 * @returns ユーザーID
 */
export const getUserId = (): string | null => {
  return localStorage.getItem(USER_ID_KEY);
};