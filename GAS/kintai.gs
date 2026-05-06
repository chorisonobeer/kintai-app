/**
 * GAS/kintai.gs                                                  2026-05-06 (v12-perf-optim)
 * ─────────────────────────────────────────────────────────────────────
 *  勤怠データの保存・取得・時給マスタ取得（Google Sheets バックエンド）
 *
 *  認証は Netlify Function で完結し、ここでは Auth.checkToken による
 *  HMAC 署名検証のみを行う。レガシー PropertiesService 経路も
 *  Auth.checkToken 内で互換維持される。
 *
 *  公開 API:
 *    - Kintai.handleSaveKintai          (action: saveKintai)
 *    - Kintai.handleGetMonthlyData      (action: getMonthlyData)
 *    - Kintai.handleGetJobWageOptions   (action: getJobWageOptions)
 *
 *  シート列レイアウト（個人勤怠 sheet「データ」タブ）:
 *    A: 日付   B: 月    C: 出勤   D: 休憩   E: 退勤
 *    F: 勤務時間（数式 =IF(E<C, E+1-C-D, E-C-D)）
 *    G: 作業内容（JSON: [{job, hours}, ...]、空文字は未入力）
 *    H: （未使用、触らない）
 *    I: 給与合計（GAS が計算した数値、Σ 時給×時間）
 *
 *  v12 最適化:
 *    A: setValues 1 範囲（C-G）で 1 round-trip
 *    C: 行特定を計算 + 1 セル read で高速化
 *    D: getMonthlyData を CacheService で 5 分キャッシュ
 *    E: 時給マスタ取得 API 新設、CacheService 30 分
 *    F: saveKintai 内で I 列に Σ 時給×時間 を setValue
 * ─────────────────────────────────────────────────────────────────────
 */

const Kintai = {};

// ── 時給マスタ（全ユーザー共通） ──────────────────────────────────
var WAGE_MASTER_SPREADSHEET_ID = '1XF8QIoudGmRSYavHZ4CkZQjlEUlaaEULxcuWZVOlIuE';
var WAGE_MASTER_SHEET_NAME = '時給設定';
var WAGE_MASTER_CACHE_KEY_LIST = 'job_wage_master_v1';   // [{job, wage}] 形式
var WAGE_MASTER_CACHE_KEY_MAP = 'job_wage_master_map_v1'; // {job: wage} 形式
var WAGE_MASTER_CACHE_TTL_SEC = 1800; // 30 分
var MONTHLY_CACHE_TTL_SEC = 300;      // 5 分

// ════════════════════════════════════════════════════════════════════
//   公開 API
// ════════════════════════════════════════════════════════════════════

/**
 * 勤怠データの保存（既存行は更新、なければ計算で算出した行に書込）。
 * 全フィールドが空 + tasks 空 = 削除扱い（C/D/E/G を空に、I を 0、F 数式は再設定で温存）。
 */
