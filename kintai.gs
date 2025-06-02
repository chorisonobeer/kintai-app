/**
 * kintai.gs
 * 2025-05-04T12:00+09:00
 * 変更概要: 更新 - 勤怠管理関連の機能を提供するモジュール（日付型対応、勤務場所対応、行位置特定アルゴリズム追加）
 * JSDoc型定義追加 - 詳細な型情報とドキュメントを追加
 */

/**
 * @typedef {Object} KintaiPayload
 * @property {string} date - 勤怠日付（YYYY-MM-DD、YYYY/MM/DD、または日本語形式）
 * @property {string} startTime - 出勤時間（HH:mm形式）
 * @property {string|number} breakTime - 休憩時間（HH:mm形式または分数）
 * @property {string} endTime - 退勤時間（HH:mm形式）
 * @property {string} spreadsheetId - Google SpreadsheetのID
 * @property {string} userId - ユーザーID
 * @property {string} [location] - 勤務場所（オプション）
 */

/**
 * @typedef {Object} MonthlyDataPayload
 * @property {string} spreadsheetId - Google SpreadsheetのID
 * @property {string} userId - ユーザーID
 * @property {number} year - 取得対象年
 * @property {number} month - 取得対象月
 */

/**
 * @typedef {Object} DiagnosticInfo
 * @property {string} stage - 処理段階
 * @property {boolean} [noToken] - トークン未指定フラグ
 * @property {boolean} [tokenValid] - トークン有効性
 * @property {string} [tokenError] - トークンエラー詳細
 * @property {boolean} [missingParams] - 必須パラメータ不足フラグ
 * @property {string} [missingParam] - 不足パラメータ名
 * @property {string} [sheetError] - シートエラー詳細
 * @property {string} [workingTime] - 計算された勤務時間
 * @property {string} [normalizedDate] - 正規化された日付
 * @property {number} [rowIndex] - 更新行番号
 * @property {string} [monthValue] - 月の値
 * @property {boolean} [updated] - 更新完了フラグ
 * @property {number} [rowUpdated] - 更新された行番号
 * @property {string} [saveError] - 保存エラー詳細
 * @property {string} [calcError] - 計算エラー詳細
 * @property {string} [rowError] - 行特定エラー詳細
 * @property {string} [error] - 一般エラー詳細
 */

/**
 * @typedef {Object} TokenInfo
 * @property {boolean} valid - トークンの有効性
 * @property {string} [userId] - ユーザーID
 * @property {number} [exp] - 有効期限（Unix timestamp）
 */

/**
 * @typedef {Object} ApiResponse
 * @property {boolean} ok - 処理成功フラグ
 * @property {string} [err] - エラーメッセージ
 * @property {*} [data] - レスポンスデータ
 * @property {DiagnosticInfo} [debug] - デバッグ情報
 */

/**
 * @typedef {Object} KintaiRecord
 * @property {string} date - 日付
 * @property {number} month - 月
 * @property {string} startTime - 出勤時間
 * @property {string} breakTime - 休憩時間
 * @property {string} endTime - 退勤時間
 * @property {string} workingTime - 勤務時間
 * @property {string} location - 勤務場所
 */

// Kintaiオブジェクトの定義
const Kintai = {};

/**
 * 勤怠データの保存
 * @param {KintaiPayload} payload - 勤怠データのペイロード
 * @param {string} token - 認証トークン
 * @param {boolean} debug - デバッグモードフラグ
 * @param {DiagnosticInfo} [diagInfo={}] - 診断情報オブジェクト
 * @returns {ApiResponse} API応答オブジェクト
 * @description 勤怠データをGoogle Spreadsheetに保存する。トークン検証、パラメータチェック、
 *              勤務時間計算、データ正規化、行位置特定を行い、スプレッドシートに書き込む。
 */
