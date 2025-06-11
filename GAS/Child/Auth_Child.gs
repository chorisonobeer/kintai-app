/**
 * 子プロジェクト用認証機能
 * 2025-06-08T15:00+09:00
 * 変更概要: 新規作成 - 子プロジェクト用認証機能（設定されたスプレッドシートIDを使用）
 */

// Auth_Child名前空間の定義
var Auth_Child = {};

/**
 * 子プロジェクト用ログイン処理
 * 設定されたスプレッドシートIDを使用して認証を行う
 */
Auth_Child.handleLogin = function (payload, debug, diagInfo) {
  diagInfo.stage = "child_login";

  try {
    const name = payload?.name;
    const password = payload?.password;

    diagInfo.nameProvided = !!name;
    diagInfo.passwordProvided = !!password;

    // 入力チェック
    if (!name || !password) {
      diagInfo.inputError = "名前またはパスワードが入力されていません";
      return Utils.createResponse({
        ok: false,
        err: "名前とパスワードを入力してください",
        debug: debug ? diagInfo : undefined,
      });
    }

    // 設定されたスプレッドシートIDを取得
    diagInfo.stage = "get_auth_spreadsheet_id";
    let authSpreadsheetId;
    try {
      authSpreadsheetId = PropertiesService.getScriptProperties().getProperty(
        "AUTH_SPREADSHEET_ID"
      );

      if (!authSpreadsheetId) {
        diagInfo.authSpreadsheetIdError =
          "認証用スプレッドシートIDが設定されていません";
        return Utils.createResponse({
          ok: false,
          err: "認証用スプレッドシートが設定されていません。初回セットアップを実行してください。",
          debug: debug ? diagInfo : undefined,
        });
      }

      diagInfo.authSpreadsheetIdFound = true;
    } catch (propErr) {
      diagInfo.propertyError = String(propErr);
      return Utils.createResponse({
        ok: false,
        err: "プロパティ取得エラー",
        debug: debug ? diagInfo : undefined,
      });
    }

    // 認証用スプレッドシートアクセス
    diagInfo.stage = "auth_sheet_access";
    let authSs, authSheet;
    try {
      authSs = SpreadsheetApp.openById(authSpreadsheetId);
      authSheet = authSs.getSheetByName("メンバーリスト");

      if (!authSheet) {
        diagInfo.authSheetError =
          "認証用スプレッドシートにメンバーリストシートが見つかりません";
        return Utils.createResponse({
          ok: false,
          err: "認証用スプレッドシートの構成が正しくありません",
          debug: debug ? diagInfo : undefined,
        });
      }

      diagInfo.authSheetFound = true;
    } catch (authSheetErr) {
      diagInfo.authSheetError = String(authSheetErr);
      return Utils.createResponse({
        ok: false,
        err: "認証用スプレッドシートアクセスエラー",
        debug: debug ? diagInfo : undefined,
      });
    }

    // データ取得
    diagInfo.stage = "auth_data_fetch";
    let rows;
    try {
      rows = authSheet
        .getRange(2, 1, authSheet.getLastRow() - 1, authSheet.getLastColumn())
        .getValues();
      diagInfo.rowCount = rows.length;
    } catch (dataErr) {
      diagInfo.dataError = String(dataErr);
      return Utils.createResponse({
        ok: false,
        err: "データ取得エラー",
        debug: debug ? diagInfo : undefined,
      });
    }

    // ユーザー検索
    diagInfo.stage = "user_search";
    let userFound = false;
    let userData = null;
    let userSalt = "";
    let userHash = "";

    for (let i = 0; i < rows.length; i++) {
      const rowName = rows[i][4]; // E列 = インデックス4 = 名前

      if (rowName === name) {
        userFound = true;
        userSalt = rows[i][2]; // C列 = インデックス2 = ソルト
        userHash = rows[i][3]; // D列 = インデックス3 = ハッシュ
        userData = {
          userId: rows[i][1], // B列 = インデックス1 = ユニークID
          userName: rows[i][4], // E列 = インデックス4 = 名前
          fileUrl: rows[i][8], // I列 = インデックス8 = ファイルURL
        };
        diagInfo.rowIndex = i + 2; // 実際の行番号（ヘッダー + 0ベースインデックス補正）
        break;
      }
    }

    diagInfo.userFound = userFound;

    if (!userFound) {
      return Utils.createResponse({
        ok: false,
        err: "名前またはパスワードが正しくありません",
        debug: debug ? diagInfo : undefined,
      });
    }

    // パスワード検証
    diagInfo.stage = "password_verification";
    let computedHash;
    try {
      computedHash = Utils.computeHash(password, userSalt);

      // デバッグ情報（セキュリティ上、ハッシュ値の先頭8文字のみ表示）
      if (debug) {
        diagInfo.storedHashPrefix = userHash.substring(0, 8) + "...";
        diagInfo.computedHashPrefix = computedHash.substring(0, 8) + "...";
      }
    } catch (hashErr) {
      diagInfo.hashError = String(hashErr);
      return Utils.createResponse({
        ok: false,
        err: "パスワード検証エラー",
        debug: debug ? diagInfo : undefined,
      });
    }

    // ハッシュの比較
    if (computedHash !== userHash) {
      diagInfo.hashMatch = false;
      return Utils.createResponse({
        ok: false,
        err: "名前またはパスワードが正しくありません",
        debug: debug ? diagInfo : undefined,
      });
    }

    diagInfo.hashMatch = true;

    // 現在のスプレッドシートID取得（子プロジェクトのスプレッドシート）
    diagInfo.stage = "current_spreadsheet_id_extraction";
    let currentSsId = "";

    try {
      const currentSs = SpreadsheetApp.getActiveSpreadsheet();
      currentSsId = currentSs.getId();
      diagInfo.currentSpreadsheetIdExtracted = !!currentSsId;

      if (!currentSsId) {
        return Utils.createResponse({
          ok: false,
          err: "現在のスプレッドシートIDの取得に失敗しました。",
          debug: debug ? diagInfo : undefined,
        });
      }
    } catch (extractErr) {
      diagInfo.extractError = String(extractErr);
      return Utils.createResponse({
        ok: false,
        err: "スプレッドシートID取得エラー",
        debug: debug ? diagInfo : undefined,
      });
    }

    // トークン生成
    diagInfo.stage = "token_generation";
    let token;
    try {
      token = Utils.generateToken(userData.userId);
      diagInfo.tokenGenerated = true;
    } catch (tokenErr) {
      diagInfo.tokenError = String(tokenErr);
      return Utils.createResponse({
        ok: false,
        err: "トークン生成エラー",
        debug: debug ? diagInfo : undefined,
      });
    }

    // トークン保存
    diagInfo.stage = "token_storage";
    try {
      Auth_Child.storeToken(token, userData.userId, userData.userName);
      diagInfo.tokenStored = true;
    } catch (storeErr) {
      diagInfo.storeError = String(storeErr);
      return Utils.createResponse({
        ok: false,
        err: "トークン保存エラー",
        debug: debug ? diagInfo : undefined,
      });
    }

    // 成功レスポンス
    return Utils.createResponse({
      ok: true,
      msg: "ログイン成功",
      token: token,
      ssId: currentSsId,
      userId: userData.userId,
      userName: userData.userName,
      debug: debug ? diagInfo : undefined,
    });
  } catch (loginErr) {
    diagInfo.loginError = String(loginErr);
    diagInfo.stack = loginErr.stack;

    return Utils.createResponse({
      ok: false,
      err: "ログインエラー",
      debug: debug ? diagInfo : undefined,
    });
  }
};

