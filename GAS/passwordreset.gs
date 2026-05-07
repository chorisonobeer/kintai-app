/**  passwordreset.gs                               2025-06-08
 *  ───────────────────────────────────────────────────
 *  勤怠管理 App Script - パスワードリセット機能
 *  - パスワードリセット処理
 *  - 新規スプレッドシート作成
 *  - メール通知機能
 *  ───────────────────────────────────────────────────
 */
function resetPassword() {
  var ui = SpreadsheetApp.getUi();

  // メールアドレスの入力を求める
  var emailResponse = ui.prompt(
    "パスワードリセット",
    "リセットするユーザーのメールアドレスを入力してください:",
    ui.ButtonSet.OK_CANCEL
  );

  if (emailResponse.getSelectedButton() !== ui.Button.OK) {
    return; // キャンセルされた場合
  }

  var email = emailResponse.getResponseText();
  if (!email || email === "") {
    ui.alert("エラー", "メールアドレスを入力してください", ui.ButtonSet.OK);
    return;
  }

  // メンバーリストからユーザーを検索
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var memberSheet = ss.getSheetByName("メンバーリスト");

  if (!memberSheet) {
    ui.alert("エラー", "メンバーリストシートが見つかりません", ui.ButtonSet.OK);
    return;
  }

  var lastRow = memberSheet.getLastRow();
  var data = memberSheet
    .getRange(2, 1, lastRow - 1, memberSheet.getLastColumn())
    .getValues();

  var userFound = false;
  var userRow = 0;

  // メールアドレスはG列（インデックス6）
  for (var i = 0; i < data.length; i += 1) {
    if (data[i][6] === email) {
      userFound = true;
      userRow = i + 2; // シートの実際の行番号
      break;
    }
  }

  if (!userFound) {
    ui.alert(
      "エラー",
      "そのメールアドレスのユーザーは見つかりませんでした",
      ui.ButtonSet.OK
    );
    return;
  }

  // 新しいパスワードを生成
  var newPassword = generateRandomPassword(8);

  // 新しいソルトを生成
  var newSalt = Utilities.getUuid();

  // 新しいハッシュを計算
  var newHash = Utils.computeHash(newPassword, newSalt);

  // ユーザー情報を更新
  memberSheet.getRange(userRow, 3).setValue(newSalt); // ソルト（C列）
  memberSheet.getRange(userRow, 4).setValue(newHash); // ハッシュ（D列）

  // 新しいパスワードを表示
  ui.alert(
    "パスワードリセット完了",
    "新しいパスワード: " + newPassword + "\n\nユーザーに通知してください。",
    ui.ButtonSet.OK
  );
}

/**
 * ランダムなパスワードを生成する関数
 * @param {number} length - パスワードの長さ
 * @return {string} 生成されたパスワード
 */
function generateRandomPassword(length) {
  var chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  var password = "";
  for (var i = 0; i < length; i += 1) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
}

/**
 * メンバー登録機能
 * HTMLダイアログを表示してメンバー情報を入力し、メンバーリストに追加する
 */
function registerMember() {
  var html = HtmlService.createHtmlOutputFromFile("memberRegistration")
    .setWidth(500)
    .setHeight(750);
  SpreadsheetApp.getUi().showModalDialog(html, "メンバー登録");
}

/**
 * 指定した列の最終行を正確に取得する関数
 * @param {Sheet} sheet - 対象のシート
 * @param {number} column - 列番号（A=1, B=2, C=3...）
 * @return {number} 最終行番号（データがない場合は0）
 */
function getLastRowOfColumn(sheet, column) {
  var lastRow = sheet.getLastRow();
  if (lastRow === 0) return 0; // シートが空の場合

  var values = sheet.getRange(1, column, lastRow, 1).getValues();

  for (var i = values.length - 1; i >= 0; i -= 1) {
    if (
      values[i][0] !== "" &&
      values[i][0] !== null &&
      values[i][0] !== undefined
    ) {
      return i + 1; // 実際の行番号を返す
    }
  }
  return 0; // データがない場合は0を返す
}

/**
 * メンバー情報をシートに追加する関数
 * HTMLダイアログから呼び出される
 */
function addMemberToSheet(memberData) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var memberSheet = ss.getSheetByName("メンバーリスト");

    if (!memberSheet) {
      throw new Error("メンバーリストシートが見つかりません");
    }

    // E列（名前）の最終行を正確に取得
    var lastRowE = getLastRowOfColumn(memberSheet, 5); // 5はE列
    var newRow = Math.max(lastRowE + 1, 2); // 最低でも2行目から開始（ヘッダー考慮）

    // パスワード、ソルト、ハッシュを生成
    var password = generateRandomPassword(8);
    var salt = Utilities.getUuid();
    var hash = Utils.computeHash(password, salt);

    // 個人用勤怠データスプレッドシートを作成
    var personalSheetUrl = "";
    try {
      personalSheetUrl = createPersonalAttendanceSheet(memberData.name);
    } catch (sheetError) {
      console.error("個人用シート作成エラー:", sheetError);
      // 個人用シート作成に失敗してもメンバー登録は続行
      personalSheetUrl = "エラー: " + sheetError.message;
    }

    // データをシートに追加
    memberSheet.getRange(newRow, 3).setValue(salt); // C列: ソルト
    memberSheet.getRange(newRow, 4).setValue(hash); // D列: ハッシュ
    memberSheet.getRange(newRow, 5).setValue(memberData.name); // E列: 名前
    memberSheet.getRange(newRow, 6).setValue(memberData.phone); // F列: 電話番号
    memberSheet.getRange(newRow, 7).setValue(memberData.email); // G列: メールアドレス
    memberSheet.getRange(newRow, 8).setValue(memberData.address); // H列: 住所
    memberSheet.getRange(newRow, 9).setValue(personalSheetUrl); // I列: 個人用シートURL
    memberSheet.getRange(newRow, 10).setValue(memberData.hourlyWage); // J列: 時給
    memberSheet.getRange(newRow, 11).setValue(memberData.classification); // K列: 分類（甲・乙）
    memberSheet.getRange(newRow, 12).setValue(memberData.dependents); // L列: 扶養人数
    memberSheet.getRange(newRow, 13).setValue(memberData.isForeigner); // M列: 外国人フラグ
    memberSheet.getRange(newRow, 14).setValue(password); // N列: パスワード

    return {
      success: true,
      password: password,
      message:
        "メンバーが正常に登録されました（" +
        newRow +
        "行目に追加）\n個人用勤怠シートも作成されました",
    };
  } catch (error) {
    return {
      success: false,
      message: "エラーが発生しました: " + error.toString(),
    };
  }
}

/**
 * 個人用勤怠データスプレッドシートを作成する関数
 * @param {string} memberName - メンバーの名前
 * @return {string} 作成されたスプレッドシートのURL
 */
function createPersonalAttendanceSheet(memberName) {
  try {
    // オリジナルテンプレ SS の ID
    var originalSpreadsheetId = "117AV0FX4KA_Bab_QLlivvsodZud5eAGsAh8yBksVdeY";

    var currentYear = new Date().getFullYear();

    // 年シート方式: ファイル名は年を含めない (年はシート名で管理)
    var newFileName = memberName + "勤怠データ";

    var originalSpreadsheet = SpreadsheetApp.openById(originalSpreadsheetId);

    // テンプレからは現在の年のシートを取得 (テンプレ側のシート名は "2025"/"2026" 想定)
    var sourceSheet = originalSpreadsheet.getSheetByName(currentYear.toString());
    if (!sourceSheet) {
      throw new Error(
        "オリジナルスプレッドシートに" + currentYear + "年のシートが見つかりません"
      );
    }

    var newSpreadsheet = SpreadsheetApp.create(newFileName);
    var newSpreadsheetId = newSpreadsheet.getId();

    var defaultSheet = newSpreadsheet.getSheets()[0];

    // テンプレをコピー
    var copiedSheet = sourceSheet.copyTo(newSpreadsheet);
    // 年シート方式: シート名は西暦4桁文字列
    copiedSheet.setName(String(currentYear));

    newSpreadsheet.deleteSheet(defaultSheet);

    var newFile = DriveApp.getFileById(newSpreadsheetId);
    newFile.setSharing(
      DriveApp.Access.ANYONE_WITH_LINK,
      DriveApp.Permission.EDIT
    );

    var fileUrl =
      "https://docs.google.com/spreadsheets/d/" +
      newSpreadsheetId +
      "/edit?usp=sharing";

    console.log("個人用勤怠シート作成完了:", newFileName, fileUrl);
    console.log("コピー元シート:", currentYear, "→", String(currentYear));

    return fileUrl;
  } catch (error) {
    console.error("個人用勤怠シート作成エラー:", error);
    throw new Error("個人用勤怠シートの作成に失敗しました: " + error.message);
  }
}

