/**  Utils.gs                                        2025‑04‑21-fix
 *  ───────────────────────────────────────────────────
 *  勤怠管理 App Script - ユーティリティ関数
 *  - JSON出力
 *  - ハッシュ計算
 *  - トークン生成
 *  ───────────────────────────────────────────────────
 */

// Utilsの名前空間定義
var Utils = {};

/**
 * 統一されたJSONレスポンス出力関数
 * CORS対応済み
 */
Utils.createResponse = function(obj) {
  try {
    // バージョン情報を追加
    if (!obj.version) {
      obj.version = VERSION;
    }
    
    const jsonString = JSON.stringify(obj);
    const output = ContentService
      .createTextOutput(jsonString)
      .setMimeType(ContentService.MimeType.JSON);
    
    // CORSヘッダー設定はContentServiceでは不可のため削除
    return output;
  } catch (jsonErr) {
    // JSON変換エラーのフォールバック
    const fallbackOutput = ContentService
      .createTextOutput(JSON.stringify({
        ok: false,
        version: VERSION,
        err: 'JSONエンコードエラー: ' + String(jsonErr)
      }))
      .setMimeType(ContentService.MimeType.JSON);
    
    // CORSヘッダー設定はContentServiceでは不可のため削除
    return fallbackOutput;
  }
};

/**
 * パスワードとソルトからハッシュを計算する関数
 * 16進数形式を使用
 */
Utils.computeHash = function(password, salt) {
  // パスワードとソルトを結合
  const combined = password + salt;
  
  // SHA-256でハッシュ化
  const rawHash = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    combined,
    Utilities.Charset.UTF_8
  );
  
  // 16進数文字列に変換
  let hashHex = '';
  for (let i = 0; i < rawHash.length; i++) {
    const hashByte = (rawHash[i] < 0 ? rawHash[i] + 256 : rawHash[i]).toString(16);
    hashHex += (hashByte.length == 1 ? '0' : '') + hashByte;
  }
  
  return hashHex;
};

/**
 * ユーザーIDからトークンを生成
 */
Utils.generateToken = function(userId) {
  const tokenBase = userId + Date.now() + Math.random();
  
  // SHA-256でハッシュ化
  const rawToken = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    tokenBase,
    Utilities.Charset.UTF_8
  );
  
  // 16進数文字列に変換
  let tokenHex = '';
  for (let i = 0; i < rawToken.length; i++) {
    const tokenByte = (rawToken[i] < 0 ? rawToken[i] + 256 : rawToken[i]).toString(16);
    tokenHex += (tokenByte.length == 1 ? '0' : '') + tokenByte;
  }
  
  return tokenHex;
};

/**
 * 互換性のための旧関数名エイリアス
 */
function createJsonResponse(obj) {
  Logger.log('警告: 非推奨の関数 createJsonResponse が呼び出されました');
  return Utils.createResponse(obj);
}

function outputJSON(obj) {
  Logger.log('警告: 非推奨の関数 outputJSON が呼び出されました');
  return Utils.createResponse(obj);
}

function jsonOut(obj) {
  Logger.log('警告: 非推奨の関数 jsonOut が呼び出されました');
  return Utils.createResponse(obj);
}