Kintai.handleSaveKintai = function(payload, token, debug, diagInfo = {}) {
  diagInfo.stage = 'saveKintai';
  
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
    
    diagInfo.stage = 'token_verification';
    /** @type {TokenInfo} */
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
    } catch (tokenErr) {
      diagInfo.tokenError = String(tokenErr);
      return Utils.createResponse({
        ok: false,
        err: 'トークン検証エラー',
        debug: debug ? diagInfo : undefined
      });
    }
    
    // 必須パラメータチェック
    diagInfo.stage = 'parameter_check';
    /** @type {string} */
    const { date, startTime, breakTime, endTime, spreadsheetId, userId, location } = payload;
    
    if (!date || !startTime || !endTime || !spreadsheetId || !userId) {
      diagInfo.missingParams = true;
      return Utils.createResponse({
        ok: false,
        err: '必須パラメータが不足しています',
        debug: debug ? diagInfo : undefined
      });
    }
    
    // スプレッドシートアクセス
    diagInfo.stage = 'spreadsheet_access';
    /** @type {GoogleAppsScript.Spreadsheet.Spreadsheet} */
    let ss;
    /** @type {GoogleAppsScript.Spreadsheet.Sheet} */
    let sheet;
    try {
      ss = SpreadsheetApp.openById(spreadsheetId);
      sheet = ss.getSheetByName('データ');
      
      if (!sheet) {
        diagInfo.sheetError = 'データシートが見つかりません';
        return Utils.createResponse({
          ok: false,
          err: 'データシートが見つかりません',
          debug: debug ? diagInfo : undefined
        });
      }
    } catch (sheetErr) {
      diagInfo.sheetError = String(sheetErr);
      return Utils.createResponse({
        ok: false,
        err: 'スプレッドシートアクセスエラー',
        debug: debug ? diagInfo : undefined
      });
    }
    
    // 勤務時間の計算（診断情報用のみ、スプレッドシートには書き込まない）
    diagInfo.stage = 'calc_working_time';
    /** @type {string|number} */
    let workingTime = 0;
    try {
      // 勤務時間計算（時:分形式の時間から計算）
      /** @type {string[]} */
      const startParts = startTime.split(':');
      /** @type {string[]} */
      const endParts = endTime.split(':');
      
      /** @type {number} */
      const startMinutes = parseInt(startParts[0], 10) * 60 + parseInt(startParts[1], 10);
      /** @type {number} */
      const endMinutes = parseInt(endParts[0], 10) * 60 + parseInt(endParts[1], 10);
      
      // 休憩時間を分で計算（HH:mm形式かminutes形式かを判断）
      /** @type {number} */
      let breakMinutes = 0;
      if (typeof breakTime === 'string' && breakTime.includes(':')) {
        // "1:30" のような時:分形式
        /** @type {string[]} */
        const breakParts = breakTime.split(':');
        breakMinutes = parseInt(breakParts[0], 10) * 60 + parseInt(breakParts[1], 10);
      } else if (typeof breakTime === 'number') {
        // 数値ならそのまま分
        breakMinutes = breakTime;
      } else if (typeof breakTime === 'string' && breakTime.match(/^\d+$/)) {
        // "90" のような数字文字列も分として扱う
        breakMinutes = parseInt(breakTime, 10);
      } else {
        breakMinutes = 0;
      }
      
      // 総勤務時間（分）= 終了時間 - 開始時間 - 休憩時間
      /** @type {number} */
      const totalMinutes = endMinutes - startMinutes - breakMinutes;
      
      // 勤務時間を時:分形式で計算（診断情報用のみ）
      if (totalMinutes > 0) {
        /** @type {number} */
        const workHours = Math.floor(totalMinutes / 60);
        /** @type {number} */
        const workMins = totalMinutes % 60;
        workingTime = `${workHours}:${workMins.toString().padStart(2, '0')}`;
      } else {
        workingTime = '0:00';
      }
      diagInfo.workingTime = workingTime;
    } catch (calcErr) {
      diagInfo.calcError = String(calcErr);
      workingTime = 0;
    }
    
    // データを保存
    diagInfo.stage = 'save_data';
    try {
      // 日付を正規化してYYYY/MM/DD形式に変換
      /** @type {string} */
      const normalizedDate = normalizeDate(date);
      diagInfo.normalizedDate = normalizedDate;
      
      // 行番号を検索または計算
      /** @type {number} */
      const rowIndex = findOrCalculateRowByDate(sheet, normalizedDate);
      diagInfo.rowIndex = rowIndex;
      
      if (rowIndex <= 0) {
        diagInfo.rowError = '行の特定に失敗しました';
        return Utils.createResponse({
          ok: false,
          err: '行の特定に失敗しました',
          debug: debug ? diagInfo : undefined
        });
      }
      
      // 日付から月を抽出（B列用）
      /** @type {number|string} */
      const monthValue = extractMonthValue(normalizedDate);
      diagInfo.monthValue = monthValue;
      
      // データを準備（スプレッドシートの列に合わせる）
      // C列: 出勤時間、D列: 休憩時間、E列: 退勤時間、G列: 勤務場所のみ書き込み
      // A列（日付）、B列（月）、F列（勤務時間）は書き込み禁止
      
      // スプレッドシートに勤怠データを保存
      // C、D、E列のみ書き込み
      sheet.getRange(rowIndex, 3, 1, 1).setValue(startTime); // C列: 出勤時間
      sheet.getRange(rowIndex, 4, 1, 1).setValue(formatBreakTime(breakTime)); // D列: 休憩時間
      sheet.getRange(rowIndex, 5, 1, 1).setValue(endTime); // E列: 退勤時間
      
      // G列（勤務場所）を別途書き込み
      if (location) {
        sheet.getRange(rowIndex, 7, 1, 1).setValue(location);
      }
      diagInfo.updated = true;
      diagInfo.rowUpdated = rowIndex;
      
      return Utils.createResponse({
        ok: true,
        debug: debug ? diagInfo : undefined
      });
    } catch (saveErr) {
      diagInfo.saveError = String(saveErr);
      return Utils.createResponse({
        ok: false,
        err: 'データ保存エラー',
        debug: debug ? diagInfo : undefined
      });
    }
  } catch (e) {
    diagInfo.error = String(e);
    return Utils.createResponse({
      ok: false,
      err: '勤怠データ保存処理エラー',
      debug: debug ? diagInfo : undefined
    });
  }
};

