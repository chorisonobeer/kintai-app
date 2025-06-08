/**
 * パスワードリセット機能
 * ユーザーのメールアドレスを指定して新しいパスワードを生成・設定する
 */
function resetPassword() {
  var ui = SpreadsheetApp.getUi();
  
  // メールアドレスの入力を求める
  var emailResponse = ui.prompt(
    'パスワードリセット',
    'リセットするユーザーのメールアドレスを入力してください:',
    ui.ButtonSet.OK_CANCEL
  );
  
  if (emailResponse.getSelectedButton() !== ui.Button.OK) {
    return; // キャンセルされた場合
  }
  
  var email = emailResponse.getResponseText();
  if (!email || email === "") {
    ui.alert('エラー', 'メールアドレスを入力してください', ui.ButtonSet.OK);
    return;
  }
  
  // メンバーリストからユーザーを検索
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var memberSheet = ss.getSheetByName("メンバーリスト");
  
  if (!memberSheet) {
    ui.alert('エラー', 'メンバーリストシートが見つかりません', ui.ButtonSet.OK);
    return;
  }
  
  var lastRow = memberSheet.getLastRow();
  var data = memberSheet.getRange(2, 1, lastRow - 1, memberSheet.getLastColumn()).getValues();
  
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
    ui.alert('エラー', 'そのメールアドレスのユーザーは見つかりませんでした', ui.ButtonSet.OK);
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
    'パスワードリセット完了',
    '新しいパスワード: ' + newPassword + '\n\nユーザーに通知してください。',
    ui.ButtonSet.OK
  );
}

/**
 * ランダムなパスワードを生成する関数
 * @param {number} length - パスワードの長さ
 * @return {string} 生成されたパスワード
 */
function generateRandomPassword(length) {
  var chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  var password = '';
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
  var html = HtmlService.createHtmlOutputFromFile('memberRegistration')
    .setWidth(500)
    .setHeight(600);
  SpreadsheetApp.getUi().showModalDialog(html, 'メンバー登録');
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
    if (values[i][0] !== "" && values[i][0] !== null && values[i][0] !== undefined) {
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
      throw new Error('メンバーリストシートが見つかりません');
    }
    
    // E列（名前）の最終行を正確に取得
    var lastRowE = getLastRowOfColumn(memberSheet, 5); // 5はE列
    var newRow = Math.max(lastRowE + 1, 2); // 最低でも2行目から開始（ヘッダー考慮）
    
    // パスワード、ソルト、ハッシュを生成
    var password = generateRandomPassword(8);
    var salt = Utilities.getUuid();
    var hash = Utils.computeHash(password, salt);
    
    // 個人用勤怠データスプレッドシートを作成
    var personalSheetUrl = '';
    try {
      personalSheetUrl = createPersonalAttendanceSheet(memberData.name);
    } catch (sheetError) {
      console.error('個人用シート作成エラー:', sheetError);
      // 個人用シート作成に失敗してもメンバー登録は続行
      personalSheetUrl = 'エラー: ' + sheetError.message;
    }
    
    // データをシートに追加
    memberSheet.getRange(newRow, 3).setValue(salt);           // C列: ソルト
    memberSheet.getRange(newRow, 4).setValue(hash);           // D列: ハッシュ
    memberSheet.getRange(newRow, 5).setValue(memberData.name); // E列: 名前
    memberSheet.getRange(newRow, 6).setValue(memberData.phone); // F列: 電話番号
    memberSheet.getRange(newRow, 7).setValue(memberData.email); // G列: メールアドレス
    memberSheet.getRange(newRow, 8).setValue(memberData.address); // H列: 住所
    memberSheet.getRange(newRow, 9).setValue(personalSheetUrl); // I列: 個人用シートURL
    memberSheet.getRange(newRow, 10).setValue(memberData.hourlyWage); // J列: 時給
    memberSheet.getRange(newRow, 12).setValue(password);      // L列: パスワード
    
    return {
      success: true,
      password: password,
      message: 'メンバーが正常に登録されました（' + newRow + '行目に追加）\n個人用勤怠シートも作成されました'
    };
    
  } catch (error) {
    return {
      success: false,
      message: 'エラーが発生しました: ' + error.toString()
    };
  }
}

/**
 * 個人用勤怠データスプレッドシートを作成する関数
 * 実行者のGoogleドライブに新しいスプレッドシートを作成する
 * @param {string} memberName - メンバーの名前
 * @return {string} 作成されたスプレッドシートのURL
 */
