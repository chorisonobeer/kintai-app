/**  Auth.gs                                        2025‑04‑21-fix
 *  ───────────────────────────────────────────────────
 *  勤怠管理 App Script - 認証機能
 *  - ログイン処理
 *  - ログアウト処理
 *  - トークン管理
 *  ───────────────────────────────────────────────────
 */

// 共通設定
const MEMBER_SPREADSHEET_ID = '1XF8QIoudGmRSYavHZ4CkZQjlEUlaaEULxcuWZVOlIuE';

// Auth名前空間の定義
var Auth = {};

/**
 * ログイン処理
 */
Auth.handleLogin = function(payload, debug, diagInfo) {
  diagInfo.stage = 'login';
  
  try {
    const email = payload?.email;
    const password = payload?.password;
    
    diagInfo.emailProvided = !!email;
    diagInfo.passwordProvided = !!password;
    
    // 入力チェック
    if (!email || !password) {
      diagInfo.inputError = 'メールアドレスまたはパスワードが入力されていません';
      return Utils.createResponse({
        ok: false,
        err: 'メールアドレスとパスワードを入力してください',
        debug: debug ? diagInfo : undefined
      });
    }
    
    // スプレッドシートアクセス
    diagInfo.stage = 'sheet_access';
    let ss, sheet;
    try {
      ss = SpreadsheetApp.openById(MEMBER_SPREADSHEET_ID);
      sheet = ss.getSheetByName('メンバーリスト');
      
      if (!sheet) {
        diagInfo.sheetError = 'メンバーリストシートが見つかりません';
        return Utils.createResponse({
          ok: false,
          err: 'メンバーリストシートが見つかりません',
          debug: debug ? diagInfo : undefined
        });
      }
      
      diagInfo.sheetFound = true;
    } catch (sheetErr) {
      diagInfo.sheetError = String(sheetErr);
      return Utils.createResponse({
        ok: false,
        err: 'スプレッドシートアクセスエラー',
        debug: debug ? diagInfo : undefined
      });
    }
    
    // データ取得
    diagInfo.stage = 'data_fetch';
    let rows;
    try {
      rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues();
      diagInfo.rowCount = rows.length;
    } catch (dataErr) {
      diagInfo.dataError = String(dataErr);
      return Utils.createResponse({
        ok: false,
        err: 'データ取得エラー',
        debug: debug ? diagInfo : undefined
      });
    }
    
    // ユーザー検索
    diagInfo.stage = 'user_search';
    let userFound = false;
    let userData = null;
    let userSalt = '';
    let userHash = '';
    
    for (let i = 0; i < rows.length; i++) {
      const rowEmail = rows[i][6]; // G列 = インデックス6 = メールアドレス
      
      if (rowEmail === email) {
        userFound = true;
        userSalt = rows[i][2]; // C列 = インデックス2 = ソルト
        userHash = rows[i][3]; // D列 = インデックス3 = ハッシュ
        userData = {
          userId: rows[i][1],      // B列 = インデックス1 = ユニークID
          userName: rows[i][4],    // E列 = インデックス4 = 名前
          fileUrl: rows[i][8]      // I列 = インデックス8 = ファイルURL
        };
        diagInfo.rowIndex = i + 2; // 実際の行番号（ヘッダー + 0ベースインデックス補正）
        break;
      }
    }
    
    diagInfo.userFound = userFound;
    
    if (!userFound) {
      return Utils.createResponse({
        ok: false,
        err: 'メールアドレスまたはパスワードが正しくありません',
        debug: debug ? diagInfo : undefined
      });
    }
    
    // パスワード検証
    diagInfo.stage = 'password_verification';
    let computedHash;
    try {
      computedHash = Utils.computeHash(password, userSalt);
      
      // デバッグ情報（セキュリティ上、ハッシュ値の先頭8文字のみ表示）
      if (debug) {
        diagInfo.storedHashPrefix = userHash.substring(0, 8) + '...';
        diagInfo.computedHashPrefix = computedHash.substring(0, 8) + '...';
      }
    } catch (hashErr) {
      diagInfo.hashError = String(hashErr);
      return Utils.createResponse({
        ok: false,
        err: 'パスワード検証エラー',
        debug: debug ? diagInfo : undefined
      });
    }
    
    // ハッシュの比較
    if (computedHash !== userHash) {
      diagInfo.hashMatch = false;
      return Utils.createResponse({
        ok: false,
        err: 'メールアドレスまたはパスワードが正しくありません',
        debug: debug ? diagInfo : undefined
      });
    }
    
    diagInfo.hashMatch = true;
    
    // スプレッドシートID抽出
    diagInfo.stage = 'spreadsheet_id_extraction';
    const fileUrl = userData.fileUrl;
    let ssId = '';
    
    try {
      const m = fileUrl.match(/\/d\/([A-Za-z0-9_-]+)/);
      ssId = m ? m[1] : '';
      diagInfo.spreadsheetIdExtracted = !!ssId;
      
      if (!ssId) {
        return Utils.createResponse({
          ok: false,
          err: 'スプレッドシートIDの取得に失敗しました',
          debug: debug ? diagInfo : undefined
        });
      }
    } catch (extractErr) {
      diagInfo.extractError = String(extractErr);
      return Utils.createResponse({
        ok: false,
        err: 'スプレッドシートID取得エラー',
        debug: debug ? diagInfo : undefined
      });
    }
    
    // トークン生成
    diagInfo.stage = 'token_generation';
    let token;
    try {
      token = Utils.generateToken(userData.userId);
      diagInfo.tokenGenerated = true;
    } catch (tokenErr) {
      diagInfo.tokenError = String(tokenErr);
      return Utils.createResponse({
        ok: false,
        err: 'トークン生成エラー',
        debug: debug ? diagInfo : undefined
      });
    }
    
    // トークン保存
    diagInfo.stage = 'token_storage';
    try {
      Auth.storeToken(token, userData.userId, userData.userName, ssId);
      diagInfo.tokenStored = true;
    } catch (storeErr) {
      diagInfo.storeError = String(storeErr);
      return Utils.createResponse({
        ok: false,
        err: 'トークン保存エラー',
        debug: debug ? diagInfo : undefined
      });
    }
    
    // 成功レスポンス
    return Utils.createResponse({
      ok: true,
      token: token,
      userId: userData.userId,
      userName: userData.userName,
      spreadsheetId: ssId,
      debug: debug ? diagInfo : undefined
    });
    
  } catch (loginErr) {
    diagInfo.loginError = String(loginErr);
    diagInfo.stack = loginErr.stack;
    
    return Utils.createResponse({
      ok: false,
      err: 'ログインエラー',
      debug: debug ? diagInfo : undefined
    });
  }
};

