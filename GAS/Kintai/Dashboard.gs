/**  Dashboard.gs                                   2025-06-08
 *  ───────────────────────────────────────────────────
 *  勤怠管理 App Script - ダッシュボード作成機能
 *  - 自動ダッシュボード生成
 *  - ライブラリ対応準備
 *  - 将来的な拡張用ダミー実装
 *  ───────────────────────────────────────────────────
 */

/**
 * メインのダッシュボード作成関数
 * 将来的にライブラリから呼び出される予定
 */
function createDashboard() {
  try {
    var ui = SpreadsheetApp.getUi();

    // 確認ダイアログ
    var response = ui.alert(
      "ダッシュボード作成",
      "ダッシュボードを作成しますか？\n（現在はダミー実装です）",
      ui.ButtonSet.YES_NO
    );

    if (response === ui.Button.YES) {
      // ダミー処理：現在は基本的な処理のみ
      var result = generateDashboardData();

      ui.alert(
        "ダッシュボード作成完了",
        "ダッシュボードが作成されました。\n" +
          "処理されたデータ件数: " +
          result.dataCount +
          "件\n" +
          "作成日時: " +
          result.createdAt,
        ui.ButtonSet.OK
      );
    }
  } catch (error) {
    SpreadsheetApp.getUi().alert(
      "エラー",
      "ダッシュボード作成中にエラーが発生しました: " + error.toString(),
      SpreadsheetApp.getUi().ButtonSet.OK
    );
  }
}

/**
 * ダッシュボードデータを生成する関数（ダミー実装）
 * 将来的にはここで実際のデータ処理を行う
 */
function generateDashboardData() {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();

    // ダミーデータ処理
    var dataCount = 0;

    // メンバーリストの件数を取得（ダミー処理として）
    var memberSheet = ss.getSheetByName("メンバーリスト");
    if (memberSheet) {
      dataCount = Math.max(memberSheet.getLastRow() - 1, 0);
    }

    // 将来的にはここで以下の処理を実装予定：
    // - 勤怠データの集計
    // - グラフの生成
    // - レポートの作成
    // - 統計情報の計算

    return {
      success: true,
      dataCount: dataCount,
      createdAt: new Date().toLocaleString("ja-JP"),
      message: "ダッシュボードデータの生成が完了しました（ダミー）",
    };
  } catch (error) {
    return {
      success: false,
      dataCount: 0,
      createdAt: new Date().toLocaleString("ja-JP"),
      message: "エラー: " + error.toString(),
    };
  }
}

/**
 * ライブラリから呼び出される予定の関数
 * 外部ライブラリとの連携用インターフェース
 */
function createDashboardFromLibrary(options) {
  try {
    // オプションのデフォルト値設定
    var config = {
      autoGenerate:
        options && options.autoGenerate !== undefined
          ? options.autoGenerate
          : true,
      includeCharts:
        options && options.includeCharts !== undefined
          ? options.includeCharts
          : true,
      dateRange:
        options && options.dateRange ? options.dateRange : "current_month",
      outputFormat:
        options && options.outputFormat ? options.outputFormat : "sheet",
    };

    // ダミー処理：将来的にはライブラリの機能を呼び出す
    var result = generateDashboardData();

    // ライブラリ用の戻り値形式
    return {
      success: result.success,
      dashboardId: "dummy_dashboard_" + Date.now(),
      dataProcessed: result.dataCount,
      createdAt: result.createdAt,
      config: config,
      message: "ライブラリ経由でのダッシュボード作成完了（ダミー）",
    };
  } catch (error) {
    return {
      success: false,
      dashboardId: null,
      dataProcessed: 0,
      createdAt: new Date().toLocaleString("ja-JP"),
      config: options || {},
      message: "エラー: " + error.toString(),
    };
  }
}

/**
 * ダッシュボード設定を取得する関数
 * 将来的な設定管理用
 */
function getDashboardConfig() {
  return {
    version: "1.0.0-dummy",
    supportedFormats: ["sheet", "pdf", "html"],
    defaultDateRange: "current_month",
    maxDataPoints: 1000,
    libraryCompatible: true,
    lastUpdated: new Date().toISOString(),
  };
}

/**
 * ダッシュボードのステータスを確認する関数
 */
function checkDashboardStatus() {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var config = getDashboardConfig();

    return {
      ready: true,
      spreadsheetId: ss.getId(),
      spreadsheetName: ss.getName(),
      config: config,
      message: "ダッシュボード機能は利用可能です（ダミー実装）",
    };
  } catch (error) {
    return {
      ready: false,
      spreadsheetId: null,
      spreadsheetName: null,
      config: null,
      message: "エラー: " + error.toString(),
    };
  }
}

/**
 * 互換性のための旧関数名エイリアス
 */
function generateDashboard() {
  Logger.log("警告: 非推奨の関数 generateDashboard が呼び出されました");
  return createDashboard();
}

/**
 * インストール可能なトリガー用のonOpen関数
 * 子どもプロジェクトでも親と同じメニューを表示
 */
function onOpenInstallable() {
  createCustomMenu();
}

/**
 * カスタムメニューを作成する関数
 * 親プロジェクトと同じメニュー構成
 */
function createCustomMenu() {
  var ui = SpreadsheetApp.getUi();
  ui.createMenu("シート作成メニュー")
    .addItem("メンバー登録", "registerMember")
    .addItem("2025年データを集計", "aggregateData2025")
    .addSeparator()
    .addItem("パスワードリセット", "resetPassword")
    .addSeparator()
    .addItem("初回セットアップ", "setupForNewUser")
    .addSeparator()
    .addItem("ダッシュボード作成", "createDashboard")
    .addToUi();
}

/**
 * 従来のonOpenトリガー（後方互換性のため残す）
 * 子どもプロジェクトでも親と同じメニューを表示
 */
function onOpen() {
  createCustomMenu();
}

/**
 * メンバー登録関数（親プロジェクトから呼び出し）
 * 子どもプロジェクトでは親の機能を呼び出す
 */
function registerMember() {
  SpreadsheetApp.getUi().alert(
    "機能制限",
    "メンバー登録は親プロジェクトでのみ利用可能です。\n親のスプレッドシートから実行してください。",
    SpreadsheetApp.getUi().ButtonSet.OK
  );
}

/**
 * 2025年データ集計関数（親プロジェクトから呼び出し）
 * 子どもプロジェクトでは親の機能を呼び出す
 */
function aggregateData2025() {
  SpreadsheetApp.getUi().alert(
    "機能制限",
    "データ集計は親プロジェクトでのみ利用可能です。\n親のスプレッドシートから実行してください。",
    SpreadsheetApp.getUi().ButtonSet.OK
  );
}

/**
 * パスワードリセット関数（親プロジェクトから呼び出し）
 * 子どもプロジェクトでは親の機能を呼び出す
 */
function resetPassword() {
  SpreadsheetApp.getUi().alert(
    "機能制限",
    "パスワードリセットは親プロジェクトでのみ利用可能です。\n親のスプレッドシートから実行してください。",
    SpreadsheetApp.getUi().ButtonSet.OK
  );
}

/**
 * 初回セットアップ関数（親プロジェクトから呼び出し）
 * 子どもプロジェクトでは親の機能を呼び出す
 */
function setupForNewUser() {
  SpreadsheetApp.getUi().alert(
    "機能制限",
    "初回セットアップは親プロジェクトでのみ利用可能です。\n親のスプレッドシートから実行してください。",
    SpreadsheetApp.getUi().ButtonSet.OK
  );
}
