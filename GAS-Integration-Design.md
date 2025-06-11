# GAS統合設計書

## 概要

現在、複数のGASファイルに`doGet`と`doPost`関数が重複して存在し、予期しない動作を引き起こす可能性があります。この設計書では、各ファイルの機能を分析し、統合後の設計を定義します。

## 現在のファイル構成と機能分析

### 1. MasterConfig.gs

**主要機能**: 顧客管理・マスターデータ管理

- `testSimpleSpreadsheetAccess()` - スプレッドシート読み取りテスト
- `getServerNames()` - D列のサーバー名データ抽出
- `findCustomerByCode(customerCode)` - 顧客コード検索
- `getSpreadsheetIdByServerName(serverName)` - サーバー名からスプレッドシートID取得
- 顧客情報の新規登録・更新機能
- マスタースプレッドシートの初期化機能

**対象スプレッドシート**: `1If92tWrQIsOy6y-W6838w7mdJJHGxL0_P6GgwIVo3A8`（マスター顧客管理）

### 2. Code.gs

**主要機能**: メイン勤怠管理システム

- 認証機能（Auth.handleLogin/handleLogout）
- 勤怠データ保存（Kintai.handleSaveKintai）
- 月次データ取得（Kintai.handleGetMonthlyData）
- バージョン管理機能
- 顧客管理機能の呼び出し（MasterConfig経由）

**対象**: 動的に決定されるスプレッドシート（顧客ごと）

### 3. Code_Child.gs

**主要機能**: 子プロジェクト用勤怠管理

- 子プロジェクト専用認証（Auth_Child）
- 現在のスプレッドシートへの勤怠データ保存
- 現在のスプレッドシートからの月次データ取得
- 簡易バージョン管理

**対象**: 現在アクティブなスプレッドシート

## 統合設計

### アーキテクチャ方針

1. **単一エントリーポイント**: `doGet`と`doPost`は各1つのみ
2. **プロジェクトタイプ判定**: リクエストパラメータでプロジェクトタイプを識別
3. **機能モジュール分離**: 各機能は独立したモジュールとして維持
4. **設定駆動**: プロジェクトタイプごとの設定を外部化

### 統合後のファイル構成

```
GAS/
├── MainEntry.gs          # 統合エントリーポイント（doGet/doPost）
├── Auth.gs              # メイン認証モジュール（既存）
├── Auth_Child.gs        # 子プロジェクト認証モジュール（既存）
├── Kintai.gs           # 勤怠管理モジュール（既存）
├── MasterConfig.gs     # 顧客管理モジュール（機能のみ、doGet/doPost削除）
├── Utils.gs            # ユーティリティ（既存）
├── Dashboard.gs        # ダッシュボード機能（既存）
└── Config.gs           # 統合設定管理（新規）
```

### MainEntry.gs 設計

#### doGet関数

```javascript
function doGet(e) {
  const action = e.parameter.action || "health";
  const projectType = determineProjectType(e.parameter);

  switch (action) {
    case "health":
      return createHealthResponse(projectType);
    case "testAccess":
      return handleTestAccess(projectType);
    case "version":
      return getVersionInfo(projectType);
    default:
      return createErrorResponse("無効なアクションです");
  }
}
```

#### doPost関数

```javascript
function doPost(e) {
  try {
    // 1. リクエスト解析
    const requestData = parseRequestBody(e);
    const action = requestData.action;
    const projectType = determineProjectType(requestData);

    // 2. 診断情報作成
    const diagInfo = createDiagInfo(e, requestData, projectType);

    // 3. アクション振り分け
    switch (action) {
      // 認証系
      case "login":
        return handleLogin(requestData, projectType, diagInfo);
      case "logout":
        return handleLogout(requestData, projectType, diagInfo);

      // 勤怠系
      case "saveKintai":
        return handleSaveKintai(requestData, projectType, diagInfo);
      case "getMonthlyData":
        return handleGetMonthlyData(requestData, projectType, diagInfo);

      // 顧客管理系（メインプロジェクトのみ）
      case "findCustomerByCode":
        return handleFindCustomerByCode(requestData, projectType, diagInfo);
      case "registerNewCustomer":
        return handleRegisterNewCustomer(requestData, projectType, diagInfo);
      case "updateCustomerSpreadsheet":
        return handleUpdateCustomerSpreadsheet(
          requestData,
          projectType,
          diagInfo
        );
      case "initializeMasterSpreadsheet":
        return handleInitializeMasterSpreadsheet(
          requestData,
          projectType,
          diagInfo
        );

      // システム系
      case "getVersion":
        return handleGetVersion(requestData, projectType, diagInfo);
      case "getVersionHistory":
        return handleGetVersionHistory(requestData, projectType, diagInfo);

      default:
        return createErrorResponse("未対応のアクション: " + action, diagInfo);
    }
  } catch (error) {
    return handleGlobalError(error, requestData);
  }
}
```

