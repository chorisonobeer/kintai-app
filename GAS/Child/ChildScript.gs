/**
 * 子スプレッドシート用のスクリプト
 * 2025-06-08T10:00+09:00
 * 変更概要: 新規作成 - 子スプレッドシート用の簡潔なスクリプト
 */

/**
 * スプレッドシートが開かれた時に実行される関数
 * ライブラリのカスタムメニューを表示
 */
function onOpen() {
  try {
    // ライブラリのonOpen関数を呼び出し
    KintaiLibrary.onOpen();
  } catch (error) {
    console.error("onOpen error:", error);
    // フォールバック: 基本メニューを表示
    createBasicMenu();
  }
}

/**
 * インストール可能なonOpenトリガー関数
 * スプレッドシートをコピーした他のユーザーにも表示される
 */
function onOpenInstallable() {
  try {
    // ライブラリのonOpenInstallable関数を呼び出し
    KintaiLibrary.onOpenInstallable();
  } catch (error) {
    console.error("onOpenInstallable error:", error);
    // フォールバック: 基本メニューを表示
    createBasicMenu();
  }
}

/**
 * フォールバック用の基本メニュー
 */
function createBasicMenu() {
  var ui = SpreadsheetApp.getUi();
  ui.createMenu("シート作成メニュー")
    .addItem("メンバー登録", "registerMember")
    .addItem("パスワードリセット", "resetPassword")
    .addSeparator()
    .addItem("2025年データを集計", "aggregateData2025")
    .addSeparator()
    .addItem("ダッシュボード作成", "createDashboard")
    .addSeparator()
    .addItem("認証設定確認", "checkAuthSetup")
    .addItem("初回セットアップ", "setupForNewUser")
    .addToUi();
}

// ライブラリの関数を直接呼び出すためのラッパー関数
function registerMember() {
  try {
    return KintaiLibrary.registerMember();
  } catch (error) {
    SpreadsheetApp.getUi().alert(
      "エラー: ライブラリにアクセスできません。管理者に連絡してください。"
    );
  }
}

function aggregateData2025() {
  try {
    return KintaiLibrary.aggregateData2025();
  } catch (error) {
    SpreadsheetApp.getUi().alert(
      "エラー: ライブラリにアクセスできません。管理者に連絡してください。"
    );
  }
}

function resetPassword() {
  try {
    return KintaiLibrary.resetPassword();
  } catch (error) {
    SpreadsheetApp.getUi().alert(
      "エラー: ライブラリにアクセスできません。管理者に連絡してください。"
    );
  }
}

/**
 * 認証用スプレッドシートIDの設定状況を確認する関数
 */
function checkAuthSetup() {
  var ui = SpreadsheetApp.getUi();
  var authSpreadsheetId = PropertiesService.getScriptProperties().getProperty(
    "AUTH_SPREADSHEET_ID"
  );

  if (authSpreadsheetId) {
    ui.alert(
      "認証設定確認",
      "認証用スプレッドシートID: " +
        authSpreadsheetId +
        "\n\n" +
        "設定済みです。ログイン機能が利用できます。",
      ui.ButtonSet.OK
    );
  } else {
    ui.alert(
      "認証設定確認",
      "認証用スプレッドシートIDが設定されていません。\n" +
        "「初回セットアップ」を実行してください。",
      ui.ButtonSet.OK
    );
  }
}