/**
 * ログアウト処理
 */
Auth.handleLogout = function(token, debug, diagInfo) {
  diagInfo.stage = 'logout';
  
  try {
    if (!token) {
      diagInfo.noToken = true;
      return Utils.createResponse({
        ok: true,
        msg: 'トークンなしでのログアウト',
        debug: debug ? diagInfo : undefined
      });
    }
    
    // トークンを削除
    try {
      const scriptProps = PropertiesService.getScriptProperties();
      scriptProps.deleteProperty('token_' + token);
      diagInfo.tokenDeleted = true;
    } catch (deleteErr) {
      diagInfo.deleteError = String(deleteErr);
      return Utils.createResponse({
        ok: false,
        err: 'トークン削除エラー',
        debug: debug ? diagInfo : undefined
      });
    }
    
    return Utils.createResponse({
      ok: true,
      msg: 'ログアウトしました',
      debug: debug ? diagInfo : undefined
    });
    
  } catch (logoutErr) {
    diagInfo.logoutError = String(logoutErr);
    
    return Utils.createResponse({
      ok: false,
      err: 'ログアウトエラー',
      debug: debug ? diagInfo : undefined
    });
  }
};

/**
 * トークンをPropertiesServiceに保存
 */
Auth.storeToken = function(token, userId, userName, spreadsheetId) {
  try {
    const tokenInfo = {
      userId: userId,
      userName: userName,
      spreadsheetId: spreadsheetId,
      created: new Date().getTime(),
      expires: new Date().getTime() + (7 * 24 * 60 * 60 * 1000) // 7日間有効
    };
    
    PropertiesService.getScriptProperties()
      .setProperty('token_' + token, JSON.stringify(tokenInfo));
    
    return true;
  } catch (e) {
    throw new Error('トークン保存エラー: ' + e);
  }
};

/**
 * トークンを検証
 */
Auth.checkToken = function(token) {
  try {
    const scriptProps = PropertiesService.getScriptProperties();
    const stored = scriptProps.getProperty('token_' + token);
    
    if (!stored) {
      return { valid: false };
    }
    
    try {
      const tokenInfo = JSON.parse(stored);
      
      // 有効期限チェック
      if (tokenInfo.expires && tokenInfo.expires < new Date().getTime()) {
        // 期限切れならトークンを削除
        scriptProps.deleteProperty('token_' + token);
        return { valid: false, reason: 'expired' };
      }
      
      return { valid: true, ...tokenInfo };
    } catch (parseErr) {
      return { valid: false, error: String(parseErr) };
    }
  } catch (e) {
    throw new Error('トークン検証エラー: ' + e);
  }
};