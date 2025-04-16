import { KintaiData } from '../types';

// Google Apps ScriptのデプロイURLを設定
const API_URL = 'https://script.google.com/macros/s/AKfycbwLNfhqfY70U4B27BHd844ei7gWnfviVxzwmWFxcHiMQbFQYii6VhGfWOUC6qyB6GpmUA/exec';

// ローカルストレージのキー
const TOKEN_KEY = 'kintai_token';
const USER_ID_KEY = 'kintai_user_id';
const USER_NAME_KEY = 'kintai_user_name';

/**
 * JSONP方式でAPIを呼び出す汎用関数
 * @param params URLパラメータオブジェクト
 * @returns Promise<any>
 */
function callJSONP(params: Record<string, string>): Promise<any> {
  return new Promise((resolve, reject) => {
    // ユニークなコールバック関数名を生成
    const callbackName = `jsonp_callback_${Date.now()}_${Math.floor(Math.random() * 1000000)}`;
    
    // グローバルにコールバック関数を定義
    (window as any)[callbackName] = (response: any) => {
      // スクリプトを削除
      if (script.parentNode) {
        document.body.removeChild(script);
      }
      // グローバル空間からコールバック関数を削除
      delete (window as any)[callbackName];
      // レスポンスを返す
      resolve(response);
    };
    
    // URLパラメータを構築
    const urlParams = new URLSearchParams();
    // コールバック関数名を追加
    urlParams.append('callback', callbackName);
    // その他のパラメータを追加
    Object.entries(params).forEach(([key, value]) => {
      urlParams.append(key, value);
    });
    
    // スクリプトタグを作成
    const script = document.createElement('script');
    script.src = `${API_URL}?${urlParams.toString()}`;
    
    // エラーハンドリング
    script.onerror = () => {
      if (script.parentNode) {
        document.body.removeChild(script);
      }
      delete (window as any)[callbackName];
      reject(new Error('ネットワークエラーが発生しました'));
    };
    
    // タイムアウト設定（10秒）
    const timeoutId = setTimeout(() => {
      if (script.parentNode) {
        document.body.removeChild(script);
      }
      delete (window as any)[callbackName];
      reject(new Error('タイムアウトが発生しました'));
    }, 10000);
    
    // レスポンスを受け取ったらタイムアウトをクリア
    const originalCallback = (window as any)[callbackName];
    (window as any)[callbackName] = (response: any) => {
      clearTimeout(timeoutId);
      originalCallback(response);
    };
    
    // スクリプトをドキュメントに追加して実行
    document.body.appendChild(script);
  });
}

/**
 * ログイン処理
 * @param email ユーザーのメールアドレス
 * @param password ユーザーのパスワード
 * @returns ログイン結果
 */
export const login = async (email: string, password: string): Promise<{ success: boolean; error?: string }> => {
  try {
    // パラメータオブジェクトを作成
    const params: Record<string, string> = {
      action: 'login',
      email: email,
      password: password
    };
    
    // JSONP呼び出し
    const response = await callJSONP(params);
    
    if (response.success) {
      // トークンなどをローカルストレージに保存
      localStorage.setItem(TOKEN_KEY, response.token);
      localStorage.setItem(USER_ID_KEY, response.userId);
      localStorage.setItem(USER_NAME_KEY, response.userName);
      return { success: true };
    } else {
      return { success: false, error: response.error || 'ログインに失敗しました' };
    }
  } catch (error) {
    console.error('Login error:', error);
    return { success: false, error: error instanceof Error ? error.message : '通信エラーが発生しました' };
  }
};

/**
 * ログアウト処理
 */
export const logout = async (): Promise<void> => {
  const token = localStorage.getItem(TOKEN_KEY);
  
  if (token) {
    try {
      // パラメータオブジェクトを作成
      const params: Record<string, string> = {
        action: 'logout',
        token: token
      };
      
      // JSONP呼び出し
      await callJSONP(params);
    } catch (error) {
      console.error('Logout error:', error);
    }
  }

  // ローカルストレージをクリア
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_ID_KEY);
  localStorage.removeItem(USER_NAME_KEY);
};

/**
 * 勤怠データを保存
 * @param kintaiData 勤怠データ
 * @returns 保存結果
 */
export const saveKintaiToServer = async (kintaiData: KintaiData): Promise<{ success: boolean; error?: string }> => {
  const token = localStorage.getItem(TOKEN_KEY);
  
  if (!token) {
    return { success: false, error: 'ログインが必要です' };
  }

  try {
    // パラメータオブジェクトを作成
    const params: Record<string, string> = {
      action: 'saveKintai',
      token: token,
      date: kintaiData.date,
      startTime: kintaiData.startTime,
      breakTime: kintaiData.breakTime.toString(),
      endTime: kintaiData.endTime
    };
    
    // 作業場所が指定されている場合は追加
    if (kintaiData.location) {
      params.location = kintaiData.location;
    }
    
    // JSONP呼び出し
    const response = await callJSONP(params);

    if (response.success) {
      return { success: true };
    } else {
      return { success: false, error: response.error || 'データの保存に失敗しました' };
    }
  } catch (error) {
    console.error('Save kintai error:', error);
    return { success: false, error: error instanceof Error ? error.message : '通信エラーが発生しました' };
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