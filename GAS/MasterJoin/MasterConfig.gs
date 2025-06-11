/**
 * MasterConfig.gs
 * 2025-01-15T11:00:00+09:00
 * 変更概要: doPost(e)関数を追加し、APIとして機能するように修正
 */

function doOptions(e) {
  return ContentService.createTextOutput()
    .setMimeType(ContentService.MimeType.JSON)
    .withHeaders({
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
    });
}

function doGet(e) {
  let response;
  try {
    console.log("[DEBUG] GAS doGet: Received event object (e):", JSON.stringify(e, null, 2));
    if (!e || !e.parameter) {
      console.error("[ERROR] GAS doGet: Event object or parameter is missing.");
      throw new Error("Invalid GET data: Event object or parameter is missing.");
    }

    const action = e.parameter.action;
    console.log("[DEBUG] GAS doGet: Action:", action);

    if (action === 'findCustomerByCode') {
      const customerCode = e.parameter.customerCode;
      if (!customerCode) {
        throw new Error("'customerCode' is required for 'findCustomerByCode' action via GET.");
      }
      console.log("[DEBUG] GAS doGet: customerCode:", customerCode);
      response = findCustomerByCode(customerCode);
    } else if (action === 'getServerNames') {
      response = getServerNames();
    } else if (action === 'getConfig') { // test-api.ps1 からの action に対応
      response = {
        success: true,
        message: "getConfig action processed successfully via GET (test data)",
        data: { version: "1.0.0", environment: "development" }
      };
    } else {
      throw new Error(`Unknown action via GET: ${action}`);
    }
  } catch (error) {
    console.error("doGet Error:", error.toString(), JSON.stringify(e, null, 2));
    response = {
      success: false,
      error: error.toString(),
      message: "Error processing GET request in doGet."
    };
  }
  return ContentService.createTextOutput(JSON.stringify(response))
                     .setMimeType(ContentService.MimeType.JSON)
                     .withHeaders({
                       'Access-Control-Allow-Origin': '*', // doGetでもCORSヘッダーを返す
                       'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
                       'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With'
                     });
}

function doPost(e) {
  let response;
  try {
    console.log("[DEBUG] GAS doPost: Received event object (e):", JSON.stringify(e, null, 2));
    if (!e || !e.postData) {
      console.error("[ERROR] GAS doPost: Event object or postData is missing.");
      throw new Error("Invalid POST data: Event object or postData is missing.");
    }
    console.log("[DEBUG] GAS doPost: e.postData.type:", e.postData.type);
    console.log("[DEBUG] GAS doPost: e.postData.length:", e.postData.length);
    console.log("[DEBUG] GAS doPost: e.postData.contents (raw):", e.postData.contents);

    if (!e.postData.contents) {
      console.error("[ERROR] GAS doPost: e.postData.contents is missing or empty.");
      throw new Error("Invalid POST data: e.postData.contents is missing or empty.");
    }

    const params = JSON.parse(e.postData.contents);

    if (params.action === 'findCustomerByCode') {
      if (!params.customerCode) {
        throw new Error("'customerCode' is required for 'findCustomerByCode' action.");
      }
      response = findCustomerByCode(params.customerCode);
    } else if (params.action === 'getConfig') { // test-api.ps1 からの action に対応
      // getConfig の具体的な処理をここに実装 (例: 固定のテストデータを返す)
      response = {
        success: true,
        message: "getConfig action processed successfully (test data)",
        data: { version: "1.0.0", environment: "development" }
      };
    } else {
      throw new Error(`Unknown action: ${params.action}`);
    }
  } catch (error) {
    console.error("doPost Error:", error.toString(), JSON.stringify(e, null, 2));
    response = {
      success: false,
      error: error.toString(),
      message: "Error processing request in doPost."
    };
  }
  return ContentService.createTextOutput(JSON.stringify(response))
                     .setMimeType(ContentService.MimeType.JSON)
                     .withHeaders({
                       'Access-Control-Allow-Origin': '*',
                       'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
                       'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With'
                     });
}