function createPersonalAttendanceSheet(memberName) {
  try {
    // 現在の年を取得
    var currentYear = new Date().getFullYear();
    
    // 新しいファイル名を作成
    var newFileName = memberName + currentYear + '勤怠データ';
    
    // 現在のスプレッドシート（テンプレート）を取得
    var currentSpreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    
    // 現在の年のシートを取得（テンプレートとして使用）
    var sourceSheet = currentSpreadsheet.getSheetByName(currentYear.toString());
    if (!sourceSheet) {
      // 現在の年のシートがない場合は、「データ」シートを使用
      sourceSheet = currentSpreadsheet.getSheetByName('データ');
      if (!sourceSheet) {
        // 「データ」シートもない場合は、最初のシートを使用
        sourceSheet = currentSpreadsheet.getSheets()[0];
      }
    }
    
    // 実行者のドライブに新しいスプレッドシートを作成
    var newSpreadsheet = SpreadsheetApp.create(newFileName);
    var newSpreadsheetId = newSpreadsheet.getId();
    
    // デフォルトの「シート1」を取得
    var defaultSheet = newSpreadsheet.getSheets()[0];
    
    // テンプレートシートを新しいスプレッドシートにコピー
    var copiedSheet = sourceSheet.copyTo(newSpreadsheet);
    
    // コピーしたシート名を「データ」にリネーム
    copiedSheet.setName('データ');
    
    // デフォルトの「シート1」を削除（コピー後に削除）
    newSpreadsheet.deleteSheet(defaultSheet);
    
    // 新しく作成されたファイルの権限を設定
    var newFile = DriveApp.getFileById(newSpreadsheetId);
    
    // 実行者が所有者となり、リンクを知っている人は編集可能に設定
    newFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.EDIT);
    
    // URLを作成
    var fileUrl = 'https://docs.google.com/spreadsheets/d/' + newSpreadsheetId + '/edit?usp=sharing';
    
    console.log('個人用勤怠シート作成完了:', newFileName, fileUrl);
    console.log('作成者:', Session.getActiveUser().getEmail());
    console.log('コピー元シート:', sourceSheet.getName(), '→ データ');
    
    return fileUrl;
    
  } catch (error) {
    console.error('個人用勤怠シート作成エラー:', error);
    throw new Error('個人用勤怠シートの作成に失敗しました: ' + error.message);
  }
}

/**
 * 2025年データ集計機能
 */
