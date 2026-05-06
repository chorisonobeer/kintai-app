/**
 * GAS/kintai.gs                                                  2026-05-06
 * ─────────────────────────────────────────────────────────────────────
 *  勤怠データの保存・取得（Google Sheets バックエンド）
 *
 *  認証は Netlify Function で完結し、ここでは Auth.checkToken による
 *  HMAC 署名検証のみを行う。レガシー PropertiesService 経路も
 *  Auth.checkToken 内で互換維持される。
 *
 *  公開 API:
 *    - Kintai.handleSaveKintai      (action: saveKintai)
 *    - Kintai.handleGetMonthlyData  (action: getMonthlyData)
 *
 *  シート列レイアウト（個人勤怠 sheet「データ」タブ）:
 *    A: 日付   B: 月    C: 出勤   D: 休憩   E: 退勤
 *    F: 勤務時間（数式 =IF(E<C, E+1-C-D, E-C-D)）
 *    G: 作業内容（JSON: [{job, hours}, ...]、空文字は未入力）
 * ─────────────────────────────────────────────────────────────────────
 */

/**
 * @typedef {{date:string, startTime:string, breakTime:string, endTime:string,
 *            spreadsheetId:string, userId:string,
 *            location?:string, tasks?:Array<{job:string,hours:number}>}} KintaiPayload
 * @typedef {{spreadsheetId:string, userId:string, year:number, month:number}} MonthlyDataPayload
 * @typedef {{date:string, month:number, startTime:string, breakTime:string,
 *            endTime:string, workingTime:string, location:string,
 *            tasks:Array<{job:string,hours:number}>}} KintaiRecord
 */

const Kintai = {};

// ════════════════════════════════════════════════════════════════════
//   公開 API
// ════════════════════════════════════════════════════════════════════

/**
 * 勤怠データの保存（既存行は更新、なければ計算で算出した行に書込）。
 * 全フィールドが空 + tasks 空 = 削除扱い（C/E/G を空にし F 数式は温存）。
 */
Kintai.handleSaveKintai = function(payload, token, debug, diagInfo) {
  diagInfo = diagInfo || {};
  diagInfo.stage = 'saveKintai';
  diagInfo.handlerVersion = 'slim-2026-05-06';  // ← 新版判別マーカー

  // 1. 認証
  var authErr = _requireValidToken(token, diagInfo);
  if (authErr) return _err(authErr.err, debug, diagInfo);

  // 2. パラメータ検証
  var p = payload || {};
  var hasTasks = Array.isArray(p.tasks) && p.tasks.length > 0;
  var hasLocation = p.location && String(p.location).trim() !== '';
  var isDelete = !p.startTime && !p.endTime && !hasLocation && !hasTasks;
  diagInfo.isDelete = isDelete;

  if (!p.date || !p.spreadsheetId) {
    diagInfo.missingParams = true;
    return _err('必須パラメータが不足しています', debug, diagInfo);
  }
  if (!isDelete && (!p.userId || !p.startTime || !p.endTime)) {
    diagInfo.missingParams = true;
    return _err('必須パラメータが不足しています', debug, diagInfo);
  }

  // 3. シート取得
  var sheet;
  try {
    sheet = SpreadsheetApp.openById(p.spreadsheetId).getSheetByName('データ');
    if (!sheet) {
      diagInfo.sheetError = 'データシートが見つかりません';
      return _err('データシートが見つかりません', debug, diagInfo);
    }
  } catch (e) {
    diagInfo.sheetError = String(e);
    return _err('スプレッドシートアクセスエラー', debug, diagInfo);
  }

  // 4. 行特定
  diagInfo.stage = 'find_row';
  var normalizedDate = _normalizeDate(p.date);
  diagInfo.normalizedDate = normalizedDate;
  var rowIndex = _findOrCalculateRowByDate(sheet, normalizedDate);
  diagInfo.rowIndex = rowIndex;
  if (rowIndex <= 0) return _err('行の特定に失敗しました', debug, diagInfo);

  // 5. 書込
  diagInfo.stage = 'write';
  try {
    if (isDelete) {
      // 削除: C-E と G を空にする。F 数式は温存
      sheet.getRange(rowIndex, 3, 1, 3).setValues([['', '', '']]);
      sheet.getRange(rowIndex, 7).setValue('');
    } else {
      // 通常保存: C-E 一括書込、F 数式再設定、G に tasks JSON
      sheet.getRange(rowIndex, 3, 1, 3).setValues([
        [p.startTime, _formatBreakTime(p.breakTime), p.endTime]
      ]);

      // F 列: 失敗してもレコード本体は保存済みとして許容
      try {
        var fFormula = '=IF(E' + rowIndex + '<C' + rowIndex
          + ',(E' + rowIndex + '+1)-C' + rowIndex + '-D' + rowIndex
          + ',E' + rowIndex + '-C' + rowIndex + '-D' + rowIndex + ')';
        sheet.getRange(rowIndex, 6).setFormula(fFormula);
      } catch (formulaErr) {
        diagInfo.formulaError = String(formulaErr);
      }

      sheet.getRange(rowIndex, 7).setValue(_buildGValue(p.tasks, p.location));
    }

    diagInfo.stage = 'done';
    diagInfo.updated = true;
    return Utils.createResponse({ ok: true, debug: debug ? diagInfo : undefined });
  } catch (e) {
    diagInfo.saveError = String(e);
    return _err('データ保存エラー', debug, diagInfo);
  }
};

