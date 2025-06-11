/**  Code.gs                                        2025-06-08
 *  ───────────────────────────────────────────────────
 *  勤怠管理 App Script - メインエントリーポイント
 *  - リクエスト処理
 *  - バージョン管理
 *  - API エンドポイント
 *  ───────────────────────────────────────────────────
 */

const VERSION = "v10-version-management";
const VERSION_HISTORY = [
  { version: "v1-initial", date: "2024-01-01", description: "初期バージョン" },
  { version: "v2-auth", date: "2024-02-01", description: "認証機能追加" },
  { version: "v3-kintai", date: "2024-03-01", description: "勤怠入力機能追加" },
  {
    version: "v4-monthly",
    date: "2024-04-01",
    description: "月次表示機能追加",
  },
  { version: "v5-break", date: "2024-05-01", description: "休憩時間機能追加" },
  {
    version: "v6-location",
    date: "2024-06-01",
    description: "勤務場所機能追加",
  },
  { version: "v7-mobile", date: "2024-07-01", description: "モバイル対応" },
  { version: "v8-ui-improvements", date: "2024-08-01", description: "UI改善" },
  {
    version: "v9-monthly-data",
    date: "2024-09-01",
    description: "月次データ機能強化",
  },
  {
    version: "v10-version-management",
    date: "2025-01-13",
    description: "バージョン管理機能追加",
  },
];

// GETリクエスト処理（ヘルスチェック）
function doGet() {
  return Utils.createResponse({ ok: true, msg: "GAS up", version: VERSION });
}

// OPTIONSリクエスト処理（CORS プリフライト）
function doOptions() {
  return Utils.createResponse({
    ok: true,
    msg: "CORS preflight OK",
    version: VERSION,
  });
}

// POSTリクエスト処理（メインエントリーポイント）
function doPost(e) {
  try {
    // 基本情報
    const diagInfo = {
      version: VERSION,
      timestamp: new Date().toISOString(),
      contentType: e.contentType || "none",
      postDataExists: !!e.postData,
      contentsLength: e.postData ? e.postData.contents.length : 0,
    };

    // リクエスト解析
    let parsedRequest = {};
    try {
      // Content-Type が text/plain の場合でも JSON として解析
      const requestBody = e.postData.contents || "{}";
      parsedRequest = JSON.parse(requestBody);
      diagInfo.requestParsed = true;
      diagInfo.action = parsedRequest.action;
      diagInfo.debug = parsedRequest.debug;
      diagInfo.contentTypeHandled = "text/plain compatible";
    } catch (parseErr) {
      diagInfo.parseError = String(parseErr);
      return Utils.createResponse({
        ok: false,
        err: "リクエスト解析エラー",
        debug: parsedRequest.debug ? diagInfo : undefined,
      });
    }

    // アクション振り分け
    switch (parsedRequest.action) {
      case "login":
        return Auth.handleLogin(
          parsedRequest.payload,
          parsedRequest.debug,
          diagInfo
        );
      case "logout":
        return Auth.handleLogout(
          parsedRequest.token,
          parsedRequest.debug,
          diagInfo
        );
      case "saveKintai":
        return Kintai.handleSaveKintai(
          parsedRequest.token,
          parsedRequest.payload,
          parsedRequest.debug,
          diagInfo
        );
      case "getMonthlyData":
        return Kintai.handleGetMonthlyData(
          parsedRequest.payload,
          parsedRequest.token,
          parsedRequest.debug,
          diagInfo
        );
      case "getVersion":
        return handleGetVersion(parsedRequest.debug, diagInfo);
      case "getVersionHistory":
        return handleGetVersionHistory(parsedRequest.debug, diagInfo);
      case "findCustomerByCode":
        return MasterConfig.handleFindCustomerByCode(
          parsedRequest.payload,
          parsedRequest.debug,
          diagInfo
        );
      case "registerNewCustomer":
        return MasterConfig.handleRegisterNewCustomer(
          parsedRequest.payload,
          parsedRequest.debug,
          diagInfo
        );
      case "updateCustomerSpreadsheet":
        return MasterConfig.handleUpdateCustomerSpreadsheet(
          parsedRequest.payload,
          parsedRequest.debug,
          diagInfo
        );
      case "initializeMasterSpreadsheet":
        return MasterConfig.handleInitializeMasterSpreadsheet(
          parsedRequest.debug,
          diagInfo
        );
      default:
        diagInfo.error = "未対応のアクション: " + parsedRequest.action;
        return Utils.createResponse({
          ok: false,
          err: "未対応のアクション",
          debug: parsedRequest.debug ? diagInfo : undefined,
        });
    }
  } catch (e) {
    // 最終的なエラーハンドリング
    const errorInfo = {
      timestamp: new Date().toISOString(),
      error: String(e),
      stack: e.stack,
      version: VERSION,
    };

    return Utils.createResponse({
      ok: false,
      err: "サーバーエラー",
      debug: errorInfo,
    });
  }
}

/**
 * バージョン情報取得
 */
function handleGetVersion(debug, diagInfo) {
  try {
    const versionInfo = {
      version: VERSION,
      timestamp: new Date().toISOString(),
      description: VERSION_HISTORY[VERSION_HISTORY.length - 1].description,
    };

    return Utils.createResponse({
      ok: true,
      data: versionInfo,
      debug: debug ? diagInfo : undefined,
    });
  } catch (e) {
    return Utils.createResponse({
      ok: false,
      err: "バージョン情報取得エラー: " + String(e),
      debug: debug ? diagInfo : undefined,
    });
  }
}

/**
 * バージョン履歴取得
 */
function handleGetVersionHistory(debug, diagInfo) {
  try {
    return Utils.createResponse({
      ok: true,
      data: VERSION_HISTORY,
      debug: debug ? diagInfo : undefined,
    });
  } catch (e) {
    return Utils.createResponse({
      ok: false,
      err: "バージョン履歴取得エラー: " + String(e),
      debug: debug ? diagInfo : undefined,
    });
  }
}