/**
 * シンプルなスプレッドシート読み取りテスト
 * フルURLでアクセスしてヘッダー行を取得する
 */
function testSimpleSpreadsheetAccess() {
  try {
    // フルURLからスプレッドシートIDを抽出
    const fullUrl =
      "https://docs.google.com/spreadsheets/d/1If92tWrQIsOy6y-W6838w7mdJJHGxL0_P6GgwIVo3A8/edit?gid=0#gid=0";
    const spreadsheetId = extractSpreadsheetId(fullUrl);

    console.log("スプレッドシートID:", spreadsheetId);

    // スプレッドシートを開く
    const spreadsheet = SpreadsheetApp.openById(spreadsheetId);
    console.log("スプレッドシート名:", spreadsheet.getName());

    // シート1を取得
    const sheet = spreadsheet.getSheetByName("シート1");
    if (!sheet) {
      throw new Error("シート1が見つかりません");
    }

    console.log("シート名:", sheet.getName());

    // ヘッダー行（1行目）を取得
    const headerRange = sheet.getRange(1, 1, 1, sheet.getLastColumn());
    const headerValues = headerRange.getValues()[0];

    console.log("ヘッダー行:", headerValues);

    // 結果を返す
    return {
      success: true,
      spreadsheetName: spreadsheet.getName(),
      sheetName: sheet.getName(),
      headers: headerValues,
      message: "スプレッドシートの読み取りに成功しました",
    };
  } catch (error) {
    console.error("エラー:", error.toString());
    return {
      success: false,
      error: error.toString(),
      message: "スプレッドシートの読み取りに失敗しました",
    };
  }
}

/**
 * D列のサーバー名データを抽出する
 * @return {Object} サーバー名リストまたはエラー情報
 */
function getServerNames() {
  try {
    // フルURLからスプレッドシートIDを抽出
    const fullUrl =
      "https://docs.google.com/spreadsheets/d/1If92tWrQIsOy6y-W6838w7mdJJHGxL0_P6GgwIVo3A8/edit?gid=0#gid=0";
    const spreadsheetId = extractSpreadsheetId(fullUrl);

    console.log("スプレッドシートID:", spreadsheetId);

    // スプレッドシートを開く
    const spreadsheet = SpreadsheetApp.openById(spreadsheetId);
    console.log("スプレッドシート名:", spreadsheet.getName());

    // シート1を取得
    const sheet = spreadsheet.getSheetByName("シート1");
    if (!sheet) {
      throw new Error("シート1が見つかりません");
    }

    console.log("シート名:", sheet.getName());

    // D列のデータを取得（ヘッダー行を除く2行目から最終行まで）
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) {
      return {
        success: true,
        serverNames: [],
        count: 0,
        message: "データが見つかりません（ヘッダー行のみ）",
      };
    }

    // D列（4列目）のデータを取得
    const serverRange = sheet.getRange(2, 4, lastRow - 1, 1);
    const serverValues = serverRange.getValues();

    // 空でない値のみを抽出
    const serverNames = serverValues
      .map((row) => row[0])
      .filter((value) => value !== null && value !== undefined && value !== "");

    console.log("サーバー名リスト:", serverNames);
    console.log("サーバー数:", serverNames.length);

    // 結果を返す
    return {
      success: true,
      serverNames: serverNames,
      count: serverNames.length,
      message: `D列から${serverNames.length}個のサーバー名を取得しました`,
    };
  } catch (error) {
    console.error("エラー:", error.toString());
    return {
      success: false,
      error: error.toString(),
      message: "D列のサーバー名取得に失敗しました",
    };
  }
}

/**
 * 顧客コード（サーバー名）で顧客情報を検索する
 * @param {string} customerCode - 検索する顧客コード（サーバー名）
 * @return {Object} 顧客情報またはエラー情報
 */
