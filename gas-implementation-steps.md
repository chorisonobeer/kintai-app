# GAS側バージョン情報実装手順

## 📋 実装手順

### 1. Google Apps Script エディタを開く

1. [Google Apps Script](https://script.google.com/) にアクセス
2. 既存の勤怠管理プロジェクトを開く
3. `kintai.gs` ファイル（またはメインスクリプトファイル）を開く

### 2. バージョン関数を追加

`gas-version-functions.gs` ファイルの内容を既存のGASスクリプトに追加：

#### 追加する関数：

- `handleGetVersion(payload)` - バージョン情報取得
- `handleGetVersionHistory(payload)` - バージョン履歴取得

### 3. doPost関数を更新

既存の `doPost` 関数の `switch` 文に以下のケースを追加：

```javascript
// 新規追加
case 'getVersion':
  return handleGetVersion(payload);
case 'getVersionHistory':
  return handleGetVersionHistory(payload);
```

### 4. デプロイ

1. **保存**: Ctrl+S でスクリプトを保存
2. **新しいデプロイ**:
   - 「デプロイ」→「新しいデプロイ」をクリック
   - 種類：「ウェブアプリ」を選択
   - 説明：「バージョン情報機能追加 v1.2.0」
   - 実行者：「自分」
   - アクセスできるユーザー：「全員」
   - **「デプロイ」をクリック**

### 5. 動作確認

1. 勤怠アプリを開く
2. ヘッダー部分を長押し
3. バージョン情報モーダルが表示されることを確認
4. サーバーバージョンが「v1.2.0」と表示されることを確認

## 🔧 カスタマイズ

### バージョン番号の更新

`handleGetVersion` 関数内の以下の部分を更新：

```javascript
const versionInfo = {
  version: "v1.2.0", // ← ここを更新
  timestamp: new Date().toISOString(),
  description: "勤怠管理システム - 安定版", // ← 必要に応じて更新
  features: [
    // ← 機能リストを更新
  ],
};
```

### バージョン履歴の追加

`handleGetVersionHistory` 関数内の `versionHistory` 配列に新しいバージョン情報を追加：

```javascript
const versionHistory = [
  {
    version: "v1.3.0", // 新しいバージョン
    date: "2025-01-20",
    description: "新機能追加",
    changes: ["新機能1", "新機能2"],
  },
  // 既存のバージョン履歴...
];
```

## ⚠️ 注意事項

1. **認証**: 現在の実装では `validateToken` を使用しています。認証が不要な場合は該当部分をコメントアウトしてください。

2. **エラーハンドリング**: `createErrorResponse` と `createSuccessResponse` 関数が既存のスクリプトに存在することを確認してください。

3. **デプロイ**: 新しい機能を追加した場合は、必ず新しいバージョンとしてデプロイしてください。

4. **テスト**: デプロイ後は必ず動作確認を行ってください。

## 🚀 完了後の状態

- ✅ ヘッダーのバージョン情報が正常に表示される
- ✅ サーバーバージョン: v1.2.0
- ✅ アプリバージョン: 1.0.0
- ✅ バージョン互換性チェック機能
- ✅ バージョン履歴表示機能
