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
    const name = payload?.name;
    const password = payload?.password;
    
    diagInfo.nameProvided = !!name;
    diagInfo.passwordProvided = !!password;
    
    // 入力チェック
    if (!name || !password) {
      diagInfo.inputError = '名前またはパスワードが入力されていません';
      return Utils.createResponse({
        ok: false,
        err: '名前とパスワードを入力してください',
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
      const rowName = rows[i][4]; // E列 = インデックス4 = 名前
      
      if (rowName === name) {
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
        err: '名前またはパスワードが正しくありません',
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
        err: '名前またはパスワードが正しくありません',
        debug: debug ? diagInfo : undefined
      });
    }
    
    diagInfo.hashMatch = true;
    
    // スプレッドシートID抽出
    diagInfo.stage = 'spreadsheet_id_extraction';
    const fileUrl = userData.fileUrl;
    let ssId = '';
    
    // デバッグ情報を追加
    diagInfo.fileUrl = fileUrl;
    diagInfo.fileUrlType = typeof fileUrl;
    diagInfo.fileUrlLength = fileUrl ? fileUrl.length : 0;
    
    try {
      if (!fileUrl) {
        diagInfo.fileUrlEmpty = true;
        return Utils.createResponse({
          ok: false,
          err: 'ファイルURLが設定されていません。管理者にお問い合わせください。',
          debug: debug ? diagInfo : undefined
        });
      }
      
      const m = fileUrl.match(/\/d\/([A-Za-z0-9_-]+)/);
      ssId = m ? m[1] : '';
      diagInfo.spreadsheetIdExtracted = !!ssId;
      diagInfo.regexMatch = !!m;
      
      if (!ssId) {
        return Utils.createResponse({
          ok: false,
          err: 'スプレッドシートIDの取得に失敗しました。ファイルURLの形式を確認してください。',
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
      created: new Date().getTime()
      // expires設定を削除 - ログアウトするまで有効
    };
    
    PropertiesService.getScriptProperties()
      .setProperty('token_' + token, JSON.stringify(tokenInfo));
    
    return true;
  } catch (e) {
    throw new Error('トークン保存エラー: ' + e);
  }
};

/**
 * Phase 3: HMAC-SHA256 トークン検証（Netlify auth-login Function 発行）
 *  - フォーマット: header.payload.signature (3 セグメント、base64url)
 *  - 共有秘密鍵: Script Properties の NETLIFY_AUTH_SECRET
 *  - 旧形式 (token_xxx in PropertiesService) との dual support
 */
Auth.verifyHmacToken = function(token) {
  try {
    if (!token || typeof token !== 'string') return { valid: false };
    var parts = token.split('.');
    if (parts.length !== 3) return { valid: false }; // 3 segment でなければ旧形式

    var secret = PropertiesService.getScriptProperties().getProperty('NETLIFY_AUTH_SECRET');
    if (!secret) return { valid: false, reason: 'no_shared_secret' };

    // HMAC 再計算
    var unsigned = parts[0] + '.' + parts[1];
    var sigBytes = Utilities.computeHmacSha256Signature(unsigned, secret);
    var expectedSig = Utilities.base64EncodeWebSafe(sigBytes).replace(/=+$/, '');

    if (expectedSig !== parts[2]) return { valid: false, reason: 'sig_mismatch' };

    // payload デコード（base64url）
    // base64url は = padding が省略されている場合があるので補完
    var payloadB64 = parts[1];
    while (payloadB64.length % 4) payloadB64 += '=';
    var payloadStr = Utilities.newBlob(Utilities.base64DecodeWebSafe(payloadB64)).getDataAsString();
    var payload = JSON.parse(payloadStr);

    // 有効期限チェック
    var nowSec = Math.floor(new Date().getTime() / 1000);
    if (!payload.exp || payload.exp < nowSec) {
      return { valid: false, reason: 'expired' };
    }

    return {
      valid: true,
      userId: payload.sub,
      userName: payload.name,
      spreadsheetId: payload.sid,
      iat: payload.iat,
      exp: payload.exp,
      _format: 'hmac'
    };
  } catch (e) {
    return { valid: false, reason: 'parse_error', error: String(e) };
  }
};

/**
 * トークンを検証
 *  - 新形式 (HMAC) を先に試行
 *  - 旧形式 (PropertiesService) にフォールバック
 *  - 両形式で互換動作する移行期間用
 */
Auth.checkToken = function(token) {
  // 新形式: 3 セグメント (header.payload.signature) なら HMAC 検証
  if (typeof token === 'string' && token.split('.').length === 3) {
    var hmacResult = Auth.verifyHmacToken(token);
    if (hmacResult.valid) {
      return {
        valid: true,
        userId: hmacResult.userId,
        userName: hmacResult.userName,
        spreadsheetId: hmacResult.spreadsheetId
      };
    }
    // HMAC 形式だが署名・期限・秘密鍵で失敗 → 旧形式フォールバックは試さない（無意味）
    return { valid: false, reason: hmacResult.reason || 'hmac_fail' };
  }

  // 旧形式: PropertiesService の token_xxx
  try {
    var scriptProps = PropertiesService.getScriptProperties();
    var stored = scriptProps.getProperty('token_' + token);

    if (!stored) {
      return { valid: false };
    }

    try {
      var tokenInfo = JSON.parse(stored);

      // 有効期限チェック（expiresが設定されている場合のみ）
      if (tokenInfo.expires && tokenInfo.expires < new Date().getTime()) {
        scriptProps.deleteProperty('token_' + token);
        return { valid: false, reason: 'expired' };
      }

      return { valid: true, ...tokenInfo, _format: 'legacy' };
    } catch (parseErr) {
      return { valid: false, error: String(parseErr) };
    }
  } catch (e) {
    throw new Error('トークン検証エラー: ' + e);
  }
};