function findCustomerByCode(customerCode) {
  try {
    // 入力値チェック
    if (
      !customerCode ||
      typeof customerCode !== "string" ||
      customerCode.trim() === ""
    ) {
      return {
        success: false,
        error: "顧客コードが指定されていません",
        message: "顧客コードを正しく指定してください",
      };
    }

    const searchCustomerCode = customerCode.trim();

    // フルURLからスプレッドシートIDを抽出
    const fullUrl =
      "https://docs.google.com/spreadsheets/d/1If92tWrQIsOy6y-W6838w7mdJJHGxL0_P6GgwIVo3A8/edit?gid=0#gid=0";
    const spreadsheetId = extractSpreadsheetId(fullUrl);

    console.log("スプレッドシートID:", spreadsheetId);
    console.log("検索する顧客コード:", searchCustomerCode);

    // スプレッドシートを開く
    const spreadsheet = SpreadsheetApp.openById(spreadsheetId);
    console.log("スプレッドシート名:", spreadsheet.getName());

    // シート1を取得
    const sheet = spreadsheet.getSheetByName("シート1");
    if (!sheet) {
      throw new Error("シート1が見つかりません");
    }

    console.log("シート名:", sheet.getName());

    // データ範囲を取得（ヘッダー行を除く2行目から最終行まで）
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) {
      return {
        success: false,
        error: "データが見つかりません",
        message: "スプレッドシートにデータが存在しません（ヘッダー行のみ）",
      };
    }

    // D列（サーバー名）とE列（スプレッドシートID）のデータを取得
    const dataRange = sheet.getRange(2, 4, lastRow - 1, 2); // D列とE列
    const dataValues = dataRange.getValues();

    console.log("取得したデータ行数:", dataValues.length);

    // 顧客コードで検索
    for (let i = 0; i < dataValues.length; i++) {
      const rowServerName = dataValues[i][0]; // D列の値
      const rowSpreadsheetId = dataValues[i][1]; // E列の値

      // 顧客コードが一致するかチェック（大文字小文字を区別しない）
      if (
        rowServerName &&
        typeof rowServerName === "string" &&
        rowServerName.trim().toLowerCase() === searchCustomerCode.toLowerCase()
      ) {
        console.log("一致する顧客コードが見つかりました:", rowServerName);
        console.log("対応するスプレッドシートID:", rowSpreadsheetId);

        // スプレッドシートIDが存在するかチェック
        if (
          !rowSpreadsheetId ||
          typeof rowSpreadsheetId !== "string" ||
          rowSpreadsheetId.trim() === ""
        ) {
          return {
            success: false,
            error: "スプレッドシートIDが設定されていません",
            message: `顧客コード「${searchCustomerCode}」は見つかりましたが、対応するスプレッドシートIDが設定されていません`,
          };
        }

        // CustomerInfo形式でレスポンスを返す
        const customerInfo = {
          customerCode: searchCustomerCode,
          serverName: rowServerName.trim(),
          spreadsheetId: rowSpreadsheetId.trim(),
        };

        return {
          success: true,
          data: customerInfo,
          message: `顧客コード「${searchCustomerCode}」の情報を取得しました`,
        };
      }
    }

    // 顧客コードが見つからない場合
    console.log(
      "一致する顧客コードが見つかりませんでした:",
      searchCustomerCode
    );
    return {
      success: false,
      error: "顧客コードが見つかりません",
      message: `顧客コード「${searchCustomerCode}」は登録されていません`,
    };
  } catch (error) {
    console.error("エラー:", error.toString());
    return {
      success: false,
      error: error.toString(),
      message: "顧客情報の取得に失敗しました",
    };
  }
}

/**
 * サーバー名からスプレッドシートIDを取得する
 * @param {string} serverName - 検索するサーバー名
 * @return {Object} スプレッドシートIDまたはエラー情報
 */