/**
 * 子プロジェクト用ログアウト処理
 */
Auth_Child.handleLogout = function (token, debug, diagInfo) {
  diagInfo.stage = "child_logout";

  try {
    if (!token) {
      diagInfo.noToken = true;
      return Utils.createResponse({
        ok: true,
        msg: "トークンなしでのログアウト",
        debug: debug ? diagInfo : undefined,
      });
    }

    // トークンを削除
    try {
      const scriptProps = PropertiesService.getScriptProperties();
      scriptProps.deleteProperty("token_" + token);
      diagInfo.tokenDeleted = true;
    } catch (deleteErr) {
      diagInfo.deleteError = String(deleteErr);
      return Utils.createResponse({
        ok: false,
        err: "トークン削除エラー",
        debug: debug ? diagInfo : undefined,
      });
    }

    return Utils.createResponse({
      ok: true,
      msg: "ログアウトしました",
      debug: debug ? diagInfo : undefined,
    });
  } catch (logoutErr) {
    diagInfo.logoutError = String(logoutErr);

    return Utils.createResponse({
      ok: false,
      err: "ログアウトエラー",
      debug: debug ? diagInfo : undefined,
    });
  }
};

/**
 * トークンをPropertiesServiceに保存
 */
Auth_Child.storeToken = function (token, userId, userName) {
  try {
    const tokenInfo = {
      userId: userId,
      userName: userName,
      created: new Date().getTime(),
      // expires設定を削除 - ログアウトするまで有効
    };

    PropertiesService.getScriptProperties().setProperty(
      "token_" + token,
      JSON.stringify(tokenInfo)
    );

    return true;
  } catch (e) {
    throw new Error("トークン保存エラー: " + e);
  }
};

/**
 * トークンを検証
 */
Auth_Child.checkToken = function (token) {
  try {
    const scriptProps = PropertiesService.getScriptProperties();
    const stored = scriptProps.getProperty("token_" + token);

    if (!stored) {
      return { valid: false };
    }

    try {
      const tokenInfo = JSON.parse(stored);

      // 有効期限チェック（expiresが設定されている場合のみ）
      if (tokenInfo.expires && tokenInfo.expires < new Date().getTime()) {
        // 期限切れならトークンを削除
        scriptProps.deleteProperty("token_" + token);
        return { valid: false, reason: "expired" };
      }
      // expiresが設定されていない場合は期限切れチェックをスキップ（ログアウトまで有効）

      return { valid: true, ...tokenInfo };
    } catch (parseErr) {
      return { valid: false, error: String(parseErr) };
    }
  } catch (e) {
    throw new Error("トークン検証エラー: " + e);
  }
};