/**
 * 指定年月の勤怠データを取得（範囲限定読込で高速化）。
 */
Kintai.handleGetMonthlyData = function(payload, token, debug, diagInfo) {
  diagInfo = diagInfo || {};
  diagInfo.stage = 'getMonthlyData';
  diagInfo.handlerVersion = 'slim-2026-05-06';  // ← 新版判別マーカー

  // 1. 認証
  var authErr = _requireValidToken(token, diagInfo);
  if (authErr) return _err(authErr.err, debug, diagInfo);

  // 2. パラメータ
  var p = payload || {};
  if (!p.spreadsheetId) {
    diagInfo.missingParam = 'spreadsheetId';
    return _err('スプレッドシートIDが未指定です', debug, diagInfo);
  }
  if (!p.userId) {
    diagInfo.missingParam = 'userId';
    return _err('ユーザーIDが未指定です', debug, diagInfo);
  }
  if (p.year == null || p.month == null) {
    diagInfo.missingParam = (p.month == null) ? 'month' : 'year';
    return _err('年月が未指定です', debug, diagInfo);
  }

  // 3. シート取得
  var sheet;
  try {
    sheet = SpreadsheetApp.openById(p.spreadsheetId).getSheetByName('データ');
    if (!sheet) {
      diagInfo.sheetError = 'データシートが見つかりません';
      return _err('データシートが見つかりません', debug, diagInfo);
    }
  } catch (e) {
    diagInfo.sheetError = String(e);
    return _err('スプレッドシートアクセスエラー', debug, diagInfo);
  }

  // 4. 月の行範囲を計算で限定（全件読込を避ける）
  diagInfo.stage = 'read_data';
  var lastRow = sheet.getLastRow();
  var startRow = _findOrCalculateRowByDate(sheet, p.year + '/' + p.month + '/1');
  var daysInMonth = new Date(p.year, p.month, 0).getDate();
  var endRow = _findOrCalculateRowByDate(sheet, p.year + '/' + p.month + '/' + daysInMonth);
  if (startRow < 2) startRow = 2;
  if (endRow < startRow) endRow = startRow;
  if (endRow > lastRow) endRow = lastRow;
  var numRows = Math.max(0, endRow - startRow + 1);
  if (numRows === 0) {
    return Utils.createResponse({ ok: true, data: [], debug: debug ? diagInfo : undefined });
  }

  var values = sheet.getRange(startRow, 1, numRows, 7).getValues();

  // 5. レコード変換 + 月でフィルタ
  var result = [];
  for (var i = 0; i < values.length; i++) {
    var row = values[i];
    var dateStr = _toIsoDate(row[0]);
    if (!dateStr || dateStr.length < 7) continue;
    var ymParts = dateStr.split('-');
    if (parseInt(ymParts[0], 10) !== p.year || parseInt(ymParts[1], 10) !== p.month) continue;

    var g = _parseGColumn(row[6]);
    result.push({
      date: dateStr,
      month: _safeIntFromCell(row[1]),
      startTime: String(row[2] || ''),
      breakTime: String(row[3] || ''),
      endTime: String(row[4] || ''),
      workingTime: String(row[5] || ''),
      location: g.location,
      tasks: g.tasks
    });
  }

  return Utils.createResponse({ ok: true, data: result, debug: debug ? diagInfo : undefined });
};

// ════════════════════════════════════════════════════════════════════
//   内部ヘルパ（共通）
// ════════════════════════════════════════════════════════════════════

/**
 * トークン検証の単一ポイント。両ハンドラから同じ実装を共有することで
 * `saveKintai だけ通らない` 類の不整合を物理的に防ぐ。
 *
 * @returns {null | {err:string}} 検証成功なら null、失敗なら {err}
 */
function _requireValidToken(token, diagInfo) {
  diagInfo._helperReached = true;  // ← この helper が定義されていれば必ず true になる
  if (!token) {
    diagInfo.noToken = true;
    return { err: 'トークン未指定' };
  }
  diagInfo.stage = 'token_verification';
  try {
    var tokenInfo = Auth.checkToken(token);
    diagInfo.tokenValid = tokenInfo.valid;
    diagInfo.tokenFormat = tokenInfo._format;
    if (!tokenInfo.valid) {
      diagInfo.tokenReason = tokenInfo.reason;
      return { err: 'トークンが無効です' };
    }
    return null;
  } catch (e) {
    diagInfo.tokenError = String(e);
    return { err: 'トークン検証エラー' };
  }
}

function _err(message, debug, diagInfo) {
  return Utils.createResponse({
    ok: false,
    err: message,
    debug: debug ? diagInfo : undefined
  });
}