/**
 * 年度動的データ集計機能
 *
 * 個人シート「データ」タブの A:I を IMPORTRANGE で取得し、
 * メンバーリストの uniqueId / name を ArrayFormula で連結 (Col10/Col11) した上で、
 * 指定年の 1/1 〜 12/31 でフィルタした QUERY を集計シートの A2 に貼る。
 *
 * 集計シートの列レイアウト:
 *   A:日付 B:名前 C:ID D:出勤 E:休憩 F:退勤 G:勤務時間 H:作業内容 I:時給 J:給与
 *   (= select Col1, Col11, Col10, Col3, Col4, Col5, Col6, Col7, Col8, Col9)
 */
function aggregateDataForYear(year) {
  try {
    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    const ui = SpreadsheetApp.getUi();

    const memberListSheet = spreadsheet.getSheetByName("メンバーリスト");
    if (!memberListSheet) {
      ui.alert("エラー", "メンバーリストシートが見つかりません。", ui.ButtonSet.OK);
      return;
    }

    // 書込先は「${year}データ」シート。「${year}集計」は別用途（合計・月次集計）なので触らない。
    const dataSheetName = `${year}データ`;
    let dataSheet = spreadsheet.getSheetByName(dataSheetName);

    if (!dataSheet) {
      const resp = ui.alert(
        "シート作成確認",
        `「${dataSheetName}」シートが存在しません。新規作成して集計しますか？\n(注:「${year}集計」シートは別用途のため触りません)`,
        ui.ButtonSet.YES_NO
      );
      if (resp !== ui.Button.YES) return;
      dataSheet = spreadsheet.insertSheet(dataSheetName);
      dataSheet
        .getRange(1, 1, 1, 10)
        .setValues([
          [
            "日付",
            "名前",
            "ID",
            "出勤",
            "休憩",
            "退勤",
            "勤務時間",
            "作業内容",
            "時給",
            "給与",
          ],
        ]);
      dataSheet.getRange(1, 1, 1, 10).setFontWeight("bold");
      dataSheet.setFrozenRows(1);
    }

    // 書式設定 (毎回強制再設定。ヘッダ A1:J1 は触らない)
    // IMPORTRANGE は値のみで書式を引き継がないため、書込先シートで明示設定が必要。
    _applyAggregationSheetFormat_(dataSheet);

    const allMembers = _listValidMembers_();
    if (allMembers.length === 0) {
      ui.alert("エラー", "有効なメンバーデータが見つかりません。", ui.ButtonSet.OK);
      return;
    }

    // 当年に C+E (出勤・退勤) 両方非空の行があるメンバーのみ集計対象。
    // テストユーザーや帰国者など、当年の労働実績が無いメンバーを除外する。
    const validMembers = [];
    const excludedMembers = [];
    for (const m of allMembers) {
      if (_hasWorkDataForYear_(m, year)) {
        validMembers.push(m);
      } else {
        excludedMembers.push(m);
      }
    }
    if (validMembers.length === 0) {
      ui.alert(
        "情報",
        `${year}年は誰も労働実績 (C+E両方非空) がありません。集計を中止します。`,
        ui.ButtonSet.OK
      );
      return;
    }

    const startDate = `${year}-01-01`;
    const endDate = `${year}-12-31`;

    // 該当年データが 0 件のメンバーがいると `={...}` 配列リテラルが
    // ARRAY_LITERAL エラーで全崩壊するため、各 QUERY を IFERROR で包み、
    // 空時は 10 列ダミー行 ({"","",...,""}) を返して合成を成立させる。
    const emptyRowFallback = '{"","","","","","","","","",""}';

    // 年シート方式: 個人 SS 内の `${year}` という名前のシートを参照する。
    // 旧スキーマ「データ」シート1枚運用は移行関数で年シート化する想定。
    //
    // 重要: QUERY は列型を「最初の値」から推定する。1月が完全に空、5月から
    // 実データのメンバーは C-F 列を「文字列型」と判定され、時刻 Date が "8:00"
    // のような文字列として返ってきて SUMIFS で合計できなくなる。
    // 対策: 時刻列 (C-F) を `*1` で強制数値化してから QUERY に渡す。
    //   {A:B, ARRAY(C:F * 1), G:I, ArrayFormula(uniqueId), ArrayFormula(name)}
    // 列番号は元と同じ (Col3-Col6 が C-F)。
    const queryParts = validMembers
      .map((m) => {
        const match = m.url.match(/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
        if (!match) {
          console.warn(`無効なURL: ${m.url}`);
          return null;
        }
        const fullUrl = `https://docs.google.com/spreadsheets/d/${match[1]}/edit?usp=sharing`;
        return `IFERROR(QUERY({IMPORTRANGE("${fullUrl}", "${year}!A:B"),ArrayFormula(IFERROR(IMPORTRANGE("${fullUrl}", "${year}!C:F")*1, "")),IMPORTRANGE("${fullUrl}", "${year}!G:I"),ArrayFormula(IF(IMPORTRANGE("${fullUrl}", "${year}!A:A")<>"","${m.uniqueId}","")),ArrayFormula(IF(IMPORTRANGE("${fullUrl}", "${year}!A:A")<>"","${m.name}",""))},"select Col1, Col11, Col10, Col3, Col4, Col5, Col6, Col7, Col8, Col9 where Col1 is not null and Col1 >= date '${startDate}' and Col1 <= date '${endDate}'", 0), ${emptyRowFallback})`;
      })
      .filter((q) => q !== null);

    if (queryParts.length === 0) {
      ui.alert("エラー", "有効なクエリを生成できませんでした。", ui.ButtonSet.OK);
      return;
    }

    const formula = `={${queryParts.join("; ")}}`;
    dataSheet.getRange("A2").setFormula(formula);

    // 条件付き書式（メンバーごとの色分け）は既存実装を再利用するため
    // 旧 API ([row配列] 形式) に揃える
    const legacyMemberRows = validMembers.map((m) => {
      const row = new Array(9);
      row[1] = m.uniqueId;
      row[4] = m.name;
      row[8] = m.url;
      return row;
    });
    addColorFormattingForMembers(dataSheet, legacyMemberRows);

    // 書き込み先シートをアクティブ化（どのタブに書いたかユーザーに視認させる）
    spreadsheet.setActiveSheet(dataSheet);

    const targetNames = validMembers.map((m) => m.name).join(", ");
    const excludedNames = excludedMembers.map((m) => m.name).join(", ");
    const summary =
      `${year}年: ${validMembers.length}人のデータを更新しました。\n` +
      `シート名: 「${dataSheet.getName()}」(アクティブ化済み)\n\n` +
      `対象 (${validMembers.length}人):\n  ${targetNames}` +
      (excludedMembers.length > 0
        ? `\n\n除外 (労働実績なし, ${excludedMembers.length}人):\n  ${excludedNames}`
        : "");
    ui.alert("完了", summary, ui.ButtonSet.OK);
  } catch (error) {
    console.error("aggregateDataForYear エラー:", error);
    SpreadsheetApp.getUi().alert(
      "エラー",
      `処理中にエラーが発生しました: ${error.message}`,
      SpreadsheetApp.getUi().ButtonSet.OK
    );
  }
}

/** 既存メニュー互換 */
function aggregateData2025() {
  aggregateDataForYear(2025);
}
function aggregateData2026() {
  aggregateDataForYear(2026);
}
function aggregateDataCurrentYear() {
  aggregateDataForYear(new Date().getFullYear());
}

// ════════════════════════════════════════════════════════════════════
//   デバッグ用関数 (集計の不具合切り分け)
// ════════════════════════════════════════════════════════════════════

/** 数式生成だけしてダイアログ + ログ出力。書き込まない。 */
function previewAggregateFormula_2025() {
  _previewAggregateFormula_(2025);
}
function previewAggregateFormula_2026() {
  _previewAggregateFormula_(2026);
}

function _previewAggregateFormula_(year) {
  const ui = SpreadsheetApp.getUi();
  const validMembers = _listValidMembers_();
  if (validMembers.length === 0) {
    ui.alert("エラー", "有効なメンバーがいません", ui.ButtonSet.OK);
    return;
  }
  const formula = _buildAggregationFormula_(year, validMembers);
  console.log(`=== ${year}年 集計数式プレビュー ===`);
  console.log(formula);
  console.log(`=== IFERROR 含有: ${formula.includes("IFERROR") ? "YES" : "NO"} ===`);

  const stats = [
    `年: ${year}`,
    `メンバー数: ${validMembers.length}`,
    `IFERROR ラップ: ${formula.includes("IFERROR") ? "YES (新版コード)" : "NO (旧版コード)"}`,
    `数式長: ${formula.length} 文字`,
    "",
    "--- 数式 (先頭 1500 文字) ---",
    formula.length > 1500 ? formula.substring(0, 1500) + "\n...(以下省略、Apps Script ログで全文確認)" : formula,
  ].join("\n");
  _showLongDialog_(`${year}年 数式プレビュー`, stats);
}

/** 1 人指定で集計を実行（ARRAY_LITERAL エラー切り分け用） */
function aggregateOneMember_2025() {
  _aggregateOneMember_(2025);
}
function aggregateOneMember_2026() {
  _aggregateOneMember_(2026);
}

function _aggregateOneMember_(year) {
  const ui = SpreadsheetApp.getUi();
  const resp = ui.prompt(
    `${year}年 1人だけ集計 (デバッグ)`,
    "集計対象のメンバー名 (E列の値) を入力してください:",
    ui.ButtonSet.OK_CANCEL
  );
  if (resp.getSelectedButton() !== ui.Button.OK) return;
  const targetName = resp.getResponseText().trim();
  if (!targetName) return;

  const validMembers = _listValidMembers_().filter((m) => m.name === targetName);
  if (validMembers.length === 0) {
    ui.alert("エラー", `メンバー "${targetName}" が見つかりません`, ui.ButtonSet.OK);
    return;
  }

  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const dataSheetName = `${year}データ`;
  const dataSheet = spreadsheet.getSheetByName(dataSheetName);
  if (!dataSheet) {
    ui.alert(
      "エラー",
      `「${dataSheetName}」シートが見つかりません`,
      ui.ButtonSet.OK
    );
    return;
  }

  const formula = _buildAggregationFormula_(year, validMembers);
  dataSheet.getRange("A2").setFormula(formula);
  _applyAggregationSheetFormat_(dataSheet);
  spreadsheet.setActiveSheet(dataSheet);

  ui.alert(
    "完了",
    `${year}年 ${targetName} のみで集計を書き込みました。\nシート: 「${dataSheet.getName()}」(アクティブ化済み)\n\nA2 セルの結果を確認してください。`,
    ui.ButtonSet.OK
  );
}

/**
 * 集計シートに書式を適用 (ヘッダ A1:J1 は触らない)
 *  - A 列: 日付      yyyy/mm/dd
 *  - D-G 列: 時刻    hh:mm  (出勤/休憩/退勤/勤務時間)
 *  - I 列: 通貨      ¥#,##0 (時給)
 *  - J 列: 通貨      ¥#,##0 (給与)
 *  - B/C/H 列: そのまま (名前/ID/作業内容)
 */
function _applyAggregationSheetFormat_(sheet) {
  const maxRows = sheet.getMaxRows();
  if (maxRows < 2) return;
  const dataRows = maxRows - 1; // A2 以降

  sheet.getRange(2, 1, dataRows, 1).setNumberFormat("yyyy/mm/dd"); // A
  sheet.getRange(2, 4, dataRows, 4).setNumberFormat("hh:mm");      // D-G
  sheet.getRange(2, 9, dataRows, 1).setNumberFormat("¥#,##0");     // I
  sheet.getRange(2, 10, dataRows, 1).setNumberFormat("¥#,##0");    // J
}

/** 集計数式を組み立てる共通ロジック (build only, no write) */
function _buildAggregationFormula_(year, validMembers) {
  const startDate = `${year}-01-01`;
  const endDate = `${year}-12-31`;
  const emptyRowFallback = '{"","","","","","","","","",""}';

  const queryParts = validMembers
    .map((m) => {
      const match = m.url.match(/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
      if (!match) return null;
      const fullUrl = `https://docs.google.com/spreadsheets/d/${match[1]}/edit?usp=sharing`;
      // 時刻列 (C-F) を *1 で強制数値化 (列型推定の文字列化を防ぐ)
      return `IFERROR(QUERY({IMPORTRANGE("${fullUrl}", "${year}!A:B"),ArrayFormula(IFERROR(IMPORTRANGE("${fullUrl}", "${year}!C:F")*1, "")),IMPORTRANGE("${fullUrl}", "${year}!G:I"),ArrayFormula(IF(IMPORTRANGE("${fullUrl}", "${year}!A:A")<>"","${m.uniqueId}","")),ArrayFormula(IF(IMPORTRANGE("${fullUrl}", "${year}!A:A")<>"","${m.name}",""))},"select Col1, Col11, Col10, Col3, Col4, Col5, Col6, Col7, Col8, Col9 where Col1 is not null and Col1 >= date '${startDate}' and Col1 <= date '${endDate}'", 0), ${emptyRowFallback})`;
    })
    .filter((q) => q !== null);

  return `={${queryParts.join("; ")}}`;
}

// ════════════════════════════════════════════════════════════════════
//   年シート移行 (旧スキーマ「データ」1枚 → シート名=年 へ)
// ────────────────────────────────────────────────────────────────────
//   - ファイル名から年を除去:「パッション2025勤怠データ」→「パッション勤怠データ」
//   - 「データ」シートを A2 の年に応じて「YYYY」にリネーム
//   - 現在年シートが無ければ、最新年シートを複製して A 列を +N 年シフト + C-I クリア
// ════════════════════════════════════════════════════════════════════

function migrateToYearSheets_DryRun() {
  _migrateToYearSheets_DryRun_();
}
function migrateToYearSheets_ApplyOne() {
  _migrateToYearSheets_ApplyOne_();
}
function migrateToYearSheets_ApplyAll() {
  _migrateToYearSheets_ApplyAll_();
}

function _migrateToYearSheets_DryRun_() {
  const ui = SpreadsheetApp.getUi();
  const members = _listValidMembers_();
  if (members.length === 0) {
    ui.alert("エラー", "有効なメンバーがいません", ui.ButtonSet.OK);
    return;
  }
  const currentYear = new Date().getFullYear();
  const plans = members.map((m) => _scanMemberForYearMigration_(m, currentYear));
  _showMigrationPlanReport_(plans, "ドライラン");
}

function _migrateToYearSheets_ApplyOne_() {
  const ui = SpreadsheetApp.getUi();
  const resp = ui.prompt(
    "年シート移行 (1人適用)",
    "適用するメンバー名 (E列の値) を入力してください:",
    ui.ButtonSet.OK_CANCEL
  );
  if (resp.getSelectedButton() !== ui.Button.OK) return;
  const targetName = resp.getResponseText().trim();
  if (!targetName) return;

  const members = _listValidMembers_().filter((m) => m.name === targetName);
  if (members.length === 0) {
    ui.alert("エラー", `メンバー "${targetName}" が見つかりません`, ui.ButtonSet.OK);
    return;
  }
  const currentYear = new Date().getFullYear();
  _runYearMigrationApply_(members, currentYear, "1人適用");
}

function _migrateToYearSheets_ApplyAll_() {
  const ui = SpreadsheetApp.getUi();
  const resp = ui.alert(
    "年シート移行 (全員適用)",
    "全メンバーの個人 SS について\n - ファイル名から年を除去\n - 「データ」→「YYYY」リネーム\n - 当年シート増設\nを実行します。続行しますか？\n(エラーが出たメンバーはスキップして他は続行します)",
    ui.ButtonSet.YES_NO
  );
  if (resp !== ui.Button.YES) return;
  const members = _listValidMembers_();
  const currentYear = new Date().getFullYear();
  _runYearMigrationApply_(members, currentYear, "全員適用");
}

function _runYearMigrationApply_(members, currentYear, label) {
  const reports = [];
  for (const m of members) {
    const plan = _scanMemberForYearMigration_(m, currentYear);
    if (plan.error) {
      reports.push({
        member: m.name,
        applied: [],
        error: plan.error,
        skippedReason: "スキャン失敗",
      });
      continue;
    }
    if (plan.actions.length === 0) {
      reports.push({
        member: m.name,
        applied: ["既に移行済み (アクションなし)"],
        error: null,
      });
      continue;
    }
    const r = _applyYearMigrationToMember_(m, plan);
    reports.push(r);
  }

  const lines = [`=== 年シート移行 ${label} 完了 ===`];
  let okCount = 0;
  let errCount = 0;
  for (const r of reports) {
    lines.push("");
    lines.push(`[${r.member}]`);
    if (r.error) {
      lines.push(`  エラー: ${r.error}`);
      errCount++;
    } else {
      okCount++;
    }
    for (const a of r.applied) {
      lines.push(`  ✓ ${a}`);
    }
  }
  lines.push("");
  lines.push(`=== 合計: 成功 ${okCount} / エラー ${errCount} ===`);
  console.log(lines.join("\n"));
  _showLongDialog_(`年シート移行 ${label}`, lines.join("\n"));
}

function _showMigrationPlanReport_(plans, label) {
  const lines = [`=== 年シート移行 ${label} ===`];
  for (const p of plans) {
    lines.push("");
    lines.push(`[${p.member}]`);
    if (p.error) {
      lines.push(`  エラー: ${p.error}`);
      continue;
    }
    if (p.actions.length === 0) {
      lines.push(`  (既に移行済み、アクションなし)`);
    }
    for (const a of p.actions) {
      if (a.type === "renameFile") {
        lines.push(`  ・ファイル名: 「${a.from}」 → 「${a.to}」`);
      } else if (a.type === "renameSheet") {
        lines.push(`  ・シート名: 「${a.from}」 → 「${a.to}」`);
      } else if (a.type === "addYearSheet") {
        lines.push(
          `  ・シート追加: 「${a.targetYear}」 (テンプレ元: 「${a.sourceYear}」を複製 → A列 +${a.deltaYears}年 + C-I クリア)`
        );
      }
    }
    for (const w of p.warnings) {
      lines.push(`  ⚠ ${w}`);
    }
  }
  console.log(lines.join("\n"));
  _showLongDialog_(`年シート移行 ${label}`, lines.join("\n"));
}

function _scanMemberForYearMigration_(member, currentYear) {
  const result = {
    member: member.name,
    actions: [],
    warnings: [],
    error: null,
  };
  let ss;
  try {
    ss = SpreadsheetApp.openByUrl(member.url);
  } catch (e) {
    result.error = `個人SSを開けません: ${e.message}`;
    return result;
  }

  // 1. ファイル名から年を除去
  const fileName = ss.getName();
  const m = fileName.match(/^(.+?)(\d{4})(勤怠データ)$/);
  if (m) {
    const newName = m[1] + m[3];
    if (newName !== fileName) {
      result.actions.push({ type: "renameFile", from: fileName, to: newName });
    }
  } else if (!fileName.endsWith("勤怠データ")) {
    result.warnings.push(`ファイル名が想定パターンと違います: ${fileName}`);
  }

  // 2. シート構成
  const sheets = ss.getSheets();
  const sheetNames = sheets.map((s) => s.getName());
  const existingYearSheets = sheetNames.filter((n) => /^\d{4}$/.test(n));

  // 「データ」シートを年シート名にリネーム
  const dataSheet = ss.getSheetByName("データ");
  if (dataSheet) {
    const a2 = dataSheet.getRange(2, 1).getValue();
    let yearOfData = null;
    if (a2 instanceof Date) {
      yearOfData = a2.getFullYear();
    } else if (typeof a2 === "string") {
      const ym = a2.match(/(\d{4})/);
      if (ym) yearOfData = parseInt(ym[1], 10);
    }
    if (!yearOfData) {
      result.error = "「データ」シートの A2 から年を判定できません";
      return result;
    }
    const targetName = String(yearOfData);
    if (existingYearSheets.indexOf(targetName) >= 0) {
      result.warnings.push(
        `「${targetName}」シートが既存のため「データ」シートはリネームせずスキップ (重複) ※手動確認推奨`
      );
    } else {
      result.actions.push({
        type: "renameSheet",
        from: "データ",
        to: targetName,
      });
      existingYearSheets.push(targetName);
    }
  }

  // 3. 現在年シートが無ければテンプレ複製で増設
  const currentYearStr = String(currentYear);
  if (existingYearSheets.indexOf(currentYearStr) < 0) {
    const sorted = existingYearSheets.slice().sort();
    const sourceYearStr = sorted[sorted.length - 1];
    if (sourceYearStr) {
      const deltaYears = currentYear - parseInt(sourceYearStr, 10);
      if (deltaYears > 0) {
        result.actions.push({
          type: "addYearSheet",
          sourceYear: sourceYearStr,
          targetYear: currentYearStr,
          deltaYears: deltaYears,
        });
      }
    } else {
      result.warnings.push(
        `テンプレ元年シートが見当たらないため ${currentYearStr} シートを増設できません (要手動)`
      );
    }
  }

  return result;
}

function _applyYearMigrationToMember_(member, plan) {
  const result = { member: member.name, applied: [], error: null };
  let ss;
  try {
    ss = SpreadsheetApp.openByUrl(member.url);
  } catch (e) {
    result.error = `個人SSを開けません: ${e.message}`;
    return result;
  }

  for (const action of plan.actions) {
    try {
      if (action.type === "renameFile") {
        DriveApp.getFileById(ss.getId()).setName(action.to);
        result.applied.push(`ファイル名: 「${action.from}」 → 「${action.to}」`);
      } else if (action.type === "renameSheet") {
        const sh = ss.getSheetByName(action.from);
        if (sh) {
          sh.setName(action.to);
          result.applied.push(`シート名: 「${action.from}」 → 「${action.to}」`);
        }
      } else if (action.type === "addYearSheet") {
        const sourceSheet = ss.getSheetByName(action.sourceYear);
        if (!sourceSheet) {
          throw new Error(`テンプレ元シート「${action.sourceYear}」が見つからない`);
        }
        const newSheet = sourceSheet.copyTo(ss);
        newSheet.setName(action.targetYear);
        _shiftAColumnYears_(newSheet, action.deltaYears);
        // C-I (作業値・H時給・I給与) をクリア。F は数式なので残るが、E/C 空で #VALUE! 化するのを避けるため数式も含めクリア
        const lastRow = newSheet.getLastRow();
        if (lastRow >= 2) {
          newSheet.getRange(2, 3, lastRow - 1, 7).clearContent();
        }
        result.applied.push(
          `シート追加: 「${action.targetYear}」 (テンプレ元: 「${action.sourceYear}」, A列+${action.deltaYears}年, C-Iクリア)`
        );
      }
    } catch (e) {
      result.error = (result.error ? result.error + " / " : "") +
        `${action.type} エラー: ${e.message}`;
    }
  }
  return result;
}

function _shiftAColumnYears_(sheet, deltaYears) {
  if (!deltaYears) return;
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return;
  const range = sheet.getRange(2, 1, lastRow - 1, 1);
  const values = range.getValues();
  const newValues = values.map((row) => {
    const v = row[0];
    if (v instanceof Date) {
      // 同月日で年だけシフト (2/29 → 非閏年なら Date が 3/1 に正規化する)
      return [new Date(v.getFullYear() + deltaYears, v.getMonth(), v.getDate())];
    }
    return [v];
  });
  range.setValues(newValues);
}

// ════════════════════════════════════════════════════════════════════
//   H 列マイグレーション (2025年データ用)
// ────────────────────────────────────────────────────────────────────
//   旧スキーマ個人シート (I 列が =H*F 系の Sheets 数式) で H が空のため
//   I 列が #VALUE! になっている問題を解消する。
//
//   - G 列の作業内容を時給設定シートで引いて H 列に書き込む
//   - I 列は触らない (既存数式に任せる)
//   - 不一致が 1 件でもあれば中断 (厳格モード、ユーザー指定)
//   - 2025 年の単一作業のみ対象 (複数作業行は不一致扱い)
// ════════════════════════════════════════════════════════════════════

function migrateHColumn_DryRun_2025() {
  _migrateHColumn_DryRun_(2025);
}
function migrateHColumn_ApplyOne_2025() {
  _migrateHColumn_ApplyOne_(2025);
}
function migrateHColumn_ApplyAll_2025() {
  _migrateHColumn_ApplyAll_(2025);
}

function _migrateHColumn_DryRun_(year) {
  const ui = SpreadsheetApp.getUi();
  let wageMap;
  try {
    wageMap = _buildJobWageMap_();
  } catch (e) {
    ui.alert("エラー", e.message, ui.ButtonSet.OK);
    return;
  }
  const members = _listValidMembers_();
  if (members.length === 0) {
    ui.alert("エラー", "有効なメンバーがいません", ui.ButtonSet.OK);
    return;
  }
  const reports = members.map((m) =>
    _scanPersonalSheetForMigration_(m, year, wageMap)
  );
  _showMigrationReport_(year, reports, "ドライラン", false);
}

function _migrateHColumn_ApplyOne_(year) {
  const ui = SpreadsheetApp.getUi();
  const resp = ui.prompt(
    `${year}年 H列マイグレーション (1人適用)`,
    "適用するメンバー名 (E列の値) を入力してください:",
    ui.ButtonSet.OK_CANCEL
  );
  if (resp.getSelectedButton() !== ui.Button.OK) return;
  const targetName = resp.getResponseText().trim();
  if (!targetName) return;

  let wageMap;
  try {
    wageMap = _buildJobWageMap_();
  } catch (e) {
    ui.alert("エラー", e.message, ui.ButtonSet.OK);
    return;
  }
  const members = _listValidMembers_().filter((m) => m.name === targetName);
  if (members.length === 0) {
    ui.alert("エラー", `メンバー "${targetName}" が見つかりません`, ui.ButtonSet.OK);
    return;
  }
  _runMigrationApply_(year, members, wageMap, "1人適用");
}

function _migrateHColumn_ApplyAll_(year) {
  const ui = SpreadsheetApp.getUi();
  const resp = ui.alert(
    `${year}年 H列マイグレーション (全員適用)`,
    "全メンバーの H 列を上書きします。続行しますか？\n(不一致が1件でも検出されれば中断します)",
    ui.ButtonSet.YES_NO
  );
  if (resp !== ui.Button.YES) return;

  let wageMap;
  try {
    wageMap = _buildJobWageMap_();
  } catch (e) {
    ui.alert("エラー", e.message, ui.ButtonSet.OK);
    return;
  }
  const members = _listValidMembers_();
  _runMigrationApply_(year, members, wageMap, "全員適用");
}

function _runMigrationApply_(year, members, wageMap, label) {
  const ui = SpreadsheetApp.getUi();
  const reports = members.map((m) =>
    _scanPersonalSheetForMigration_(m, year, wageMap)
  );

  const totalMismatch = reports.reduce(
    (s, r) => s + (r.mismatches ? r.mismatches.length : 0),
    0
  );
  const hasError = reports.some((r) => r.error);

  if (totalMismatch > 0 || hasError) {
    _showMigrationReport_(year, reports, `${label} (中断)`, false);
    return;
  }

  // 適用フェーズ
  let totalWritten = 0;
  const applied = [];
  for (let i = 0; i < reports.length; i++) {
    const r = reports[i];
    const member = members[i];
    if (r.targetRows === 0) {
      applied.push(`[${r.member}] 書込対象なし`);
      continue;
    }
    try {
      const ss = SpreadsheetApp.openByUrl(member.url);
      const sheet = ss.getSheetByName("データ");
      const lastRow = sheet.getLastRow();
      const numRows = lastRow - 1;
      const range = sheet.getRange(2, 8, numRows, 1); // H 列のみ
      const hValues = range.getValues();
      for (const w of r.plannedWrites) {
        hValues[w.row - 2][0] = w.wage;
      }
      range.setValues(hValues);
      totalWritten += r.targetRows;
      applied.push(`[${r.member}] ${r.targetRows} 行書込`);
    } catch (e) {
      applied.push(`[${r.member}] 書込エラー: ${e.message}`);
    }
  }

  const summary = [
    `=== ${year}年 ${label} 完了 ===`,
    `合計書込: ${totalWritten} 行 / ${reports.length} メンバー`,
    "",
    ...applied,
  ].join("\n");
  console.log(summary);
  _showLongDialog_(`${year}年 ${label} 完了`, summary);
}

function _scanPersonalSheetForMigration_(member, year, wageMap) {
  const result = {
    member: member.name,
    targetRows: 0,
    plannedWrites: [], // [{row, job, wage, currentH}]
    skipped: 0,
    mismatches: [], // [{row, job, dateStr}]
  };
  let ss;
  try {
    ss = SpreadsheetApp.openByUrl(member.url);
  } catch (e) {
    result.error = `個人シートを開けません: ${e.message}`;
    return result;
  }
  const sheet = ss.getSheetByName("データ");
  if (!sheet) {
    result.error = "「データ」シートが見つかりません";
    return result;
  }
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return result;

  const numRows = lastRow - 1;
  const values = sheet.getRange(2, 1, numRows, 8).getValues(); // A..H

  for (let i = 0; i < numRows; i++) {
    const dateVal = values[i][0]; // A
    const gVal = values[i][6]; // G
    const currentH = values[i][7]; // H
    const rowNum = i + 2;

    let dateYear = null;
    if (dateVal instanceof Date) {
      dateYear = dateVal.getFullYear();
    } else if (typeof dateVal === "string" && dateVal) {
      const m = dateVal.match(/(\d{4})/);
      if (m) dateYear = parseInt(m[1], 10);
    }
    if (dateYear !== year) {
      result.skipped++;
      continue;
    }

    const parsed = _parseGColumnLocally_(gVal);
    if (!parsed.tasks || parsed.tasks.length === 0) {
      result.skipped++;
      continue;
    }
    if (parsed.tasks.length > 1) {
      result.mismatches.push({
        row: rowNum,
        job: "(複数作業)",
        dateStr: _formatDateStr_(dateVal),
      });
      continue;
    }
    const job = String(parsed.tasks[0].job || "").trim();
    if (!job) {
      result.skipped++;
      continue;
    }
    const wage = wageMap[job];
    if (wage == null) {
      result.mismatches.push({
        row: rowNum,
        job,
        dateStr: _formatDateStr_(dateVal),
      });
      continue;
    }
    result.targetRows++;
    result.plannedWrites.push({ row: rowNum, job, wage, currentH });
  }
  return result;
}

function _showMigrationReport_(year, reports, label) {
  const lines = [`=== ${year}年 H列マイグレーション ${label} ===`];
  let totalTarget = 0;
  let totalMismatch = 0;
  let totalSkipped = 0;
  for (const r of reports) {
    lines.push("");
    lines.push(`[${r.member}]`);
    if (r.error) {
      lines.push(`  エラー: ${r.error}`);
      continue;
    }
    lines.push(`  書込予定: ${r.targetRows} 行`);
    lines.push(`  スキップ: ${r.skipped} 行 (年違い・空G)`);
    lines.push(`  不一致: ${r.mismatches.length} 行`);
    for (const mm of r.mismatches.slice(0, 10)) {
      lines.push(`    行${mm.row} (${mm.dateStr}): "${mm.job}"`);
    }
    if (r.mismatches.length > 10) {
      lines.push(`    ...他 ${r.mismatches.length - 10} 件`);
    }
    totalTarget += r.targetRows;
    totalMismatch += r.mismatches.length;
    totalSkipped += r.skipped;
  }
  lines.push("");
  lines.push("=== 合計 ===");
  lines.push(
    `書込予定: ${totalTarget} 行 / 不一致: ${totalMismatch} 行 / スキップ: ${totalSkipped} 行`
  );
  if (totalMismatch > 0) {
    lines.push("");
    lines.push(
      `⚠ 不一致が ${totalMismatch} 件あります。時給設定シートに作業名を追加するか、G列を修正してください。`
    );
  } else {
    lines.push("");
    lines.push("✓ 不一致なし。「全員に適用」を実行できます。");
  }

  const text = lines.join("\n");
  console.log(text);
  _showLongDialog_(`${year}年 マイグレーション ${label}`, text);
}

function _showLongDialog_(title, text) {
  const escaped = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const html = HtmlService.createHtmlOutput(
    `<pre style="font-family: 'Courier New', monospace; white-space: pre-wrap; font-size: 12px;">${escaped}</pre>`
  )
    .setWidth(720)
    .setHeight(540);
  SpreadsheetApp.getUi().showModalDialog(html, title);
}

// ════════════════════════════════════════════════════════════════════
//   シート構造ダンプ (デバッグ用)
//   「2025集計」シートのレイアウト・数式・ボタン情報を取得し、
//   2026版以降の自動生成設計に使う。
// ════════════════════════════════════════════════════════════════════

function dumpSheetStructure_2025Aggregate() {
  _dumpSheetStructure_("2025集計");
}

function dumpSheetStructure_Prompt() {
  const ui = SpreadsheetApp.getUi();
  const resp = ui.prompt(
    "シート構造ダンプ",
    "ダンプするシート名を入力してください:",
    ui.ButtonSet.OK_CANCEL
  );
  if (resp.getSelectedButton() !== ui.Button.OK) return;
  const name = resp.getResponseText().trim();
  if (!name) return;
  _dumpSheetStructure_(name);
}

function _dumpSheetStructure_(sheetName) {
  const ui = SpreadsheetApp.getUi();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    ui.alert("エラー", `シート「${sheetName}」が見つかりません`, ui.ButtonSet.OK);
    return;
  }

  const lines = [];
  lines.push(`=== シート構造ダンプ: 「${sheetName}」 ===`);
  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();
  lines.push(
    `lastRow=${lastRow}, lastCol=${lastCol}, maxRows=${sheet.getMaxRows()}, maxCols=${sheet.getMaxColumns()}`
  );
  lines.push(`frozen: rows=${sheet.getFrozenRows()}, cols=${sheet.getFrozenColumns()}`);
  lines.push("");

  // セル: 数式または値
  lines.push("--- セル (値 / 数式) ---");
  if (lastRow > 0 && lastCol > 0) {
    const range = sheet.getRange(1, 1, lastRow, lastCol);
    const values = range.getValues();
    const formulas = range.getFormulas();
    for (let r = 0; r < values.length; r++) {
      for (let c = 0; c < values[r].length; c++) {
        const formula = formulas[r][c];
        const value = values[r][c];
        const a1 = _colA1_(c + 1) + (r + 1);
        if (formula) {
          lines.push(`${a1}: =${formula}`);
        } else if (value !== "" && value !== null && value !== undefined) {
          let valStr;
          if (value instanceof Date) {
            valStr = `[Date] ${value.toISOString()}`;
          } else if (typeof value === "number") {
            valStr = `[Num] ${value}`;
          } else {
            valStr = `[Str] ${value}`;
          }
          lines.push(`${a1}: ${valStr}`);
        }
      }
    }
  }

  // 結合セル
  lines.push("");
  lines.push("--- 結合セル ---");
  if (lastRow > 0 && lastCol > 0) {
    const merges = sheet.getRange(1, 1, lastRow, lastCol).getMergedRanges();
    if (merges.length === 0) {
      lines.push("(結合なし)");
    } else {
      for (const m of merges) {
        lines.push(m.getA1Notation());
      }
    }
  }

  // 図形 (ボタン)
  lines.push("");
  lines.push("--- 図形 (ボタン) 一覧 ---");
  let drawings = [];
  try {
    drawings = sheet.getDrawings();
  } catch (e) {
    lines.push(`(getDrawings エラー: ${e.message})`);
  }
  if (drawings.length === 0) {
    lines.push("(図形なし)");
  } else {
    for (let i = 0; i < drawings.length; i++) {
      const d = drawings[i];
      let onAction = "";
      try {
        onAction = d.getOnAction() || "";
      } catch (_) {}
      let posStr = "(位置取得不可)";
      try {
        const ci = d.getContainerInfo();
        posStr = `anchor=(row:${ci.getAnchorRow()}, col:${ci.getAnchorColumn()}) offset=(x:${ci.getOffsetX()}, y:${ci.getOffsetY()})`;
      } catch (e) {
        posStr = `(getContainerInfo エラー: ${e.message})`;
      }
      let sizeStr = "";
      try {
        sizeStr = `size=(${d.getWidth()}x${d.getHeight()})`;
      } catch (_) {}
      lines.push(`#${i + 1}: scriptFunc="${onAction}" ${posStr} ${sizeStr}`);
    }
  }

  // 条件付き書式ルール件数
  lines.push("");
  lines.push("--- 条件付き書式 ---");
  try {
    const rules = sheet.getConditionalFormatRules();
    lines.push(`ルール数: ${rules.length}`);
  } catch (e) {
    lines.push(`(取得エラー: ${e.message})`);
  }

  const text = lines.join("\n");
  console.log(text);
  _showLongDialog_(`シート構造: ${sheetName}`, text);
}

function _colA1_(col) {
  let result = "";
  while (col > 0) {
    const mod = (col - 1) % 26;
    result = String.fromCharCode(65 + mod) + result;
    col = Math.floor((col - 1) / 26);
  }
  return result;
}

// ════════════════════════════════════════════════════════════════════
//   個人シートと集計データの突合 (集計が空になる原因切り分け用)
// ════════════════════════════════════════════════════════════════════

/**
 * 任意メンバー × 任意年月日について、
 *  (a) 個人 SS の `${year}` シート上で当該日付がどう書かれているか
 *  (b) 集計用 SS の `${year}データ` シートに該当行があるか
 * を一括でダンプする。
 */
function inspectMemberOnDate_Prompt() {
  const ui = SpreadsheetApp.getUi();
  const respName = ui.prompt(
    "突合チェック",
    "メンバー名 (E列の値) を入力:",
    ui.ButtonSet.OK_CANCEL
  );
  if (respName.getSelectedButton() !== ui.Button.OK) return;
  const name = respName.getResponseText().trim();
  if (!name) return;

  const respDate = ui.prompt(
    "突合チェック",
    "日付を YYYY/M/D 形式で入力 (例: 2026/5/5):",
    ui.ButtonSet.OK_CANCEL
  );
  if (respDate.getSelectedButton() !== ui.Button.OK) return;
  const dateStr = respDate.getResponseText().trim();
  const dm = dateStr.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
  if (!dm) {
    ui.alert("エラー", "日付形式が不正です (YYYY/M/D)", ui.ButtonSet.OK);
    return;
  }
  const year = parseInt(dm[1], 10);
  const month = parseInt(dm[2], 10);
  const day = parseInt(dm[3], 10);

  const lines = [`=== 突合チェック: ${name} / ${year}/${month}/${day} ===`];

  // (a) 個人 SS 側
  const member = _listValidMembers_().filter((m) => m.name === name)[0];
  if (!member) {
    lines.push(`(エラー) メンバー "${name}" が見つかりません`);
    _showLongDialog_("突合チェック", lines.join("\n"));
    return;
  }
  lines.push(`uniqueId: ${member.uniqueId}`);
  lines.push(`url: ${member.url}`);
  lines.push("");
  lines.push("--- (a) 個人 SS の年シート ---");
  try {
    const ss = SpreadsheetApp.openByUrl(member.url);
    const sheetNames = ss.getSheets().map((s) => s.getName()).join(", ");
    lines.push(`シート一覧: [${sheetNames}]`);
    const targetSheet = ss.getSheetByName(String(year));
    if (!targetSheet) {
      lines.push(`(! 「${year}」シートが見つかりません)`);
    } else {
      const lastRow = targetSheet.getLastRow();
      lines.push(`「${year}」シート lastRow=${lastRow}`);

      // calcRow で当該日付を推定
      const isLeap =
        (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
      const dim = [0, 31, isLeap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
      let dayOfYear = day;
      for (let i = 1; i < month; i++) dayOfYear += dim[i];
      const calcRow = 1 + dayOfYear;
      lines.push(`計算行 (year-init+day): ${calcRow}`);

      // calcRow 周辺 (-1, 0, +1) を読む
      for (let off = -1; off <= 1; off++) {
        const r = calcRow + off;
        if (r < 2 || r > lastRow) continue;
        const row = targetSheet.getRange(r, 1, 1, 9).getValues()[0];
        const a = row[0];
        const aDesc =
          a instanceof Date
            ? `[Date] ${a.getFullYear()}/${a.getMonth() + 1}/${a.getDate()}`
            : `[${typeof a}] ${a}`;
        lines.push(
          `  行${r}: A=${aDesc} | C(出)=${_inspectVal_(row[2])} | E(退)=${_inspectVal_(row[4])} | F(時)=${_inspectVal_(row[5])} | G(内容)=${_inspectVal_(row[6])} | H(時給)=${_inspectVal_(row[7])} | I(給与)=${_inspectVal_(row[8])}`
        );
      }

      // TextFinder で日本語前置一致を試す
      const jpPrefix = `${year}年${month}月${day}日`;
      const finder = targetSheet
        .getRange(2, 1, lastRow - 1, 1)
        .createTextFinder(jpPrefix)
        .matchCase(false);
      const hit = finder.findNext();
      lines.push(
        `TextFinder("${jpPrefix}"): ${hit ? `行${hit.getRow()} ヒット` : "ヒットなし"}`
      );
    }
  } catch (e) {
    lines.push(`(個人 SS 読込エラー: ${e.message})`);
  }

  // (b) 集計用 SS の {year}データ シート
  lines.push("");
  lines.push(`--- (b) 集計用 SS の「${year}データ」シート ---`);
  try {
    const aggSs = SpreadsheetApp.getActiveSpreadsheet();
    const aggSheet = aggSs.getSheetByName(`${year}データ`);
    if (!aggSheet) {
      lines.push(`(! 「${year}データ」シートが見つかりません)`);
    } else {
      const aggLastRow = aggSheet.getLastRow();
      lines.push(`「${year}データ」 lastRow=${aggLastRow}`);
      // A 列 (日付), B 列 (name), G 列 (勤務時間) を全件読み、name 一致 + 日付一致でフィルタ
      // 集計データの列レイアウト:
      // A:日付 B:名前 C:ID D:出勤 E:休憩 F:退勤 G:勤務時間 H:作業内容 I:時給 J:給与
      const all = aggSheet.getRange(2, 1, Math.max(1, aggLastRow - 1), 10).getValues();
      let matchedRows = 0;
      const sampleLines = [];
      for (let i = 0; i < all.length; i++) {
        const aVal = all[i][0];
        const bVal = all[i][1];
        if (bVal !== name) continue;
        let matchDate = false;
        let aDesc = "";
        if (aVal instanceof Date) {
          aDesc = `[Date] ${aVal.getFullYear()}/${aVal.getMonth() + 1}/${aVal.getDate()}`;
          if (
            aVal.getFullYear() === year &&
            aVal.getMonth() + 1 === month &&
            aVal.getDate() === day
          ) {
            matchDate = true;
          }
        } else {
          aDesc = `[${typeof aVal}] ${aVal}`;
        }
        if (matchDate) {
          matchedRows++;
          sampleLines.push(
            `  行${i + 2}: A=${aDesc} | D(出)=${_inspectVal_(all[i][3])} | F(退)=${_inspectVal_(all[i][5])} | G(時)=${_inspectVal_(all[i][6])} | H(内容)=${_inspectVal_(all[i][7])} | I(時給)=${_inspectVal_(all[i][8])} | J(給与)=${_inspectVal_(all[i][9])}`
          );
        }
      }
      lines.push(`name="${name}" の総レコード数 (年問わず): ${all.filter((r) => r[1] === name).length}`);
      lines.push(`name="${name}" かつ A=${year}/${month}/${day} の行: ${matchedRows} 件`);
      for (const sl of sampleLines) lines.push(sl);

      // 該当 name の最初の数件を A 列の生値とともにダンプ (Date 型確認用)
      lines.push("");
      lines.push(`name="${name}" の先頭 5 行 (A 列の型を確認):`);
      let dumped = 0;
      for (let i = 0; i < all.length && dumped < 5; i++) {
        if (all[i][1] !== name) continue;
        const aVal = all[i][0];
        const aDesc =
          aVal instanceof Date
            ? `[Date] ${aVal.getFullYear()}/${aVal.getMonth() + 1}/${aVal.getDate()}`
            : `[${typeof aVal}] ${aVal}`;
        lines.push(`  行${i + 2}: A=${aDesc}`);
        dumped++;
      }
    }
  } catch (e) {
    lines.push(`(集計 SS 読込エラー: ${e.message})`);
  }

  const text = lines.join("\n");
  console.log(text);
  _showLongDialog_("突合チェック", text);
}

function _inspectVal_(v) {
  if (v === "" || v === null || v === undefined) return "(空)";
  if (v instanceof Date) {
    return `[Date] ${v.getFullYear()}/${v.getMonth() + 1}/${v.getDate()} ${v.getHours()}:${String(v.getMinutes()).padStart(2, "0")}`;
  }
  if (typeof v === "number") return `[Num] ${v}`;
  return `[Str] ${v}`;
}

// ════════════════════════════════════════════════════════════════════
//   集計シート (「YYYY集計」) クローン
//   「2025集計」を複製 → 数式の年置換 → ボタンの onAction 更新
//   置換対象: '${sourceYear}データ' → '${targetYear}データ'
//             DATE(${sourceYear},... → DATE(${targetYear},...
//   ボタン:   aggregateData${sourceYear} → aggregateData${targetYear}
// ════════════════════════════════════════════════════════════════════

function cloneAggregateSheet_2025_to_2026() {
  _cloneAggregateSheetForYear_(2025, 2026);
}

function cloneAggregateSheet_Prompt() {
  const ui = SpreadsheetApp.getUi();
  const respSrc = ui.prompt(
    "集計シート作成 (任意年)",
    "コピー元の年 (例: 2025) を入力してください:",
    ui.ButtonSet.OK_CANCEL
  );
  if (respSrc.getSelectedButton() !== ui.Button.OK) return;
  const sourceYear = parseInt(respSrc.getResponseText().trim(), 10);
  if (!sourceYear) {
    ui.alert("エラー", "年が不正です", ui.ButtonSet.OK);
    return;
  }
  const respTgt = ui.prompt(
    "集計シート作成 (任意年)",
    `コピー先の年 (例: ${sourceYear + 1}) を入力してください:`,
    ui.ButtonSet.OK_CANCEL
  );
  if (respTgt.getSelectedButton() !== ui.Button.OK) return;
  const targetYear = parseInt(respTgt.getResponseText().trim(), 10);
  if (!targetYear) {
    ui.alert("エラー", "年が不正です", ui.ButtonSet.OK);
    return;
  }
  _cloneAggregateSheetForYear_(sourceYear, targetYear);
}

function _cloneAggregateSheetForYear_(sourceYear, targetYear) {
  const ui = SpreadsheetApp.getUi();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sourceName = `${sourceYear}集計`;
  const targetName = `${targetYear}集計`;

  const source = ss.getSheetByName(sourceName);
  if (!source) {
    ui.alert("エラー", `「${sourceName}」シートが見つかりません`, ui.ButtonSet.OK);
    return;
  }
  if (ss.getSheetByName(targetName)) {
    const ok = ui.alert(
      "確認",
      `「${targetName}」シートが既に存在します。削除して再作成しますか？`,
      ui.ButtonSet.YES_NO
    );
    if (ok !== ui.Button.YES) return;
    ss.deleteSheet(ss.getSheetByName(targetName));
  }

  // 1. 複製
  const target = source.copyTo(ss);
  target.setName(targetName);

  // 2. 数式の年置換 (変更箇所のみ setFormula)
  const lastRow = target.getLastRow();
  const lastCol = target.getLastColumn();
  let changedFormulas = 0;
  if (lastRow > 0 && lastCol > 0) {
    const range = target.getRange(1, 1, lastRow, lastCol);
    const formulas = range.getFormulas();
    const sourceSheetRefRe = new RegExp(`'${sourceYear}データ'`, "g");
    const sourceDateRe = new RegExp(`DATE\\(\\s*${sourceYear}\\s*,`, "g");
    for (let r = 0; r < formulas.length; r++) {
      for (let c = 0; c < formulas[r].length; c++) {
        const f = formulas[r][c];
        if (!f) continue;
        const newF = f
          .replace(sourceSheetRefRe, `'${targetYear}データ'`)
          .replace(sourceDateRe, `DATE(${targetYear},`);
        if (newF !== f) {
          target.getRange(r + 1, c + 1).setFormula(newF);
          changedFormulas++;
        }
      }
    }
  }

  // 3. ボタン (Drawing) の onAction 更新
  let updatedDrawings = 0;
  try {
    const drawings = target.getDrawings();
    for (const d of drawings) {
      try {
        const onAction = d.getOnAction();
        if (onAction === `aggregateData${sourceYear}`) {
          d.setOnAction(`aggregateData${targetYear}`);
          updatedDrawings++;
        }
      } catch (_) {}
    }
  } catch (_) {}

  // 4. アクティブ化
  ss.setActiveSheet(target);

  // 5. 完了通知
  ui.alert(
    "完了",
    `「${targetName}」シートを作成しました。\n` +
      `元シート: 「${sourceName}」\n` +
      `数式置換: ${changedFormulas} セル\n` +
      `ボタン更新: ${updatedDrawings} 個 (aggregateData${sourceYear} → aggregateData${targetYear})\n\n` +
      `注: 「${targetYear}データ」シートが存在しない場合、SUMIFS が #REF! になります。\n` +
      `先に「データを集計 → ${targetYear}年データを集計」を実行してください。`,
    ui.ButtonSet.OK
  );
}

function _listValidMembers_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName("メンバーリスト");
  if (!sheet) return [];
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  const data = sheet.getRange(2, 1, lastRow - 1, 9).getValues();
  return data
    .map((row) => ({
      uniqueId: row[1],
      name: row[4],
      url: row[8],
    }))
    .filter(
      (m) =>
        m.uniqueId &&
        m.name &&
        m.url &&
        String(m.url).includes("spreadsheets/d/")
    );
}

/**
 * 個人 SS の `${year}` シートに「C(出勤) と E(退勤) 両方が非空の行」が
 * 1 行でも存在するかを返す。集計対象メンバーのフィルタ判定用。
 *
 * シートが無い・SS を開けない場合は false (= 集計対象外)。
 */
function _hasWorkDataForYear_(member, year) {
  try {
    const ss = SpreadsheetApp.openByUrl(member.url);
    const sheet = ss.getSheetByName(String(year));
    if (!sheet) return false;
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) return false;
    // C-E 列 (出勤/休憩/退勤) を一括読込。3 列分。
    const values = sheet.getRange(2, 3, lastRow - 1, 3).getValues();
    for (let i = 0; i < values.length; i++) {
      const c = values[i][0]; // C: 出勤
      const e = values[i][2]; // E: 退勤
      const cFilled = c !== "" && c !== null && c !== undefined;
      const eFilled = e !== "" && e !== null && e !== undefined;
      if (cFilled && eFilled) return true;
    }
    return false;
  } catch (err) {
    console.warn(
      `_hasWorkDataForYear_(${member.name}, ${year}) error: ${err.message}`
    );
    return false;
  }
}

function _buildJobWageMap_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName("時給設定");
  if (!sheet) {
    throw new Error("「時給設定」シートが見つかりません");
  }
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return {};
  const values = sheet.getRange(2, 1, lastRow - 1, 2).getValues();
  const map = {};
  for (let i = 0; i < values.length; i++) {
    const job = String(values[i][0] || "").trim();
    if (!job) continue;
    const wageRaw = values[i][1];
    const wage =
      typeof wageRaw === "number" ? wageRaw : parseInt(wageRaw, 10);
    if (!isNaN(wage)) map[job] = wage;
  }
  return map;
}