Kintai.handleSaveKintai = function(payload, token, debug, diagInfo) {
  diagInfo = diagInfo || {};
  diagInfo.stage = 'saveKintai';
  diagInfo.handlerVersion = 'v12-perf-optim';
  var _t0 = Date.now();
  diagInfo.timings = {};

  // 1. 認証
  var authErr = _requireValidToken(token, diagInfo);
  diagInfo.timings.tAuth = Date.now() - _t0;
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
  var _tOpenStart = Date.now();
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
  diagInfo.timings.tOpen = Date.now() - _tOpenStart;

  // 4. 行特定
  diagInfo.stage = 'find_row';
  var _tFindStart = Date.now();
  var normalizedDate = _normalizeDate(p.date);
  diagInfo.normalizedDate = normalizedDate;
  var rowIndex = _findOrCalculateRowByDate(sheet, normalizedDate);
  diagInfo.rowIndex = rowIndex;
  diagInfo.timings.tFindRow = Date.now() - _tFindStart;
  if (rowIndex <= 0) return _err('行の特定に失敗しました', debug, diagInfo);

  // 5. 書込（A: 1 range setValues / F: I 列給与）
  diagInfo.stage = 'write';
  var _tWriteStart = Date.now();
  try {
    var fFormula = '=IF(E' + rowIndex + '<C' + rowIndex
      + ',(E' + rowIndex + '+1)-C' + rowIndex + '-D' + rowIndex
      + ',E' + rowIndex + '-C' + rowIndex + '-D' + rowIndex + ')';

    if (isDelete) {
      // 削除: C-G を空（F は formula 文字列で温存）、I を 0
      sheet.getRange(rowIndex, 3, 1, 5).setValues([
        ['', '', '', fFormula, '']
      ]);
      sheet.getRange(rowIndex, 9).setValue(0);
      diagInfo.timings.tSalary = 0;
    } else {
      // 通常保存: C-G を 1 範囲で書込、I 列に給与合計
      var gValue = _buildGValue(p.tasks, p.location);
      sheet.getRange(rowIndex, 3, 1, 5).setValues([
        [p.startTime, _formatBreakTime(p.breakTime), p.endTime, fFormula, gValue]
      ]);

      var _tSalaryStart = Date.now();
      try {
        var salary = _calculateSalary(p.tasks);
        diagInfo.salary = salary;
        sheet.getRange(rowIndex, 9).setValue(salary);
      } catch (salaryErr) {
        diagInfo.salaryError = String(salaryErr);
      }
      diagInfo.timings.tSalary = Date.now() - _tSalaryStart;
    }

    // D: キャッシュ invalidate（成功時のみ、該当月）
    var _tCacheStart = Date.now();
    try {
      var ymdParts = normalizedDate.split('/');
      var saveYear = parseInt(ymdParts[0], 10);
      var saveMonth = parseInt(ymdParts[1], 10);
      if (!isNaN(saveYear) && !isNaN(saveMonth)) {
        CacheService.getScriptCache().remove(_monthlyCacheKey(p.spreadsheetId, saveYear, saveMonth));
      }
    } catch (_) { /* cache 失敗は本処理に影響させない */ }
    diagInfo.timings.tCacheInval = Date.now() - _tCacheStart;

    // 自動 flush 計測のため明示 flush（その時間がボトルネックか測定）
    var _tFlushStart = Date.now();
    try { SpreadsheetApp.flush(); } catch (_) {}
    diagInfo.timings.tFlush = Date.now() - _tFlushStart;
    diagInfo.timings.tWrite = Date.now() - _tWriteStart;
    diagInfo.timings.tTotal = Date.now() - _t0;

    diagInfo.stage = 'done';
    diagInfo.updated = true;
    return Utils.createResponse({ ok: true, debug: debug ? diagInfo : undefined });
  } catch (e) {
    diagInfo.saveError = String(e);
    return _err('データ保存エラー', debug, diagInfo);
  }
};

/**
 * 指定年月の勤怠データを取得（D: CacheService 5 分キャッシュ）。
 */