function setupForNewUser() {
  var ui = SpreadsheetApp.getUi();

  // スプレッドシートIDの入力を求める
  var response = ui.prompt(
    "初回セットアップ - 認証用スプレッドシート設定",
    "認証に使用するメインスプレッドシートのIDを入力してください。\n" +
      "スプレッドシートのURLから「/d/」と「/edit」の間の文字列をコピーしてください。\n" +
      "例: https://docs.google.com/spreadsheets/d/【ここの部分】/edit\n\n" +
      "スプレッドシートID:",
    ui.ButtonSet.OK_CANCEL
  );

  if (response.getSelectedButton() === ui.Button.OK) {
    var spreadsheetId = response.getResponseText().trim();

    if (!spreadsheetId) {
      ui.alert(
        "エラー",
        "スプレッドシートIDが入力されていません。",
        ui.ButtonSet.OK
      );
      return;
    }

    try {
      // スプレッドシートIDの妥当性をチェック
      var testSheet = SpreadsheetApp.openById(spreadsheetId);
      var memberSheet = testSheet.getSheetByName("メンバーリスト");

      if (!memberSheet) {
        ui.alert(
          "エラー",
          "指定されたスプレッドシートに「メンバーリスト」シートが見つかりません。\n" +
            "正しいスプレッドシートIDを入力してください。",
          ui.ButtonSet.OK
        );
        return;
      }

      // スプレッドシートIDをプロパティに保存
      PropertiesService.getScriptProperties().setProperty(
        "AUTH_SPREADSHEET_ID",
        spreadsheetId
      );

      // 通常のセットアップ処理を実行
      try {
        KintaiLibrary.setupForNewUser();
      } catch (error) {
        // ライブラリが利用できない場合のフォールバック
        createInstallableTrigger();
        createBasicMenu();
      }

      ui.alert(
        "セットアップ完了",
        "セットアップが完了しました。\n" +
          "認証用スプレッドシートが設定され、メニューが追加されました。",
        ui.ButtonSet.OK
      );
    } catch (error) {
      ui.alert(
        "エラー",
        "スプレッドシートIDが無効です。\n" + "エラー詳細: " + error.toString(),
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
    .after(1000) // 1秒後に実行
    .create();
}

/**
 * メンバー情報をシートに追加する関数（ライブラリのラッパー）
 * HTMLダイアログから呼び出される
 */
function addMemberToSheet(memberData) {
  try {
    return KintaiLibrary.addMemberToSheet(memberData);
  } catch (error) {
    return {
      success: false,
      message: "ライブラリエラー: " + error.toString(),
    };
  }
}

/**
 * ダッシュボード作成機能（子スプレッドシート専用）
 */
function createDashboard() {
  try {
    // Dashboard.gsのcreateDashboard関数を呼び出し
    if (typeof window !== "undefined" && window.createDashboard) {
      return window.createDashboard();
    } else {
      // 直接実装されたダッシュボード作成機能
      var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
      var dashboardSheet = spreadsheet.getSheetByName("ダッシュボード");

      if (!dashboardSheet) {
        dashboardSheet = spreadsheet.insertSheet("ダッシュボード");
      }

      // 基本的なダッシュボード構造を作成
      dashboardSheet.clear();
      dashboardSheet.getRange("A1").setValue("勤怠管理ダッシュボード");
      dashboardSheet.getRange("A3").setValue("今月の勤務状況");

      SpreadsheetApp.getUi().alert("ダッシュボードが作成されました。");
    }
  } catch (error) {
    console.error("createDashboard error:", error);
    SpreadsheetApp.getUi().alert(
      "ダッシュボード作成中にエラーが発生しました: " + error.message
    );
  }
}

/**
 * 30分間ごとにデータ集計を実行する時間トリガーを作成する関数
 * 初回セットアップ時に自動実行される
 */
function createHourlyDataAggregationTrigger() {
  try {
    // 既存のトリガーを削除（重複防止）
    var triggers = ScriptApp.getProjectTriggers();
    for (var i = 0; i < triggers.length; i += 1) {
      if (triggers[i].getHandlerFunction() === "scheduledDataAggregation") {
        ScriptApp.deleteTrigger(triggers[i]);
      }
    }

    // 1時間ごとに実行される時間トリガーを作成
    ScriptApp.newTrigger("scheduledDataAggregation")
      .timeBased()
      .everyMinutes(30)
      .create();

    console.log("30分間ごとのデータ集計トリガーが設定されました");
  } catch (error) {
    console.error("トリガー設定エラー:", error);
  }
}

/**
 * 1時間ごとに実行されるデータ集計関数
 * この関数がトリガーによって定期的に呼び出される
 */
function scheduledDataAggregation() {
  try {
    // ここに個人用スプレッドシートのデータ集計処理を実装
    console.log("データ集計が実行されました:", new Date());

    // 実際の集計処理をここに追加
    // 例: 勤怠データの集計、サマリーの更新など
  } catch (error) {
    console.error("データ集計エラー:", error);
  }
}