function _parseGColumnLocally_(rawVal) {
  const raw = String(rawVal || "").trim();
  if (raw === "") return { tasks: [], location: "" };
  if (raw.startsWith("[")) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        const loc = parsed
          .map((t) => t && t.job)
          .filter(Boolean)
          .join(", ");
        return { tasks: parsed, location: loc };
      }
    } catch (_) {
      /* fall through */
    }
  }
  return { tasks: [{ job: raw, hours: 0 }], location: raw };
}

function _formatDateStr_(dateVal) {
  if (dateVal instanceof Date) {
    return (
      dateVal.getFullYear() +
      "/" +
      (dateVal.getMonth() + 1) +
      "/" +
      dateVal.getDate()
    );
  }
  return String(dateVal || "");
}

/**
 * メンバーごとに色分けを設定する関数
 * @param {Sheet} dataSheet - 2025データシート
 * @param {Array} validMembers - 有効なメンバーデータの配列
 */
function addColorFormattingForMembers(dataSheet, validMembers) {
  try {
    // 既存の条件付き書式をクリア
    dataSheet.clearConditionalFormatRules();

    // メンバーごとに異なる色を定義（パステルカラー）
    const colors = [
      "#FFE6E6", // 薄いピンク
      "#E6F3FF", // 薄い青
      "#E6FFE6", // 薄い緑
      "#FFFDE6", // 薄い黄色
      "#F0E6FF", // 薄い紫
      "#FFE6F0", // 薄いマゼンタ
      "#E6FFFF", // 薄いシアン
      "#FFE6CC", // 薄いオレンジ
      "#F5F5F5", // 薄いグレー
      "#E6F7FF", // 薄い水色
    ];

    const rules = [];

    // 各メンバーに対して条件付き書式ルールを作成
    validMembers.forEach((member, index) => {
      const memberName = member[4]; // E列の名前
      const color = colors[index % colors.length]; // 色をローテーション

      // メンバー名に基づく条件付き書式ルールを作成（B列の名前で行全体を色分け）
      const rule = SpreadsheetApp.newConditionalFormatRule()
        .whenFormulaSatisfied(`=$B2="${memberName}"`) // B列（メンバー名列）が一致する場合
        .setBackground(color)
        .setRanges([dataSheet.getRange("A:H")]) // A列からH列まで適用
        .build();

      rules.push(rule);
    });

    // 条件付き書式ルールを適用
    dataSheet.setConditionalFormatRules(rules);

    console.log(
      `${validMembers.length}人のメンバーに対して色分けを設定しました`
    );
  } catch (error) {
    console.error("色分け設定エラー:", error);
  }
}