function getSpreadsheetIdByServerName(serverName) {
  try {
    // 入力値チェック
    if (
      !serverName ||
      typeof serverName !== "string" ||
      serverName.trim() === ""
    ) {
      return {
        success: false,
        error: "サーバー名が指定されていません",
        message: "サーバー名を正しく指定してください",
      };
    }

    const searchServerName = serverName.trim();

    // フルURLからスプレッドシートIDを抽出
    const fullUrl =
      "https://docs.google.com/spreadsheets/d/1If92tWrQIsOy6y-W6838w7mdJJHGxL0_P6GgwIVo3A8/edit?gid=0#gid=0";
    const spreadsheetId = extractSpreadsheetId(fullUrl);

    console.log("スプレッドシートID:", spreadsheetId);
    console.log("検索するサーバー名:", searchServerName);

    // スプレッドシートを開く
    const spreadsheet = SpreadsheetApp.openById(spreadsheetId);
    console.log("スプレッドシート名:", spreadsheet.getName());

    // シート1を取得
    const sheet = spreadsheet.getSheetByName("シート1");
    if (!sheet) {
      throw new Error("シート1が見つかりません");
    }

    console.log("シート名:", sheet.getName());

    // データ範囲を取得（ヘッダー行を除く2行目から最終行まで）
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) {
      return {
        success: false,
        error: "データが見つかりません",
        message: "スプレッドシートにデータが存在しません（ヘッダー行のみ）",
      };
    }

    // D列（サーバー名）とE列（スプレッドシートID）のデータを取得
    const dataRange = sheet.getRange(2, 4, lastRow - 1, 2); // D列とE列
    const dataValues = dataRange.getValues();

    console.log("取得したデータ行数:", dataValues.length);

    // サーバー名で検索
    for (let i = 0; i < dataValues.length; i++) {
      const rowServerName = dataValues[i][0]; // D列の値
      const rowSpreadsheetId = dataValues[i][1]; // E列の値

      // サーバー名が一致するかチェック（大文字小文字を区別しない）
      if (
        rowServerName &&
        typeof rowServerName === "string" &&
        rowServerName.trim().toLowerCase() === searchServerName.toLowerCase()
      ) {
        console.log("一致するサーバー名が見つかりました:", rowServerName);
        console.log("対応するスプレッドシートID:", rowSpreadsheetId);

        // スプレッドシートIDが存在するかチェック
        if (
          !rowSpreadsheetId ||
          typeof rowSpreadsheetId !== "string" ||
          rowSpreadsheetId.trim() === ""
        ) {
          return {
            success: false,
            error: "スプレッドシートIDが設定されていません",
            message: `サーバー名「${searchServerName}」は見つかりましたが、対応するスプレッドシートIDが設定されていません`,
            serverName: searchServerName,
            rowNumber: i + 2, // 実際の行番号（ヘッダー行を考慮）
          };
        }

        return {
          success: true,
          serverName: searchServerName,
          spreadsheetId: rowSpreadsheetId.trim(),
          rowNumber: i + 2, // 実際の行番号（ヘッダー行を考慮）
          message: `サーバー名「${searchServerName}」のスプレッドシートIDを取得しました`,
        };
      }
    }

    // サーバー名が見つからない場合
    console.log("一致するサーバー名が見つかりませんでした:", searchServerName);
    return {
      success: false,
      error: "サーバー名が見つかりません",
      message: `サーバー名「${searchServerName}」は登録されていません`,
      serverName: searchServerName,
    };
  } catch (error) {
    console.error("エラー:", error.toString());
    return {
      success: false,
      error: error.toString(),
      message: "サーバー名からスプレッドシートID取得に失敗しました",
      serverName: serverName,
    };
  }
}

/**
 * 顧客検索のハンドラー関数（Code.gsから呼び出される）
 * @param {Object} payload - リクエストペイロード
 * @param {boolean} debug - デバッグモード
 * @param {Object} diagInfo - 診断情報
 * @return {Object} レスポンス
 */