// ── 日付ユーティリティ ───────────────────────────────────────────────

function _normalizeDate(dateStr) {
  if (dateStr instanceof Date) {
    return dateStr.getFullYear() + '/'
      + String(dateStr.getMonth() + 1).padStart(2, '0') + '/'
      + String(dateStr.getDate()).padStart(2, '0');
  }
  if (typeof dateStr !== 'string') return String(dateStr);

  if (dateStr.includes('-')) {
    var ymd = dateStr.split('-');
    return ymd[0] + '/' + ymd[1] + '/' + ymd[2];
  }
  if (dateStr.includes('/')) return dateStr;
  var jp = dateStr.match(/^(\d{4})年(\d{1,2})月(\d{1,2})日/);
  if (jp) {
    return jp[1] + '/' + jp[2].padStart(2, '0') + '/' + jp[3].padStart(2, '0');
  }
  return dateStr;
}

function _toIsoDate(val) {
  if (val instanceof Date) {
    return val.getFullYear() + '-'
      + String(val.getMonth() + 1).padStart(2, '0') + '-'
      + String(val.getDate()).padStart(2, '0');
  }
  if (typeof val === 'string') {
    var n = _normalizeDate(val);
    var p = n.split('/');
    if (p.length === 3) return p[0] + '-' + p[1].padStart(2, '0') + '-' + p[2].padStart(2, '0');
    return n;
  }
  return String(val || '');
}

function _safeIntFromCell(val) {
  if (typeof val === 'number') return val;
  var n = parseInt(val, 10);
  return isNaN(n) ? 0 : n;
}

function _formatBreakTime(breakTime) {
  if (typeof breakTime === 'string' && breakTime.includes(':')) return breakTime;
  var minutes = parseInt(breakTime, 10);
  if (isNaN(minutes)) return '0:00';
  return Math.floor(minutes / 60) + ':' + String(minutes % 60).padStart(2, '0');
}

// ── G 列（作業内容 JSON） ────────────────────────────────────────────

/**
 * 保存時: tasks (新形式) があれば JSON 化、なければ location (旧形式) を 1 件の tasks に変換。
 * どちらもなければ空文字。
 */
function _buildGValue(tasks, location) {
  if (Array.isArray(tasks) && tasks.length > 0) {
    return JSON.stringify(tasks);
  }
  if (location && String(location).trim() !== '') {
    return JSON.stringify([{ job: String(location).trim(), hours: 0 }]);
  }
  return '';
}

/**
 * 読込時: G 列の生値を { tasks, location } に展開（旧形式の単一文字列にも対応）。
 */
function _parseGColumn(rawVal) {
  var raw = String(rawVal || '').trim();
  if (raw === '') return { tasks: [], location: '' };

  if (raw.startsWith('[')) {
    try {
      var parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        var loc = parsed.map(function(t) { return t && t.job; }).filter(Boolean).join(', ');
        return { tasks: parsed, location: loc };
      }
    } catch (_) { /* fall through to legacy */ }
  }
  // 旧形式: location 文字列だけが書かれているケース
  return { tasks: [{ job: raw, hours: 0 }], location: raw };
}

// ── 行検索（A 列の日付に対する TextFinder + フォールバック） ─────────

function _findOrCalculateRowByDate(sheet, dateStr) {
  var found = _searchRowByDate(sheet, dateStr);
  if (found > 0) return found;
  // 見つからなければ「ヘッダ + 年初からの経過日数」で推定
  var ymd = dateStr.split('/');
  return 1 + _getDayOfYear(parseInt(ymd[0], 10), parseInt(ymd[1], 10), parseInt(ymd[2], 10));
}

function _searchRowByDate(sheet, targetDateStr) {
  var lastRow = sheet.getLastRow();
  if (lastRow <= 1) return -1;

  // A 列は表示形式 "YYYY年M月D日(曜)" が多いので、まず TextFinder で日本語前置一致
  var ymd = targetDateStr.split('/');
  if (ymd.length === 3) {
    var jpPrefix = parseInt(ymd[0], 10) + '年' + parseInt(ymd[1], 10) + '月' + parseInt(ymd[2], 10) + '日';
    var aRange = sheet.getRange(2, 1, lastRow - 1, 1);
    var hit = aRange.createTextFinder(jpPrefix).matchCase(false).findNext();
    if (hit) return hit.getRow();
  }

  // フォールバック: A 列を読んで正規化比較
  var aValues = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  for (var i = 0; i < aValues.length; i++) {
    var v = aValues[i][0];
    var s = (v instanceof Date)
      ? (v.getFullYear() + '/' + String(v.getMonth() + 1).padStart(2, '0') + '/' + String(v.getDate()).padStart(2, '0'))
      : (typeof v === 'string' ? _normalizeDate(v) : '');
    if (s === targetDateStr) return i + 2;
  }
  return -1;
}

function _getDayOfYear(year, month, day) {
  var daysInMonth = [0, 31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if ((year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0)) daysInMonth[2] = 29;
  var n = day;
  for (var i = 1; i < month; i++) n += daysInMonth[i];
  return n;
}