/**
 * 初回セットアップ機能
 * スプレッドシートをコピーした新しいユーザーが初回実行する関数
 */
function setupForNewUser() {
  var ui = SpreadsheetApp.getUi();

  // 確認ダイアログ
  var response = ui.alert(
    "初回セットアップ",
    "このスプレッドシートを初めて使用しますか？\n" +
      "セットアップを実行すると、メニューが表示されるようになります。",
    ui.ButtonSet.YES_NO
  );

  if (response === ui.Button.YES) {
    try {
      // インストール可能トリガーを作成
      createInstallableTrigger();

      // メニューを即座に表示
      createCustomMenu();

      ui.alert(
        "セットアップ完了",
        "セットアップが完了しました。\n" +
          "「シート作成メニュー」が追加されました。\n" +
          "今後スプレッドシートを開くたびにメニューが表示されます。",
        ui.ButtonSet.OK
      );
    } catch (error) {
      ui.alert(
        "エラー",
        "セットアップ中にエラーが発生しました: " + error.toString(),
        ui.ButtonSet.OK
      );
    }
  }
}

/**
 * インストール可能トリガーを作成する関数
 */
function createInstallableTrigger() {
  // 既存のトリガーを削除（重複防止）
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i += 1) {
    if (triggers[i].getHandlerFunction() === "onOpenInstallable") {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }

  // 新しいインストール可能トリガーを作成
  ScriptApp.newTrigger("onOpenInstallable")
    .timeBased()
    .everyMinutes(1)
    .create();

  // より適切な方法：スプレッドシートのオープントリガー
  ScriptApp.newTrigger("onOpenInstallable")
    .timeBased()
    .after(1000) // 1秒後に実行
    .create();
}

