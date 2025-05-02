/**
 * Code.gs
 * メインエントリーポイントとリクエスト処理を提供するモジュール
 */

const VERSION = 'v9-monthly-data';

// GETリクエスト処理（ヘルスチェック）
function doGet() {
  return Utils.createResponse({ ok: true, msg: 'GAS up', version: VERSION });
}

// POSTリクエスト処理（メインエントリーポイント）
function doPost(e) {
  try {
    // 基本情報
    const diagInfo = {
      version: VERSION,
      timestamp: new Date().toISOString(),
      contentType: e.contentType || 'none',
      postDataExists: !!e.postData,
      contentsLength: e.postData ? e.postData.contents.length : 0
    };
    
    // リクエスト解析
    let parsedRequest = {};
    try {
      parsedRequest = JSON.parse(e.postData.contents || '{}');
      diagInfo.requestParsed = true;
      diagInfo.action = parsedRequest.action;
      diagInfo.debug = parsedRequest.debug;
    } catch (parseErr) {
      diagInfo.parseError = String(parseErr);
      return Utils.createResponse({
        ok: false,
        err: 'リクエスト解析エラー',
        debug: parsedRequest.debug ? diagInfo : undefined
      });
    }
    
    // アクション振り分け
    switch (parsedRequest.action) {
      case 'login':
        return Auth.handleLogin(parsedRequest.payload, parsedRequest.debug, diagInfo);
      case 'logout':
        return Auth.handleLogout(parsedRequest.token, parsedRequest.debug, diagInfo);
      case 'saveKintai':
        return Kintai.handleSaveKintai(parsedRequest.payload, parsedRequest.token, parsedRequest.debug, diagInfo);
      case 'getMonthlyData':
        return Kintai.handleGetMonthlyData(parsedRequest.payload, parsedRequest.token, parsedRequest.debug, diagInfo);
      default:
        diagInfo.error = '未対応のアクション: ' + parsedRequest.action;
        return Utils.createResponse({
          ok: false,
          err: '未対応のアクション',
          debug: parsedRequest.debug ? diagInfo : undefined
        });
    }
      
  } catch (e) {
    // 最終的なエラーハンドリング
    const errorInfo = {
      timestamp: new Date().toISOString(),
      error: String(e),
      stack: e.stack,
      version: VERSION
    };
    
    return Utils.createResponse({
      ok: false,
      err: 'サーバーエラー',
      debug: errorInfo
    });
  }
}