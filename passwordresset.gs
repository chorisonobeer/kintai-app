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
  for (var i = 0; i < data.length; i++) {
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
  for (var i = 0; i < length; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
}

/**
 * onOpenトリガーにより、カスタムメニュー「シート作成メニュー」を追加します。
 * メニューから「メンバーリスト作成」と「2025データ作成」を選択できるようにします。
 * パスワードリセット機能も追加します。
 */
function onOpen() {
  var ui = SpreadsheetApp.getUi();
  ui.createMenu('シート作成メニュー')
    .addItem('メンバーリスト作成', 'createMemberListSheet')  // ※メンバーリスト作成関数は別途用意済み
    .addItem('2025データ作成', 'create2025DataSheet')
    .addSeparator()
    .addItem('パスワードリセット', 'resetPassword')
    .addToUi();
}