function handleFindCustomerByCode(payload, debug, diagInfo) {
  try {
    // payloadの検証
    if (!payload) {
      return Utils.createResponse({
        ok: false,
        err: "ペイロードが指定されていません",
        debug: debug ? diagInfo : undefined,
      });
    }

    // customerCodeの検証
    if (!payload.customerCode) {
      return Utils.createResponse({
        ok: false,
        err: "顧客コードが指定されていません",
        debug: debug ? diagInfo : undefined,
      });
    }

    console.log("受信したpayload:", JSON.stringify(payload));
    console.log("customerCode:", payload.customerCode);

    const result = findCustomerByCode(payload.customerCode);
    return Utils.createResponse({
      ok: result.success,
      data: result.success ? result.data : undefined,
      err: result.success ? undefined : result.error,
      debug: debug ? diagInfo : undefined,
    });
  } catch (e) {
    return Utils.createResponse({
      ok: false,
      err: "顧客検索エラー: " + String(e),
      debug: debug ? diagInfo : undefined,
    });
  }
}

/**
 * Google SpreadsheetsのフルURLからスプレッドシートIDを抽出
 * @param {string} url - Google SpreadsheetsのフルURL
 * @return {string} スプレッドシートID
 */
function extractSpreadsheetId(url) {
  const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (!match) {
    throw new Error("無効なGoogle SpreadsheetsのURLです");
  }
  return match[1];
}

/**
 * Web APIエンドポイント用のdoGet関数
 * @param {Object} e - リクエストパラメータ
 * @return {Object} レスポンス
 */
function doGet(e) {
  const action = e.parameter.action;

  if (action === "testAccess") {
    const result = testSimpleSpreadsheetAccess();
    return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(
      ContentService.MimeType.JSON
    );
  }

  if (action === "getServerNames") {
    const result = getServerNames();
    return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(
      ContentService.MimeType.JSON
    );
  }

  if (action === "getSpreadsheetIdByServerName") {
    const serverName = e.parameter.serverName;
    const result = getSpreadsheetIdByServerName(serverName);
    return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(
      ContentService.MimeType.JSON
    );
  }

  if (action === "findCustomerByCode") {
    // POSTリクエストの場合、payloadオブジェクトがparameterに含まれている
    let payload = e.parameter.payload || e.parameter;

    // payloadが文字列の場合はJSONとして解析
    if (typeof payload === "string") {
      try {
        payload = JSON.parse(payload);
        console.log(
          "findCustomerByCode - payload parsed from string:",
          JSON.stringify(payload)
        );
      } catch (parseError) {
        console.error("findCustomerByCode - payload parse error:", parseError);
        console.log("findCustomerByCode - original payload string:", payload);
      }
    }

    const customerCode = payload.customerCode || e.parameter.customerCode;

    console.log("findCustomerByCode - parameter:", JSON.stringify(e.parameter));
    console.log("findCustomerByCode - payload:", JSON.stringify(payload));
    console.log("findCustomerByCode - customerCode:", customerCode);

    const result = findCustomerByCode(customerCode);
    return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(
      ContentService.MimeType.JSON
    );
  }

  return ContentService.createTextOutput(
    JSON.stringify({
      success: false,
      message:
        "無効なアクションです。利用可能なアクション: testAccess, getServerNames, getSpreadsheetIdByServerName, findCustomerByCode",
    })
  ).setMimeType(ContentService.MimeType.JSON);
}

/**
 * Web APIエンドポイント用のdoPost関数
 * @param {Object} e - リクエストパラメータ
 * @return {Object} レスポンス
 */
function doOptions(e) {
  return ContentService.createTextOutput()
    .setMimeType(ContentService.MimeType.JSON)
    .withHeaders({
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
    });
}

