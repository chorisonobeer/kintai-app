/**
 * 子プロジェクト用メインエントリーポイント
 * 2025-06-08T15:00+09:00
 * 変更概要: 新規作成 - 子プロジェクト用のリクエスト処理（設定されたスプレッドシートIDを使用した認証）
 */

const CHILD_VERSION = "v1-child-auth";
const CHILD_VERSION_HISTORY = [
  {
    version: "v1-child-auth",
    date: "2025-06-08",
    description: "子プロジェクト用認証機能",
  },
];

// GETリクエスト処理（ヘルスチェック）
function doGet() {
  return Utils.createResponse({
    ok: true,
    msg: "Child GAS up",
    version: CHILD_VERSION,
  });
}

// OPTIONSリクエスト処理（CORS プリフライト）
function doOptions() {
  return Utils.createResponse({
    ok: true,
    msg: "CORS preflight OK",
    version: CHILD_VERSION,
  });
}

// POSTリクエスト処理（メインエントリーポイント）
function doPost(e) {
  try {
    // 基本情報
    const diagInfo = {
      version: CHILD_VERSION,
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

    // アクション振り分け（顧客検索テスト用に他をコメントアウト）
    switch (parsedRequest.action) {
      // case "login":
      //   return Auth_Child.handleLogin(
      //     parsedRequest.payload,
      //     parsedRequest.debug,
      //     diagInfo
      //   );
      // case "logout":
      //   return Auth_Child.handleLogout(
      //     parsedRequest.token,
      //     parsedRequest.debug,
      //     diagInfo
      //   );
      // case "saveKintai":
      //   // 子プロジェクトでは勤怠データ保存は現在のスプレッドシートに保存
      //   return handleChildSaveKintai(
      //     parsedRequest.token,
      //     parsedRequest.payload,
      //     parsedRequest.debug,
      //     diagInfo
      //   );
      // case "getMonthlyData":
      //   // 子プロジェクトでは月次データは現在のスプレッドシートから取得
      //   return handleChildGetMonthlyData(
      //     parsedRequest.token,
      //     parsedRequest.payload,
      //     parsedRequest.debug,
      //     diagInfo
      //   );
      // case "getVersion":
      //   return Utils.createResponse({
      //     ok: true,
      //     version: CHILD_VERSION,
      //     versionHistory: CHILD_VERSION_HISTORY,
      //     debug: parsedRequest.debug ? diagInfo : undefined,
      //   });
      default:
        diagInfo.unknownAction = parsedRequest.action;
        return Utils.createResponse({
          ok: false,
          err:
            "不明なアクション (テスト中: 子プロジェクトでは顧客検索は無効): " +
            parsedRequest.action,
          debug: parsedRequest.debug ? diagInfo : undefined,
        });
    }
  } catch (mainErr) {
    return Utils.createResponse({
      ok: false,
      err: "メインエラー: " + String(mainErr),
      debug: parsedRequest?.debug ? { mainError: String(mainErr) } : undefined,
    });
  }
}

/**
 * 子プロジェクト用勤怠データ保存処理
 */
function handleChildSaveKintai(token, payload, debug, diagInfo) {
  diagInfo.stage = "child_save_kintai";

  try {
    // トークン検証
    const tokenCheck = Auth_Child.checkToken(token);
    if (!tokenCheck.valid) {
      return Utils.createResponse({
        ok: false,
        err: "認証エラー",
        debug: debug ? diagInfo : undefined,
      });
    }

    // 現在のスプレッドシートに勤怠データを保存
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const userId = tokenCheck.userId;

    // 年月からシート名を生成
    const date = new Date(payload.date);
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const sheetName = year + "年" + month + "月_" + userId;

    let sheet = ss.getSheetByName(sheetName);
    if (!sheet) {
      // シートが存在しない場合は作成
      sheet = ss.insertSheet(sheetName);
      // ヘッダー行を追加
      sheet
        .getRange(1, 1, 1, 8)
        .setValues([
          [
            "日付",
            "出勤時刻",
            "退勤時刻",
            "休憩時間",
            "勤務時間",
            "勤務場所",
            "備考",
            "更新日時",
          ],
        ]);
    }

    // データを保存
    const rowData = [
      payload.date,
      payload.startTime || "",
      payload.endTime || "",
      payload.breakTime || "",
      payload.workTime || "",
      payload.location || "",
      payload.note || "",
      new Date().toISOString(),
    ];

    // 既存データの確認と更新
    const dataRange = sheet.getRange(2, 1, sheet.getLastRow() - 1, 8);
    const existingData = dataRange.getValues();
    let updated = false;

    for (let i = 0; i < existingData.length; i++) {
      if (existingData[i][0] === payload.date) {
        // 既存データを更新
        sheet.getRange(i + 2, 1, 1, 8).setValues([rowData]);
        updated = true;
        break;
      }
    }

    if (!updated) {
      // 新規データを追加
      sheet.appendRow(rowData);
    }

    return Utils.createResponse({
      ok: true,
      msg: "勤怠データを保存しました",
      debug: debug ? diagInfo : undefined,
    });
  } catch (error) {
    diagInfo.saveError = String(error);
    return Utils.createResponse({
      ok: false,
      err: "勤怠データ保存エラー: " + error.toString(),
      debug: debug ? diagInfo : undefined,
    });
  }
}

/**
 * 子プロジェクト用月次データ取得処理
 */
function handleChildGetMonthlyData(token, payload, debug, diagInfo) {
  diagInfo.stage = "child_get_monthly_data";

  try {
    // トークン検証
    const tokenCheck = Auth_Child.checkToken(token);
    if (!tokenCheck.valid) {
      return Utils.createResponse({
        ok: false,
        err: "認証エラー",
        debug: debug ? diagInfo : undefined,
      });
    }

    // 現在のスプレッドシートから月次データを取得
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const userId = tokenCheck.userId;
    const year = payload.year;
    const month = payload.month;
    const sheetName = year + "年" + month + "月_" + userId;

    const sheet = ss.getSheetByName(sheetName);
    if (!sheet) {
      return Utils.createResponse({
        ok: true,
        data: [],
        msg: "指定された月のデータが見つかりません",
        debug: debug ? diagInfo : undefined,
      });
    }

    // データを取得
    const lastRow = sheet.getLastRow();
    if (lastRow <= 1) {
      return Utils.createResponse({
        ok: true,
        data: [],
        msg: "データがありません",
        debug: debug ? diagInfo : undefined,
      });
    }

    const dataRange = sheet.getRange(2, 1, lastRow - 1, 8);
    const rawData = dataRange.getValues();

    // データを整形
    const formattedData = rawData.map((row) => ({
      date: row[0],
      startTime: row[1],
      endTime: row[2],
      breakTime: row[3],
      workTime: row[4],
      location: row[5],
      note: row[6],
      updatedAt: row[7],
    }));

    return Utils.createResponse({
      ok: true,
      data: formattedData,
      debug: debug ? diagInfo : undefined,
    });
  } catch (error) {
    diagInfo.getDataError = String(error);
    return Utils.createResponse({
      ok: false,
      err: "月次データ取得エラー: " + error.toString(),
      debug: debug ? diagInfo : undefined,
    });
  }
}
