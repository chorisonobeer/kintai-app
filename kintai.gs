/**
 * kintai.gs
 * 勤怠管理関連の機能を提供するモジュール
 */

// Kintaiオブジェクトの定義
const Kintai = {};

/**
 * 月間勤怠データ取得
 */
Kintai.handleGetMonthlyData = function(payload, token, debug, diagInfo) {
  diagInfo.stage = 'getMonthlyData';
  Logger.log("月間勤怠データ取得開始: " + JSON.stringify(payload));
  
  try {
    // トークン検証
    if (!token) {
      diagInfo.noToken = true;
      return Utils.createResponse({
        ok: false,
        err: 'トークン未指定',
        debug: debug ? diagInfo : undefined
      });
    }
    
    // トークンの検証
    diagInfo.stage = 'token_verification';
    let tokenInfo;
    try {
      tokenInfo = Auth.checkToken(token);
      diagInfo.tokenValid = tokenInfo.valid;
      
      if (!tokenInfo.valid) {
        return Utils.createResponse({
          ok: false,
          err: 'トークンが無効です',
          debug: debug ? diagInfo : undefined
        });
      }
      
      Logger.log("トークン検証成功: " + JSON.stringify(tokenInfo));
    } catch (tokenErr) {
      diagInfo.tokenError = String(tokenErr);
      Logger.log("トークン検証エラー: " + tokenErr);
      return Utils.createResponse({
        ok: false,
        err: 'トークン検証エラー',
        debug: debug ? diagInfo : undefined
      });
    }
    
    // 必須パラメータチェック
    diagInfo.stage = 'parameter_check';
    const { spreadsheetId, year, month } = payload;
    
    if (!spreadsheetId) {
      diagInfo.missingParam = 'spreadsheetId';
      Logger.log("スプレッドシートID未指定");
      return Utils.createResponse({
        ok: false,
        err: 'スプレッドシートIDが未指定です',
        debug: debug ? diagInfo : undefined
      });
    }
    
    if (!year || !month) {
      diagInfo.missingParam = 'year/month';
      Logger.log("年月未指定");
      return Utils.createResponse({
        ok: false,
        err: '年月が未指定です',
        debug: debug ? diagInfo : undefined
      });
    }
    
    diagInfo.providedSpreadsheetId = spreadsheetId;
    diagInfo.providedYear = year;
    diagInfo.providedMonth = month;
    
    Logger.log(`対象年月: ${year}年${month}月`);
    
    // スプレッドシートアクセス
    diagInfo.stage = 'kintai_sheet_access';
    let ss, sheet;
    try {
      ss = SpreadsheetApp.openById(spreadsheetId);
      sheet = ss.getSheetByName('データ');
      
      if (!sheet) {
        diagInfo.sheetError = 'データシートが見つかりません';
        Logger.log("データシート見つからず");
        return Utils.createResponse({
          ok: false,
          err: 'データシートが見つかりません',
          debug: debug ? diagInfo : undefined
        });
      }
      
      diagInfo.sheetFound = true;
      Logger.log("データシート見つかりました");
    } catch (sheetErr) {
      diagInfo.sheetError = String(sheetErr);
      Logger.log("スプレッドシートアクセスエラー: " + sheetErr);
      return Utils.createResponse({
        ok: false,
        err: 'スプレッドシートアクセスエラー',
        debug: debug ? diagInfo : undefined
      });
    }
    
    // データ取得
    diagInfo.stage = 'monthly_data_fetch';
    let rows;
    try {
      // 1行目がヘッダーなので2行目から取得
      const dataRange = sheet.getDataRange();
      diagInfo.sheetLastRow = dataRange.getNumRows();
      diagInfo.sheetLastColumn = dataRange.getNumColumns();
      
      Logger.log("シート行数: " + dataRange.getNumRows());
      
      if (dataRange.getNumRows() <= 1) {
        // ヘッダーしかない場合
        rows = [];
      } else {
        rows = sheet.getRange(2, 1, dataRange.getNumRows() - 1, sheet.getLastColumn()).getValues();
      }
      diagInfo.rowCount = rows.length;
      Logger.log("データ行数: " + rows.length);
    } catch (dataErr) {
      diagInfo.dataError = String(dataErr);
      Logger.log("データ取得エラー: " + dataErr);
      return Utils.createResponse({
        ok: false,
        err: 'データ取得エラー',
        debug: debug ? diagInfo : undefined
      });
    }
    
    // ここに続きのコードが必要です
    // ...
    
  } catch (e) {
    diagInfo.error = String(e);
    Logger.log("月間データ取得エラー: " + e);
    return Utils.createResponse({
      ok: false,
      err: '月間データ取得処理エラー',
      debug: debug ? diagInfo : undefined
    });
  }
};