/**
 * 日付を正規化してYYYY/MM/DD形式に変換
 * @param {string|Date} dateStr - 正規化対象の日付（文字列またはDateオブジェクト）
 * @returns {string} YYYY/MM/DD形式の日付文字列
 * @description 様々な形式の日付（YYYY-MM-DD、日本語形式、Dateオブジェクト等）を
 *              統一されたYYYY/MM/DD形式に変換する
 */
function normalizeDate(dateStr) {
  if (typeof dateStr !== 'string') {
    if (dateStr instanceof Date) {
      const y = dateStr.getFullYear();
      const m = (dateStr.getMonth() + 1).toString().padStart(2, '0');
      const d = dateStr.getDate().toString().padStart(2, '0');
      return `${y}/${m}/${d}`;
    }
    return String(dateStr);
  }
  
  // 日付文字列を YYYY/MM/DD 形式に正規化
  if (dateStr.includes('-')) {
    // YYYY-MM-DD形式
    const [year, month, day] = dateStr.split('-');
    return `${year}/${month}/${day}`;
  } else if (dateStr.includes('/')) {
    // すでにYYYY/MM/DD形式
    return dateStr;
  } else if (dateStr.match(/^\d{4}年\d{1,2}月\d{1,2}日/)) {
    // 日本語形式（2025年5月4日）
    const match = dateStr.match(/^(\d{4})年(\d{1,2})月(\d{1,2})日/);
    if (match) {
      const [_, jpYear, jpMonth, jpDay] = match;
      return `${jpYear}/${jpMonth.padStart(2, '0')}/${jpDay.padStart(2, '0')}`;
    }
  }
  
  // その他の形式はそのまま返す
  return dateStr;
}

/**
 * 日付から月の値を抽出（B列用）
 * @param {string|Date} dateStr - 月を抽出する日付
 * @returns {number|string} 月の数値（1-12）またはデフォルト値
 * @description 日付文字列またはDateオブジェクトから月の値を数値として抽出する
 */
function extractMonthValue(dateStr) {
  if (dateStr.includes('/')) {
    const parts = dateStr.split('/');
    if (parts.length >= 2) {
      return parseInt(parts[1], 10); // 月を数値として返す
    }
  } else if (dateStr.includes('-')) {
    const parts = dateStr.split('-');
    if (parts.length >= 2) {
      return parseInt(parts[1], 10); // 月を数値として返す
    }
  }
  
  // 直接日付オブジェクトの場合
  if (dateStr instanceof Date) {
    return dateStr.getMonth() + 1;
  }
  
  // デフォルト値
  return '';
}