function doGet(e) {
  let response;
  try {
    console.log("[DEBUG] GAS doGet: Received event object (e):", JSON.stringify(e, null, 2));
    if (!e || !e.parameter) {
      console.error("[ERROR] GAS doGet: Event object or parameter is missing.");
      throw new Error("Invalid GET data: Event object or parameter is missing.");
    }

    const action = e.parameter.action;
    console.log("[DEBUG] GAS doGet: Action:", action);

    if (action === 'findCustomerByCode') {
      const customerCode = e.parameter.customerCode;
      if (!customerCode) {
        throw new Error("'customerCode' is required for 'findCustomerByCode' action via GET.");
      }
      console.log("[DEBUG] GAS doGet: customerCode:", customerCode);
      response = findCustomerByCode(customerCode);
    } else if (action === 'getServerNames') {
      response = getServerNames();
    } else if (action === 'getConfig') { // test-api.ps1 からの action に対応
      response = {
        success: true,
        message: "getConfig action processed successfully via GET (test data)",
        data: { version: "1.0.0", environment: "development" }
      };
    } else {
      throw new Error(`Unknown action via GET: ${action}`);
    }
  } catch (error) {
    console.error("doGet Error:", error.toString(), JSON.stringify(e, null, 2));
    response = {
      success: false,
      error: error.toString(),
      message: "Error processing GET request in doGet."
    };
  }
  return ContentService.createTextOutput(JSON.stringify(response))
                     .setMimeType(ContentService.MimeType.JSON)
                     .withHeaders({
                       'Access-Control-Allow-Origin': '*', // doGetでもCORSヘッダーを返す
                       'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
                       'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With'
                     });
}

function doPost(e) {
  try {
    // デバッグ情報をログに出力
    console.log("doPost called with:", {
      postData: e.postData,
      contentType: e.postData ? e.postData.type : "none",
      contents: e.postData ? e.postData.contents : "none",
      contentsLength:
        e.postData && e.postData.contents ? e.postData.contents.length : 0,
    });

    // POSTリクエストのJSONボディを解析
    let parsedRequest = {};
    if (e.postData && e.postData.contents) {
      try {
        const rawContents = e.postData.contents;
        console.log("Raw contents:", rawContents);
        parsedRequest = JSON.parse(rawContents);
        console.log("Parsed request:", parsedRequest);
      } catch (parseErr) {
        console.error("JSON parse error:", parseErr);
        console.error(
          "Raw contents that failed to parse:",
          e.postData.contents
        );
        return ContentService.createTextOutput(
          JSON.stringify({
            success: false,
            message:
              "リクエスト解析エラー: " +
              String(parseErr) +
              " | Raw: " +
              (e.postData.contents || "null"),
          })
        ).setMimeType(ContentService.MimeType.JSON);
      }
    } else {
      console.log("No postData or contents found");
      return ContentService.createTextOutput(
        JSON.stringify({
          success: false,
          message: "POSTデータが見つかりません",
        })
      ).setMimeType(ContentService.MimeType.JSON);
    }

    // パラメータをGETリクエスト形式に変換
    const mockGetEvent = {
      parameter: parsedRequest,
    };

    console.log(
      "Calling doGet with mockGetEvent:",
      JSON.stringify(mockGetEvent)
    );
    console.log(
      "mockGetEvent.parameter.action:",
      mockGetEvent.parameter.action
    );
    console.log(
      "mockGetEvent.parameter.payload:",
      JSON.stringify(mockGetEvent.parameter.payload)
    );
    console.log(
      "mockGetEvent.parameter.payload type:",
      typeof mockGetEvent.parameter.payload
    );

    return doGet(mockGetEvent);
  } catch (error) {
    console.error("doPost error:", error);
    return ContentService.createTextOutput(
      JSON.stringify({
        success: false,
        message: "doPost エラー: " + String(error),
      })
    ).setMimeType(ContentService.MimeType.JSON);
  }
}