Kintai.handleGetMonthlyData = function(payload, token, debug, diagInfo) {
  diagInfo = diagInfo || {};
  diagInfo.stage = 'getMonthlyData';
  diagInfo.handlerVersion = 'v12-perf-optim';
  var _t0 = Date.now();
  diagInfo.timings = {};

  // 1. 認証
  var authErr = _requireValidToken(token, diagInfo);
  diagInfo.timings.tAuth = Date.now() - _t0;
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

  // 3. キャッシュ確認 (D)
  diagInfo.stage = 'cache_check';
  var _tCacheStart = Date.now();
  var cache = CacheService.getScriptCache();
  var ck = _monthlyCacheKey(p.spreadsheetId, p.year, p.month);
  var cached = null;
  try { cached = cache.get(ck); } catch (_) { cached = null; }
  diagInfo.timings.tCacheGet = Date.now() - _tCacheStart;
  if (cached) {
    diagInfo.cacheHit = true;
    try {
      diagInfo.timings.tTotal = Date.now() - _t0;
      return Utils.createResponse({
        ok: true,
        data: JSON.parse(cached),
        debug: debug ? diagInfo : undefined
      });
    } catch (_) { /* parse 失敗は cache を無視して通常パス */ }
  }
  diagInfo.cacheHit = false;

  // 4. シート取得
  var _tOpenStart = Date.now();
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
  diagInfo.timings.tOpen = Date.now() - _tOpenStart;

  // 5. 月の行範囲を計算で限定
  diagInfo.stage = 'read_data';
  var _tFindStart = Date.now();
  var lastRow = sheet.getLastRow();
  var startRow = _findOrCalculateRowByDate(sheet, p.year + '/' + p.month + '/1');
  var daysInMonth = new Date(p.year, p.month, 0).getDate();
  var endRow = _findOrCalculateRowByDate(sheet, p.year + '/' + p.month + '/' + daysInMonth);
  if (startRow < 2) startRow = 2;
  if (endRow < startRow) endRow = startRow;
  if (endRow > lastRow) endRow = lastRow;
  var numRows = Math.max(0, endRow - startRow + 1);
  diagInfo.timings.tFindRange = Date.now() - _tFindStart;
  if (numRows === 0) {
    var emptyResult = [];
    try { cache.put(ck, JSON.stringify(emptyResult), MONTHLY_CACHE_TTL_SEC); } catch (_) {}
    diagInfo.timings.tTotal = Date.now() - _t0;
    return Utils.createResponse({ ok: true, data: emptyResult, debug: debug ? diagInfo : undefined });
  }

  var _tReadStart = Date.now();
  var values = sheet.getRange(startRow, 1, numRows, 7).getValues();
  diagInfo.timings.tRead = Date.now() - _tReadStart;

  // 6. レコード変換 + 月でフィルタ
  var _tParseStart = Date.now();
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
  diagInfo.timings.tParse = Date.now() - _tParseStart;

  // 7. キャッシュ保存
  var _tCachePutStart = Date.now();
  try { cache.put(ck, JSON.stringify(result), MONTHLY_CACHE_TTL_SEC); } catch (_) {}
  diagInfo.timings.tCachePut = Date.now() - _tCachePutStart;
  diagInfo.timings.tTotal = Date.now() - _t0;

  return Utils.createResponse({ ok: true, data: result, debug: debug ? diagInfo : undefined });
};

/**
 * 時給マスタ取得 (E)。「時給設定」シートを直読 + CacheService 30 分。
 * 戻り値: [{ job: string, wage: number|null }]
 */