/**
 * 休憩時間を0:30形式にフォーマット
 * @param {string|number} breakTime - 休憩時間（HH:mm形式または分数）
 * @returns {string} HH:mm形式の休憩時間文字列
 * @description 分数または既存のHH:mm形式の休憩時間を統一されたHH:mm形式に変換する
 */
function formatBreakTime(breakTime) {
  if (typeof breakTime === 'string' && breakTime.includes(':')) {
    return breakTime; // すでに時:分形式
  }
  
  // 分数を時:分形式に変換
  const minutes = parseInt(breakTime, 10);
  if (isNaN(minutes)) return '0:00';
  
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours}:${mins.toString().padStart(2, '0')}`;
}

/**
 * 行番号を検索または計算で特定する
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet - 対象のスプレッドシート
 * @param {string} dateStr - 検索対象の日付（YYYY/MM/DD形式）
 * @returns {number} 行番号（1から始まる）
 * @description 指定された日付に対応する行番号を検索で見つけるか、
 *              見つからない場合は年初からの経過日数で計算して特定する
 */
function findOrCalculateRowByDate(sheet, dateStr) {
  // 1. 日付を解析
  const [yearStr, monthStr, dayStr] = dateStr.split('/');
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);
  const day = parseInt(dayStr, 10);
  
  // 2. まずシート内を検索してみる
  const row = searchRowByDate(sheet, dateStr);
  if (row > 0) {
    return row; // 見つかった場合はその行を返す
  }
  
  // 3. 見つからない場合は計算で行番号を算出
  // 3-1. シートの開始行（ヘッダー）
  const HEADER_ROWS = 1;
  
  // 3-2. 年初からの経過日数を計算
  const dayOfYear = getDayOfYear(year, month, day);
  
  // 3-3. 行番号算出 = ヘッダー行 + 経過日数
  return HEADER_ROWS + dayOfYear;
}

/**
 * 年初からの経過日数を計算（うるう年対応）
 * @param {number} year - 年
 * @param {number} month - 月（1-12）
 * @param {number} day - 日（1-31）
 * @returns {number} 年初からの経過日数
 * @description うるう年を考慮して、指定された日付の年初からの経過日数を計算する
 */
function getDayOfYear(year, month, day) {
  // 各月の日数（通常年）
  const daysInMonth = [0, 31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  
  // うるう年チェック
  const isLeapYear = (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0);
  if (isLeapYear) {
    daysInMonth[2] = 29; // うるう年は2月が29日
  }
  
  // 年初からの経過日数を計算
  let dayOfYear = day;
  for (let i = 1; i < month; i++) {
    dayOfYear += daysInMonth[i];
  }
  
  return dayOfYear;
}

/**
 * シート内で日付に一致する行を検索
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet - 検索対象のスプレッドシート
 * @param {string} targetDateStr - 検索する日付（YYYY/MM/DD形式）
 * @returns {number} 見つかった行番号（1から始まる）、見つからない場合は-1
 * @description スプレッドシートのA列で指定された日付に一致する行を検索する
 */
function searchRowByDate(sheet, targetDateStr) {
  /** @type {GoogleAppsScript.Spreadsheet.Range} */
  const dataRange = sheet.getDataRange();
  /** @type {any[][]} */
  const values = dataRange.getValues();
  
  for (let i = 1; i < values.length; i++) { // ヘッダー行をスキップ
    /** @type {any} */
    let rowDate = values[i][0]; // A列の日付
    /** @type {string} */
    let rowDateStr = '';
    
    // 日付の正規化
    if (rowDate instanceof Date) {
      const y = rowDate.getFullYear();
      const m = (rowDate.getMonth() + 1).toString().padStart(2, '0');
      const d = rowDate.getDate().toString().padStart(2, '0');
      rowDateStr = `${y}/${m}/${d}`;
    } else if (typeof rowDate === 'string') {
      rowDateStr = normalizeDate(rowDate);
    }
    
    if (rowDateStr === targetDateStr) {
      return i + 1; // 行番号は1から始まる
    }
  }
  
  // 見つからない場合
  return -1;
}

/**
 * 月間勤怠データ取得
 * @param {MonthlyDataPayload} payload - 月間データ取得のペイロード
 * @param {string} token - 認証トークン
 * @param {boolean} debug - デバッグモードフラグ
 * @param {DiagnosticInfo} [diagInfo={}] - 診断情報オブジェクト
 * @returns {ApiResponse} 月間勤怠データを含むAPI応答オブジェクト
 * @description 指定された年月の勤怠データをGoogle Spreadsheetから取得し、
 *              フィルタリングして返す。様々なデータ形式に対応。
 */
Kintai.handleGetMonthlyData = function(payload, token, debug, diagInfo = {}) {
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
    /** @type {TokenInfo} */
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
    /** @type {string} */
    const { spreadsheetId, userId, year, month } = payload;
    
    if (!spreadsheetId) {
      diagInfo.missingParam = 'spreadsheetId';
      Logger.log("スプレッドシートID未指定");
      return Utils.createResponse({
        ok: false,
        err: 'スプレッドシートIDが未指定です',
        debug: debug ? diagInfo : undefined
      });
    }
    
    if (!userId) {
      diagInfo.missingParam = 'userId';
      Logger.log("ユーザーID未指定");
      return Utils.createResponse({
        ok: false,
        err: 'ユーザーIDが未指定です',
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
    diagInfo.providedUserId = userId;
    diagInfo.providedYear = year;
    diagInfo.providedMonth = month;
    
    Logger.log(`対象年月: ${year}年${month}月`);
    
    // スプレッドシートアクセス
    diagInfo.stage = 'kintai_sheet_access';
    /** @type {GoogleAppsScript.Spreadsheet.Spreadsheet} */
    let ss;
    /** @type {GoogleAppsScript.Spreadsheet.Sheet} */
    let sheet;
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
    /** @type {any[][]} */
    let rows;
    try {
      // 1行目がヘッダーなので2行目から取得
      /** @type {GoogleAppsScript.Spreadsheet.Range} */
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
    
    // データ処理とレスポンス作成
    diagInfo.stage = 'data_processing';
    /** @type {KintaiRecord[]} */
    const monthlyData = [];
    
    try {
      // 対象年月
      /** @type {number} */
      const targetYear = parseInt(year, 10);
      /** @type {number} */
      const targetMonth = parseInt(month, 10);
      
      // 各行をチェックして対象月のデータをフィルタリング
      for (let i = 0; i < rows.length; i++) {
        // 日付、ユーザーID等を取得
        /** @type {any} */
        let dateValue = rows[i][0]; // A列: 日付
        /** @type {any} */
        let monthValue = rows[i][1]; // B列: 月
        /** @type {any} */
        let startTimeValue = rows[i][2]; // C列: 出勤時間
        /** @type {any} */
        let breakTimeValue = rows[i][3]; // D列: 休憩時間
        /** @type {any} */
        let endTimeValue = rows[i][4]; // E列: 退勤時間
        /** @type {any} */
        let workingTimeValue = rows[i][5]; // F列: 勤務時間
        /** @type {any} */
        let locationValue = rows[i][6]; // G列: 勤務場所
        
        // デバッグ: スプレッドシートから取得した全ての列の値を確認
        Logger.log(`[DEBUG] 行${i}: 日付=${dateValue}, 出勤=${startTimeValue}(${typeof startTimeValue}), 休憩=${breakTimeValue}(${typeof breakTimeValue}), 退勤=${endTimeValue}(${typeof endTimeValue}), 勤務=${workingTimeValue}(${typeof workingTimeValue}), 場所=${locationValue}(${typeof locationValue})`);
        
        // 空行やデータがない行はスキップ
        if (!dateValue) {
          continue;
        }
        
        // 対象月をチェック
        /** @type {boolean} */
        let matchesMonth = false;
        
        // B列の月の値があれば直接チェック
        if (monthValue && typeof monthValue === 'number') {
          matchesMonth = (monthValue === targetMonth);
        }
        // B列がなければ日付から月を抽出
        else {
          /** @type {number} */
          let extractedMonth = 0;
          
          // 日付の種類に応じた処理
          if (dateValue instanceof Date) {
            extractedMonth = dateValue.getMonth() + 1;
          } else if (typeof dateValue === 'string') {
            if (dateValue.includes('/')) {
              const parts = dateValue.split('/');
              if (parts.length > 1) {
                extractedMonth = parseInt(parts[1], 10);
              }
            } else if (dateValue.includes('-')) {
              const parts = dateValue.split('-');
              if (parts.length > 1) {
                extractedMonth = parseInt(parts[1], 10);
              }
            } else if (dateValue.match(/^\d{4}年\d{1,2}月\d{1,2}日/)) {
              const match = dateValue.match(/^(\d{4})年(\d{1,2})月(\d{1,2})日/);
              if (match) {
                extractedMonth = parseInt(match[2], 10);
              }
            }
          }
          
          matchesMonth = (extractedMonth === targetMonth);
        }
        
        // 対象月と一致しない場合はスキップ
        if (!matchesMonth) {
          continue;
        }
        
        // 対象年もチェック
        /** @type {boolean} */
        let matchesYear = false;
        if (dateValue instanceof Date) {
          matchesYear = (dateValue.getFullYear() === targetYear);
        } else if (typeof dateValue === 'string') {
          /** @type {number} */
          let extractedYear = 0;
          
          if (dateValue.includes('/')) {
            const parts = dateValue.split('/');
            if (parts.length > 0) {
              extractedYear = parseInt(parts[0], 10);
            }
          } else if (dateValue.includes('-')) {
            const parts = dateValue.split('-');
            if (parts.length > 0) {
              extractedYear = parseInt(parts[0], 10);
            }
          } else if (dateValue.match(/^\d{4}年\d{1,2}月\d{1,2}日/)) {
            const match = dateValue.match(/^(\d{4})年(\d{1,2})月(\d{1,2})日/);
            if (match) {
              extractedYear = parseInt(match[1], 10);
            }
          }
          
          matchesYear = (extractedYear === targetYear);
        }
        
        // 対象年と一致しない場合はスキップ
        if (!matchesYear) {
          continue;
        }
        
        // 日付を正規化
        /** @type {string} */
        let dateStr = '';
        if (dateValue instanceof Date) {
          const y = dateValue.getFullYear();
          const m = (dateValue.getMonth() + 1).toString().padStart(2, '0');
          const d = dateValue.getDate().toString().padStart(2, '0');
          dateStr = `${y}-${m}-${d}`;
        } else if (typeof dateValue === 'string') {
          if (dateValue.includes('/')) {
            const [year, month, day] = dateValue.split('/');
            dateStr = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
          } else if (dateValue.includes('-')) {
            dateStr = dateValue;
          } else if (dateValue.match(/^\d{4}年\d{1,2}月\d{1,2}日/)) {
            const match = dateValue.match(/^(\d{4})年(\d{1,2})月(\d{1,2})日/);
            if (match) {
              const [_, y, m, d] = match;
              dateStr = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
            } else {
              continue;
            }
          } else {
            continue;
          }
        } else {
          continue;
        }

        // startTime, endTime を "HH:mm" 形式の文字列に変換
        /** @type {string} */
        let formattedStartTime = '';
        if (startTimeValue instanceof Date) {
          formattedStartTime = Utilities.formatDate(startTimeValue, Session.getScriptTimeZone(), "HH:mm");
        } else if (typeof startTimeValue === 'string' && startTimeValue.match(/^\d{1,2}:\d{2}/)) {
          formattedStartTime = startTimeValue.split(':')[0].padStart(2,'0') + ':' + startTimeValue.split(':')[1].padStart(2,'0'); // "8:00" -> "08:00"
        } else if (typeof startTimeValue === 'number') { // シリアル値の場合 (例: 0.3333... -> 8:00)
           // Google Sheetsの時刻シリアル値は1日を1とする数値。0.5は12:00。
           // これをDateオブジェクトに変換してフォーマットする。
           // 基準日を1899/12/30 00:00:00 とすることが多い。
           const baseDate = new Date(1899, 11, 30, 0, 0, 0); // Month is 0-indexed
           const dateFromSerial = new Date(baseDate.getTime() + startTimeValue * 24 * 60 * 60 * 1000);
           formattedStartTime = Utilities.formatDate(dateFromSerial, Session.getScriptTimeZone(), "HH:mm");
        }


        /** @type {string} */
        let formattedEndTime = '';
        if (endTimeValue instanceof Date) {
          formattedEndTime = Utilities.formatDate(endTimeValue, Session.getScriptTimeZone(), "HH:mm");
        } else if (typeof endTimeValue === 'string' && endTimeValue.match(/^\d{1,2}:\d{2}/)) {
          formattedEndTime = endTimeValue.split(':')[0].padStart(2,'0') + ':' + endTimeValue.split(':')[1].padStart(2,'0');
        } else if (typeof endTimeValue === 'number') {
           const baseDate = new Date(1899, 11, 30, 0, 0, 0);
           const dateFromSerial = new Date(baseDate.getTime() + endTimeValue * 24 * 60 * 60 * 1000);
           formattedEndTime = Utilities.formatDate(dateFromSerial, Session.getScriptTimeZone(), "HH:mm");
        }

        // 休憩時間の処理
        let finalBreakTime;
        if (breakTimeValue instanceof Date) {
          const hours = breakTimeValue.getHours();
          const minutes = breakTimeValue.getMinutes();
          finalBreakTime = `${hours}:${minutes.toString().padStart(2, '0')}`;
        } else {
          finalBreakTime = breakTimeValue || '';
        }
        
        // 勤務時間の処理
        let finalWorkingTime;
        if (workingTimeValue instanceof Date) {
          const hours = workingTimeValue.getHours();
          const minutes = workingTimeValue.getMinutes();
          finalWorkingTime = `${hours}:${minutes.toString().padStart(2, '0')}`;
        } else {
          finalWorkingTime = workingTimeValue || '';
        }
        
        // デバッグ: スプレッドシートから取得した勤務時間の値を確認
        Logger.log(`[DEBUG] 行${i}: workingTimeValue = ${workingTimeValue}, type = ${typeof workingTimeValue}`);
        
        // スプレッドシートのデータをそのまま出力
        monthlyData.push({
          date: dateStr,
          startTime: formattedStartTime,
          endTime: formattedEndTime,
          breakTime: finalBreakTime, // スプレッドシートの値をそのまま
          workingTime: finalWorkingTime, // スプレッドシートの値をそのまま
          location: locationValue || ''
        });
      }
      
      diagInfo.dataCount = monthlyData.length;
      Logger.log(`${targetYear}年${targetMonth}月のデータ: ${monthlyData.length}件`);
      
      // 正常レスポンス
      return Utils.createResponse({
        ok: true,
        data: monthlyData,
        debug: debug ? diagInfo : undefined
      });
    } catch (dataErr) {
      diagInfo.dataProcessingError = String(dataErr);
      Logger.log(`データ処理エラー: ${dataErr}`);
      return Utils.createResponse({
        ok: false,
        err: 'データ処理エラー',
        debug: debug ? diagInfo : undefined
      });
    }
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

/**
 * 勤怠履歴の取得（レガシー）
 * @param {Object} payload - リクエストペイロード
 * @param {string} token - 認証トークン
 * @param {boolean} debug - デバッグモードフラグ
 * @param {DiagnosticInfo} [diagInfo={}] - 診断情報オブジェクト
 * @returns {ApiResponse} 勤怠履歴データを含むAPI応答オブジェクト
 * @description レガシー機能として勤怠履歴を取得する（現在は空配列を返す）
 */
Kintai.handleGetHistory = function(payload, token, debug, diagInfo = {}) {
  // トークン検証、データ取得など、既存のコードがあればここに実装
  // このサンプルは最小限のレスポンスを返す
  return Utils.createResponse({
    ok: true,
    data: [],
    debug: debug ? diagInfo : undefined
  });
};

/**
 * kintai.gs
 * 2025-05-04T12:00+09:00
 * 変更概要: 更新 - 勤怠管理関連の機能を提供するモジュール（日付型対応、勤務場所対応、行位置特定アルゴリズム追加）
 * JSDoc型定義追加 - 詳細な型情報とドキュメントを追加
 */

/**
 * @typedef {Object} KintaiPayload
 * @property {string} date - 勤怠日付（YYYY-MM-DD、YYYY/MM/DD、または日本語形式）
 * @property {string} startTime - 出勤時間（HH:mm形式）
 * @property {string|number} breakTime - 休憩時間（HH:mm形式または分数）
 * @property {string} endTime - 退勤時間（HH:mm形式）
 * @property {string} spreadsheetId - Google SpreadsheetのID
 * @property {string} userId - ユーザーID
 * @property {string} [location] - 勤務場所（オプション）
 */

/**
 * @typedef {Object} MonthlyDataPayload
 * @property {string} spreadsheetId - Google SpreadsheetのID
 * @property {string} userId - ユーザーID
 * @property {number} year - 取得対象年
 * @property {number} month - 取得対象月
 */

/**
 * @typedef {Object} DiagnosticInfo
 * @property {string} stage - 処理段階
 * @property {boolean} [noToken] - トークン未指定フラグ
 * @property {boolean} [tokenValid] - トークン有効性
 * @property {string} [tokenError] - トークンエラー詳細
 * @property {boolean} [missingParams] - 必須パラメータ不足フラグ
 * @property {string} [missingParam] - 不足パラメータ名
 * @property {string} [sheetError] - シートエラー詳細
 * @property {string} [workingTime] - 計算された勤務時間
 * @property {string} [normalizedDate] - 正規化された日付
 * @property {number} [rowIndex] - 更新行番号
 * @property {string} [monthValue] - 月の値
 * @property {boolean} [updated] - 更新完了フラグ
 * @property {number} [rowUpdated] - 更新された行番号
 * @property {string} [saveError] - 保存エラー詳細
 * @property {string} [calcError] - 計算エラー詳細
 * @property {string} [rowError] - 行特定エラー詳細
 * @property {string} [error] - 一般エラー詳細
 */

/**
 * @typedef {Object} TokenInfo
 * @property {boolean} valid - トークンの有効性
 * @property {string} [userId] - ユーザーID
 * @property {number} [exp] - 有効期限（Unix timestamp）
 */

/**
 * @typedef {Object} ApiResponse
 * @property {boolean} ok - 処理成功フラグ
 * @property {string} [err] - エラーメッセージ
 * @property {*} [data] - レスポンスデータ
 * @property {DiagnosticInfo} [debug] - デバッグ情報
 */

/**
 * @typedef {Object} KintaiRecord
 * @property {string} date - 日付
 * @property {number} month - 月
 * @property {string} startTime - 出勤時間
 * @property {string} breakTime - 休憩時間
 * @property {string} endTime - 退勤時間
 * @property {string} workingTime - 勤務時間
 * @property {string} location - 勤務場所
 */

/**
 * F列の計算式状況を確認する関数
 * @returns {Object} F列の計算式状況レポート
 * @description スプレッドシートのF列（勤務時間列）の計算式の状況を分析し、
 *              計算式の数、値の数、空セルの数などの統計情報を返す
 */
Kintai.checkFColumnFormulas = function() {
  try {
    /** @type {GoogleAppsScript.Spreadsheet.Sheet} */
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    /** @type {number} */
    const lastRow = sheet.getLastRow();
    
    if (lastRow <= 1) {
      return {
        status: 'no_data',
        message: 'データが存在しません'
      };
    }
    
    // F列の範囲を取得（2行目から最終行まで）
    /** @type {GoogleAppsScript.Spreadsheet.Range} */
    const fColumnRange = sheet.getRange(2, 6, lastRow - 1, 1);
    /** @type {string[][]} */
    const formulas = fColumnRange.getFormulas();
    /** @type {any[][]} */
    const values = fColumnRange.getValues();
    
    /** @type {number} */
    let formulaCount = 0;
    /** @type {number} */
    let valueCount = 0;
    /** @type {number} */
    let emptyCount = 0;
    /** @type {Array<{row: number, formula: string, value: any}>} */
    const sampleFormulas = [];
    /** @type {Array<{row: number, value: any}>} */
    const sampleValues = [];
    
    formulas.forEach((row, index) => {
      /** @type {string} */
      const formula = row[0];
      /** @type {any} */
      const value = values[index][0];
      
      if (formula && formula.trim() !== '') {
        formulaCount++;
        if (sampleFormulas.length < 3) {
          sampleFormulas.push({
            row: index + 2,
            formula: formula,
            value: value
          });
        }
      } else if (value && value.toString().trim() !== '') {
        valueCount++;
        if (sampleValues.length < 3) {
          sampleValues.push({
            row: index + 2,
            value: value
          });
        }
      } else {
        emptyCount++;
      }
    });
    
    return {
      status: 'success',
      totalRows: lastRow - 1,
      formulaCount: formulaCount,
      valueCount: valueCount,
      emptyCount: emptyCount,
      sampleFormulas: sampleFormulas,
      sampleValues: sampleValues,
      message: `F列の状況: 計算式${formulaCount}個、値${valueCount}個、空白${emptyCount}個`
    };
    
  } catch (error) {
    return {
      status: 'error',
      message: 'F列の確認中にエラーが発生しました: ' + error.toString()
    };
  }
};