### プロジェクトタイプ判定ロジック

```javascript
function determineProjectType(requestData) {
  // 1. 明示的なプロジェクトタイプ指定
  if (requestData.projectType) {
    return requestData.projectType;
  }

  // 2. 子プロジェクト判定条件
  if (
    requestData.childProject ||
    requestData.useActiveSpreadsheet ||
    requestData.spreadsheetId
  ) {
    return "child";
  }

  // 3. 顧客管理系アクション判定
  const masterActions = [
    "findCustomerByCode",
    "registerNewCustomer",
    "updateCustomerSpreadsheet",
    "initializeMasterSpreadsheet",
  ];
  if (masterActions.includes(requestData.action)) {
    return "master";
  }

  // 4. デフォルトはメインプロジェクト
  return "main";
}
```

### Config.gs 設計

```javascript
const PROJECT_CONFIG = {
  main: {
    version: "v10-version-management",
    authModule: "Auth",
    kintaiModule: "Kintai",
    supportedActions: [
      "login",
      "logout",
      "saveKintai",
      "getMonthlyData",
      "findCustomerByCode",
      "registerNewCustomer",
      "updateCustomerSpreadsheet",
      "initializeMasterSpreadsheet",
      "getVersion",
      "getVersionHistory",
    ],
  },
  child: {
    version: "v1-child-auth",
    authModule: "Auth_Child",
    kintaiModule: "ChildKintai",
    supportedActions: [
      "login",
      "logout",
      "saveKintai",
      "getMonthlyData",
      "getVersion",
    ],
  },
  master: {
    version: "v1-master-config",
    authModule: null,
    supportedActions: [
      "testAccess",
      "findCustomerByCode",
      "registerNewCustomer",
      "updateCustomerSpreadsheet",
      "initializeMasterSpreadsheet",
    ],
  },
};
```

### アクションハンドラー設計

各アクションハンドラーは以下の形式で統一：

```javascript
function handleLogin(requestData, projectType, diagInfo) {
  const config = PROJECT_CONFIG[projectType];

  // プロジェクトタイプ対応チェック
  if (!config.supportedActions.includes("login")) {
    return createErrorResponse(
      `${projectType}プロジェクトではloginアクションはサポートされていません`,
      diagInfo
    );
  }

  // 適切な認証モジュールを呼び出し
  switch (projectType) {
    case "main":
      return Auth.handleLogin(requestData.payload, requestData.debug, diagInfo);
    case "child":
      return Auth_Child.handleLogin(
        requestData.payload,
        requestData.debug,
        diagInfo
      );
    default:
      return createErrorResponse("認証が必要なアクションです", diagInfo);
  }
}
```

## 移行手順

### Phase 1: 準備

1. `Config.gs`ファイルの作成
2. `MainEntry.gs`ファイルの作成
3. 既存ファイルのバックアップ

### Phase 2: 機能移行

1. `MasterConfig.gs`から`doGet`/`doPost`関数を削除
2. `Code.gs`から`doGet`/`doPost`関数を削除
3. `Code_Child.gs`から`doGet`/`doPost`関数を削除
4. 各機能を`MainEntry.gs`に統合

### Phase 3: テスト

1. 各プロジェクトタイプでの動作確認
2. 既存機能の互換性確認
3. エラーハンドリングの確認

### Phase 4: デプロイ

1. GASプロジェクトの再デプロイ
2. Netlify関数の新URL設定
3. 本番環境での動作確認

## リスク管理

### 潜在的リスク

1. **機能の欠落**: 移行時に一部機能が漏れる可能性
2. **互換性の破綻**: 既存のAPIコールが動作しなくなる可能性
3. **パフォーマンス低下**: 統合により処理が重くなる可能性

### 対策

1. **段階的移行**: 機能ごとに段階的に移行
2. **テスト強化**: 各プロジェクトタイプでの包括的テスト
3. **ロールバック計画**: 問題発生時の迅速な復旧手順

## 期待される効果

1. **保守性向上**: 単一エントリーポイントによる管理の簡素化
2. **デバッグ効率化**: 統一されたログとエラーハンドリング
3. **機能拡張の容易さ**: 新しいプロジェクトタイプの追加が簡単
4. **予期しない動作の排除**: 関数重複による問題の解決

## 結論

この統合設計により、現在の機能を維持しながら、より保守しやすく拡張可能なアーキテクチャを実現できます。各プロジェクトタイプの特性を尊重しつつ、統一されたインターフェースを提供することで、開発効率と品質の向上が期待されます。
