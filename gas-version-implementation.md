# GAS側バージョン情報実装ガイド

## 概要

ヘッダーのバージョン情報が空白になっている問題は、GAS側で`getVersion`アクションが実装されていないことが原因です。

## 必要な実装

### 1. GASスクリプト（kintai.gs）に追加する関数

```javascript
/**
 * バージョン情報を取得
 */
function handleGetVersion(payload) {
  try {
    // トークン検証（必要に応じて）
    const tokenValidation = validateToken(payload.token);
    if (!tokenValidation.isValid) {
      return createErrorResponse('INVALID_TOKEN', tokenValidation.message);
    }

    // バージョン情報を返す
    const versionInfo = {
      version: "v1.2.0", // サーバーバージョン
      timestamp: new Date().toISOString(),
      description: "勤怠管理システム - 安定版",
      features: [
        "勤怠データ登録・取得",
        "月次データ表示",
        "認証機能",
        "バージョン管理"
      ]
    };

    return createSuccessResponse(versionInfo);
  } catch (error) {
    console.error('バージョン情報取得エラー:', error);
    return createErrorResponse('VERSION_ERROR', 'バージョン情報の取得に失敗しました');
  }
}

/**
 * バージョン履歴を取得
 */
function handleGetVersionHistory(payload) {
  try {
    // トークン検証（必要に応じて）
    const tokenValidation = validateToken(payload.token);
    if (!tokenValidation.isValid) {
      return createErrorResponse('INVALID_TOKEN', tokenValidation.message);
    }

    // バージョン履歴を返す
    const versionHistory = [
      {
        version: "v1.2.0",
        date: "2025-01-13",
        description: "バージョン情報機能追加",
        changes: [
          "ヘッダーバージョン表示機能追加",
          "認証強化",
          "データ整合性チェック改善"
        ]
      },
      {
        version: "v1.1.0",
        date: "2025-01-10",
        description: "認証機能強化",
        changes: [
          "ログイン時のデータクリア機能",
          "認証チェック強化",
          "スマートフォン対応改善"
        ]
      },
      {
        version: "v1.0.0",
        date: "2025-01-01",
        description: "初期リリース",
        changes: [
          "基本的な勤怠管理機能",
          "月次データ表示",
          "ユーザー認証"
        ]
      }
    ];

    return createSuccessResponse(versionHistory);
  } catch (error) {
    console.error('バージョン履歴取得エラー:', error);
    return createErrorResponse('VERSION_HISTORY_ERROR', 'バージョン履歴の取得に失敗しました');
  }
}
```

### 2. メインのdoPost関数に追加

既存のdoPost関数内のswitch文に以下のケースを追加：

```javascript
function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents);
    const action = payload.action;

    switch (action) {
      // 既存のケース...
      case 'login':
        return handleLogin(payload);
      case 'saveKintai':
        return handleSaveKintai(payload);
      case 'getKintaiHistory':
        return handleGetKintaiHistory(payload);
      case 'getMonthlyData':
        return handleGetMonthlyData(payload);
      
      // 新規追加
      case 'getVersion':
        return handleGetVersion(payload);
      case 'getVersionHistory':
        return handleGetVersionHistory(payload);
      
      default:
        return createErrorResponse('INVALID_ACTION', '無効なアクションです');
    }
  } catch (error) {
    console.error('doPost エラー:', error);
    return createErrorResponse('SERVER_ERROR', 'サーバーエラーが発生しました');
  }
}
```

## 実装後の動作

1. **ヘッダー長押し**: バージョン情報モーダルが表示される
2. **サーバーバージョン**: GASから取得した実際のバージョン情報
3. **クライアントバージョン**: 1.0.0（package.jsonベース）
4. **互換性チェック**: サーバーとクライアントのバージョン互換性を確認

## 注意事項

- GASスクリプトを更新後、必ず新しいバージョンとしてデプロイしてください
- バージョン番号は適切に管理し、機能追加時に更新してください
- 認証が必要な場合は、トークン検証を有効にしてください