Kintai.handleGetJobWageOptions = function(payload, token, debug, diagInfo) {
  diagInfo = diagInfo || {};
  diagInfo.stage = 'getJobWageOptions';
  diagInfo.handlerVersion = 'v12-perf-optim';

  // 1. 認証
  var authErr = _requireValidToken(token, diagInfo);
  if (authErr) return _err(authErr.err, debug, diagInfo);

  // 2. キャッシュ確認
  var cache = CacheService.getScriptCache();
  var cached = null;
  try { cached = cache.get(WAGE_MASTER_CACHE_KEY_LIST); } catch (_) { cached = null; }
  if (cached) {
    diagInfo.cacheHit = true;
    try {
      return Utils.createResponse({
        ok: true,
        data: JSON.parse(cached),
        debug: debug ? diagInfo : undefined
      });
    } catch (_) { /* fall through */ }
  }
  diagInfo.cacheHit = false;

  // 3. マスタ読込
  diagInfo.stage = 'read_master';
  try {
    var masterSheet = SpreadsheetApp.openById(WAGE_MASTER_SPREADSHEET_ID)
      .getSheetByName(WAGE_MASTER_SHEET_NAME);
    if (!masterSheet) {
      diagInfo.masterError = '時給設定シートが見つかりません';
      return _err('時給マスタが見つかりません', debug, diagInfo);
    }
    var lastRow = masterSheet.getLastRow();
    if (lastRow < 2) {
      var empty = [];
      try { cache.put(WAGE_MASTER_CACHE_KEY_LIST, JSON.stringify(empty), WAGE_MASTER_CACHE_TTL_SEC); } catch (_) {}
      return Utils.createResponse({ ok: true, data: empty, debug: debug ? diagInfo : undefined });
    }
    var values = masterSheet.getRange(2, 1, lastRow - 1, 2).getValues();
    var data = [];
    for (var i = 0; i < values.length; i++) {
      var job = String(values[i][0] || '').trim();
      if (!job) continue;
      var wageRaw = values[i][1];
      var wage = (typeof wageRaw === 'number') ? wageRaw : parseInt(wageRaw, 10);
      data.push({ job: job, wage: isNaN(wage) ? null : wage });
    }

    try { cache.put(WAGE_MASTER_CACHE_KEY_LIST, JSON.stringify(data), WAGE_MASTER_CACHE_TTL_SEC); } catch (_) {}

    return Utils.createResponse({
      ok: true,
      data: data,
      debug: debug ? diagInfo : undefined
    });
  } catch (e) {
    diagInfo.masterError = String(e);
    return _err('時給マスタ取得エラー', debug, diagInfo);
  }
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
  diagInfo._helperReached = true;
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

// ── 月次キャッシュキー生成（D） ──────────────────────────────────────

function _monthlyCacheKey(spreadsheetId, year, month) {
  return 'm:' + spreadsheetId + ':' + year + '-' + month;
}

// ── 時給マスタ map 取得（F: salary 計算用） ───────────────────────────

function _getJobWageMap() {
  var cache = CacheService.getScriptCache();
  var cached = null;
  try { cached = cache.get(WAGE_MASTER_CACHE_KEY_MAP); } catch (_) { cached = null; }
  if (cached) {
    try { return JSON.parse(cached); } catch (_) { /* fall through */ }
  }
  try {
    var masterSheet = SpreadsheetApp.openById(WAGE_MASTER_SPREADSHEET_ID)
      .getSheetByName(WAGE_MASTER_SHEET_NAME);
    if (!masterSheet) return {};
    var lastRow = masterSheet.getLastRow();
    if (lastRow < 2) return {};
    var values = masterSheet.getRange(2, 1, lastRow - 1, 2).getValues();
    var map = {};
    for (var i = 0; i < values.length; i++) {
      var job = String(values[i][0] || '').trim();
      if (!job) continue;
      var wageRaw = values[i][1];
      var wage = (typeof wageRaw === 'number') ? wageRaw : parseInt(wageRaw, 10);
      if (!isNaN(wage)) map[job] = wage;
    }
    try { cache.put(WAGE_MASTER_CACHE_KEY_MAP, JSON.stringify(map), WAGE_MASTER_CACHE_TTL_SEC); } catch (_) {}
    return map;
  } catch (_) {
    return {};
  }
}

function _calculateSalary(tasks) {
  if (!Array.isArray(tasks) || tasks.length === 0) return 0;
  var wageMap = _getJobWageMap();
  var total = 0;
  for (var i = 0; i < tasks.length; i++) {
    var t = tasks[i];
    if (!t || !t.job) continue;
    var hours = Number(t.hours);
    if (!isFinite(hours)) continue;
    var wage = wageMap[String(t.job).trim()];
    if (typeof wage === 'number' && isFinite(wage)) {
      total += wage * hours;
    }
  }
  return total;
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

// ── 行検索（C: calc + 1 cell read 高速化） ───────────────────────────

function _findOrCalculateRowByDate(sheet, dateStr) {
  var ymd = dateStr.split('/');
  if (ymd.length !== 3) return _searchRowByDate(sheet, dateStr);
  var year = parseInt(ymd[0], 10);
  var month = parseInt(ymd[1], 10);
  var day = parseInt(ymd[2], 10);
  if (isNaN(year) || isNaN(month) || isNaN(day)) {
    return _searchRowByDate(sheet, dateStr);
  }
  var calcRow = 1 + _getDayOfYear(year, month, day);

  // 1 セル read で検証（高速パス）
  var lastRow = sheet.getLastRow();
  if (calcRow >= 2 && calcRow <= lastRow) {
    var aVal = sheet.getRange(calcRow, 1).getValue();
    var aStr = '';
    if (aVal instanceof Date) {
      aStr = aVal.getFullYear() + '/'
        + String(aVal.getMonth() + 1).padStart(2, '0') + '/'
        + String(aVal.getDate()).padStart(2, '0');
    } else if (typeof aVal === 'string') {
      aStr = _normalizeDate(aVal);
    }
    if (aStr === dateStr) return calcRow; // 高速パス成功
  }

  // 計算ミス時のみ TextFinder fallback
  var found = _searchRowByDate(sheet, dateStr);
  if (found > 0) return found;
  return calcRow; // 行が無ければ計算行を返す（既存仕様維持）
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