/**
 * インストール可能なonOpenトリガー関数
 * 通常のonOpenと異なり、スプレッドシートをコピーした他のユーザーにも表示される
 */
function onOpenInstallable() {
  createCustomMenu();
}

/**
 * カスタムメニューを作成する関数
 */
function createCustomMenu() {
  var ui = SpreadsheetApp.getUi();

  var aggregateMenu = ui.createMenu("データを集計")
    .addItem("2025年データを集計", "aggregateData2025")
    .addItem("2026年データを集計", "aggregateData2026")
    .addItem("今年のデータを集計", "aggregateDataCurrentYear")
    .addSeparator()
    .addItem("[デバッグ] 数式プレビュー (2025)", "previewAggregateFormula_2025")
    .addItem("[デバッグ] 数式プレビュー (2026)", "previewAggregateFormula_2026")
    .addItem("[デバッグ] 1人だけ集計 (2025)", "aggregateOneMember_2025")
    .addItem("[デバッグ] 1人だけ集計 (2026)", "aggregateOneMember_2026")
    .addSeparator()
    .addItem("[デバッグ] 2025集計シート構造ダンプ", "dumpSheetStructure_2025Aggregate")
    .addItem("[デバッグ] シート構造ダンプ (任意名)…", "dumpSheetStructure_Prompt")
    .addItem("[デバッグ] 個人×日付の突合チェック…", "inspectMemberOnDate_Prompt");

  var cloneAggregateMenu = ui.createMenu("集計シート管理")
    .addItem("2025集計 → 2026集計 を作成", "cloneAggregateSheet_2025_to_2026")
    .addItem("任意年の集計シートを作成…", "cloneAggregateSheet_Prompt");

  var migrationMenu2025 = ui.createMenu("H列マイグレーション (2025)")
    .addItem("ドライラン (全員, 書込なし)", "migrateHColumn_DryRun_2025")
    .addItem("1人だけ適用…", "migrateHColumn_ApplyOne_2025")
    .addItem("全員に適用", "migrateHColumn_ApplyAll_2025");

  var yearSheetMigrationMenu = ui.createMenu("年シート移行 (旧→年シート方式)")
    .addItem("ドライラン (全員確認, 書込なし)", "migrateToYearSheets_DryRun")
    .addItem("1人だけ適用…", "migrateToYearSheets_ApplyOne")
    .addItem("全員に適用", "migrateToYearSheets_ApplyAll");

  ui.createMenu("シート作成メニュー")
    .addItem("メンバー登録", "registerMember")
    .addSeparator()
    .addSubMenu(aggregateMenu)
    .addSeparator()
    .addSubMenu(cloneAggregateMenu)
    .addSeparator()
    .addSubMenu(yearSheetMigrationMenu)
    .addSeparator()
    .addSubMenu(migrationMenu2025)
    .addSeparator()
    .addItem("パスワードリセット", "resetPassword")
    .addSeparator()
    .addItem("初回セットアップ", "setupForNewUser")
    .addToUi();
}

/**
 * 従来のonOpenトリガー（後方互換性のため残す）
 * ただし、新しいユーザーには表示されない可能性がある
 */
function onOpen() {
  createCustomMenu();
}