function aggregateData2025() {
  try {
    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    
    // メンバーリストシートを取得
    const memberListSheet = spreadsheet.getSheetByName('メンバーリスト');
    if (!memberListSheet) {
      SpreadsheetApp.getUi().alert('エラー', 'メンバーリストシートが見つかりません。', SpreadsheetApp.getUi().ButtonSet.OK);
      return;
    }
    
    // 2025データシートを取得
    const dataSheet = spreadsheet.getSheetByName('2025データ');
    if (!dataSheet) {
      SpreadsheetApp.getUi().alert('エラー', '2025データシートが見つかりません。', SpreadsheetApp.getUi().ButtonSet.OK);
      return;
    }
    
    // メンバーデータを取得
    const lastRow = memberListSheet.getLastRow();
    if (lastRow < 2) {
      SpreadsheetApp.getUi().alert('エラー', 'メンバーリストにデータがありません。', SpreadsheetApp.getUi().ButtonSet.OK);
      return;
    }
    
    const memberData = memberListSheet.getRange(2, 1, lastRow - 1, 9).getValues();
    
    // 有効なメンバーデータをフィルタリング
    const validMembers = memberData.filter(row => {
      const uniqueId = row[1]; // B列
      const name = row[4]; // E列
      const url = row[8]; // I列
      return uniqueId && name && url && url.includes('spreadsheets/d/');
    });
    
    if (validMembers.length === 0) {
      SpreadsheetApp.getUi().alert('エラー', '有効なメンバーデータが見つかりません。', SpreadsheetApp.getUi().ButtonSet.OK);
      return;
    }
    
    // QUERY式の配列を作成
    const queryParts = validMembers.map(member => {
      const uniqueId = member[1]; // B列
      const name = member[4]; // E列
      const url = member[8]; // I列
      
      // URLからスプレッドシートIDを抽出
      const match = url.match(/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
      if (!match) {
        console.warn(`無効なURL: ${url}`);
        return null;
      }
      const spreadsheetId = match[1];
      const fullUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit?usp=sharing`;
      
      // QUERY式を組み立て
      return `QUERY({IMPORTRANGE("${fullUrl}", "データ!A:G"), ArrayFormula(IF(IMPORTRANGE("${fullUrl}", "データ!A:A")<> "", "${uniqueId}", "")), ArrayFormula(IF(IMPORTRANGE("${fullUrl}", "データ!A:A")<> "", "${name}", ""))}, "select Col1, Col9, Col8, Col3, Col4, Col5, Col6, Col7 where Col1 is not null and Col1>= date '2025-01-01' and Col1<= date '2025-12-31'", 0)`;
    }).filter(query => query !== null);
    
    if (queryParts.length === 0) {
      SpreadsheetApp.getUi().alert('エラー', '有効なクエリを生成できませんでした。', SpreadsheetApp.getUi().ButtonSet.OK);
      return;
    }
    
    // 最終的な数式を組み立て
    const formula = `={${queryParts.join('; ')}}`;
    
    // A2セルに数式を設定
    dataSheet.getRange('A2').setFormula(formula);
    
    // メンバーごとに色を設定するための条件付き書式を追加
    addColorFormattingForMembers(dataSheet, validMembers);
    
    // 成功メッセージ
    SpreadsheetApp.getUi().alert('完了', `${validMembers.length}人のデータを統合する数式をA2セルに設定しました。\nメンバーごとに色分けも設定されます。`, SpreadsheetApp.getUi().ButtonSet.OK);
    
  } catch (error) {
    console.error('エラーが発生しました:', error);
    SpreadsheetApp.getUi().alert('エラー', `処理中にエラーが発生しました: ${error.message}`, SpreadsheetApp.getUi().ButtonSet.OK);
  }
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
      '#FFE6E6', // 薄いピンク
      '#E6F3FF', // 薄い青
      '#E6FFE6', // 薄い緑
      '#FFFDE6', // 薄い黄色
      '#F0E6FF', // 薄い紫
      '#FFE6F0', // 薄いマゼンタ
      '#E6FFFF', // 薄いシアン
      '#FFE6CC', // 薄いオレンジ
      '#F5F5F5', // 薄いグレー
      '#E6F7FF'  // 薄い水色
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
        .setRanges([dataSheet.getRange('A:H')]) // A列からH列まで適用
        .build();
      
      rules.push(rule);
    });
    
    // 条件付き書式ルールを適用
    dataSheet.setConditionalFormatRules(rules);
    
    console.log(`${validMembers.length}人のメンバーに対して色分けを設定しました`);
    
  } catch (error) {
    console.error('色分け設定エラー:', error);
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
    '初回セットアップ',
    'このスプレッドシートを初めて使用しますか？\n' +
    'セットアップを実行すると、メニューが表示されるようになります。',
    ui.ButtonSet.YES_NO
  );
  
  if (response === ui.Button.YES) {
    try {
      // インストール可能トリガーを作成
      createInstallableTrigger();
      
      // メニューを即座に表示
      createCustomMenu();
      
      ui.alert(
        'セットアップ完了',
        'セットアップが完了しました。\n' +
        '「シート作成メニュー」が追加されました。\n' +
        '今後スプレッドシートを開くたびにメニューが表示されます。',
        ui.ButtonSet.OK
      );
    } catch (error) {
      ui.alert(
        'エラー',
        'セットアップ中にエラーが発生しました: ' + error.toString(),
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
    if (triggers[i].getHandlerFunction() === 'onOpenInstallable') {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }
  
  // 新しいインストール可能トリガーを作成
  ScriptApp.newTrigger('onOpenInstallable')
    .timeBased()
    .everyMinutes(1)
    .create();
  
  // より適切な方法：スプレッドシートのオープントリガー
  ScriptApp.newTrigger('onOpenInstallable')
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
  ui.createMenu('シート作成メニュー')
    .addItem('メンバー登録', 'registerMember')
    .addItem('2025年データを集計', 'aggregateData2025')
    .addSeparator()
    .addItem('パスワードリセット', 'resetPassword')
    .addSeparator()
    .addItem('初回セットアップ', 'setupForNewUser')
    .addToUi();
}

/**
 * 従来のonOpenトリガー（後方互換性のため残す）
 * ただし、新しいユーザーには表示されない可能性がある
 */
function onOpen() {
  createCustomMenu();
}