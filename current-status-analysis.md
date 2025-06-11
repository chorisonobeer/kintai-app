# 勤怠管理アプリ - 現状分析レポート

## 🎯 **真の問題とゴール**

### **最終ゴール（最重要）**
**Join機能でサーバー名を入力したら正常なレスポンスが返ってきてJoinできるようになること**

### **現在の真の問題**
1. **Join機能が最終的にエラーになって改善できていない** ← **これが本当の問題**
2. Join画面でサーバー名を入力しても正常に動作しない
3. ユーザーが実際にJoin機能を使えない状態

---

## 📊 現在の状況

### ✅ 動作している要素
- **開発サーバー**: nodemon使用、ポート5174で稼働中
- **ブラウザプレビュー**: 起動済み
- **基本的なアプリ表示**: 可能

### ❌ 動作していない要素
- **Join機能**: サーバー名入力後のレスポンスでエラー
- **Master Config API連携**: Join機能からの呼び出しが失敗
- **APIテストスクリプト**: `test-api.ps1`でエラー（副次的問題）

### 環境設定
```
# .env.local の設定内容
VITE_KINTAI_API_URL=https://script.google.com/macros/s/AKfycbxPMNkuofB1CMjD872rhc6XomIckDxCjd0mYxn-szgQP2AIxkb7v5IC-qxx4P5dEK_x/exec
VITE_MASTER_CONFIG_API_URL=https://script.google.com/macros/s/AKfycbxPMNkuofB1CMjD872rhc6XomIckDxCjd0mYxn-szgQP2AIxkb7v5IC-qxx4P5dEK_x/exec
VITE_KINTAI_PROXY_PATH=/api/kintai
VITE_MASTER_CONFIG_PROXY_PATH=/api/master-config
```

### プロキシ設定 (vite.config.ts)
```typescript
server: {
  proxy: {
    '/api/kintai': {
      target: process.env.VITE_KINTAI_API_URL,
      changeOrigin: true,
      rewrite: (path) => '',
      configure: (proxy, options) => {
        proxy.on('proxyReq', (proxyReq, req, res) => {
          proxyReq.setHeader('Origin', `http://localhost:${process.env.PORT || 5173}`);
        });
        proxy.on('proxyRes', (proxyRes, req, res) => {
          proxyRes.headers['Access-Control-Allow-Origin'] = '*';
          proxyRes.headers['Access-Control-Allow-Methods'] = 'GET,PUT,POST,DELETE,OPTIONS';
          proxyRes.headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization, Content-Length, X-Requested-With';
        });
      }
    },
    '/api/master-config': {
      target: process.env.VITE_MASTER_CONFIG_API_URL,
      changeOrigin: true,
      rewrite: (path) => '',
      configure: (proxy, options) => {
        proxy.on('proxyReq', (proxyReq, req, res) => {
          proxyReq.setHeader('Origin', `http://localhost:${process.env.PORT || 5173}`);
        });
        proxy.on('proxyRes', (proxyRes, req, res) => {
          proxyRes.headers['Access-Control-Allow-Origin'] = '*';
          proxyRes.headers['Access-Control-Allow-Methods'] = 'GET,PUT,POST,DELETE,OPTIONS';
          proxyRes.headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization, Content-Length, X-Requested-With';
        });
      }
    }
  }
}
```

## ❌ 現在の問題点

### 1. APIテストの失敗
- **問題**: PowerShellスクリプト `test-api.ps1` でAPIテストが失敗
- **エラー内容**: 
  ```
  エラー: パラメーター 'Uri の引数を確認できません。引数が null または空です。
  ```
- **原因**: スクリプト内の変数設定に問題がある可能性

### 2. 開発サーバーの不安定性（解決済み）
- **以前の問題**: 開発サーバーが予期せず停止
- **解決策**: nodemonによる自動再起動機能を実装
- **現状**: 安定稼働中

### 3. Join機能の動作確認未完了
- **問題**: Join機能（顧客情報管理）の実際の動作テストが未実施
- **影響**: Master Config APIとの連携が正常に動作するか不明

## 🎯 ゴール（達成すべき状態）

### 短期目標（即座に達成すべき）
1. **APIテストの正常化**
   - PowerShellスクリプトでMaster Config APIへの接続成功
   - 正常なレスポンスの取得確認

2. **Join機能の動作確認**
   - ブラウザでJoin機能をテスト
   - 顧客コード検索の正常動作確認
   - エラーハンドリングの確認

### 中期目標（今後の開発で達成すべき）
1. **完全なAPI連携**
   - 勤怠管理API（kintai）との連携確認
   - Master Config API（顧客情報）との連携確認
   - エラーハンドリングの強化

2. **品質保証**
   - TypeScriptエラーゼロ
   - ESLint警告ゼロ
   - Prettierフォーマット適用
   - ビルド成功

3. **テスト環境の整備**
   - 単体テストの実装
   - E2Eテストの実装
   - テストカバレッジ80%以上

### 長期目標（プロジェクト完成時）
1. **本番環境デプロイ**
   - Netlify Functionsでの正常動作
   - CORS設定の最適化
   - セキュリティ対策の実装

2. **ユーザビリティ向上**
   - レスポンシブデザインの完成
   - アクセシビリティ対応
   - PWA機能の実装

## 🔧 Join機能の詳細技術仕様

### **Join機能とは**
勤怠管理アプリで、ユーザーが所属する会社・組織のサーバー（Google スプレッドシート）に接続するための機能です。

### **Join機能の完全なフロー**

#### 1. ユーザー操作
- ユーザーがJoin画面（`src/components/Join.tsx`）でサーバー名を入力
- 例: "company-server-01" のような識別子を入力
- 「サーバーを検索」ボタンをクリック

#### 2. フロントエンド処理（Join.tsx）
```typescript
// Join.tsxの主要な処理
const handleSubmit = async (e: React.FormEvent) => {
  // サーバー名をfindCustomerByCode()に渡す
  const result = await findCustomerByCode(serverName.trim());
  
  if (result.success && result.data) {
    // 成功時: サーバー情報をローカルストレージに保存
    localStorage.setItem("kintai_server_info", JSON.stringify(result.data));
    onJoinSuccess(result.data); // 親コンポーネントに通知
  } else {
    // 失敗時: エラーメッセージを表示
    setError(result.error || "サーバーが見つかりませんでした");
  }
};
```

#### 3. API呼び出し（apiService.ts）
```typescript
// findCustomerByCode関数の処理
export const findCustomerByCode = async (customerCode: string) => {
  // 開発環境: プロキシ経由でMaster Config APIを呼び出し
  // 本番環境: 直接GAS URLを呼び出し
  const apiUrl = isDevelopment ? "/api/master-config" : "GAS_URL";
  
  const response = await fetch(apiUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "findCustomerByCode",
      customerCode: customerCode.trim()
    })
  });
};
```

#### 4. Netlify Functions（master-config-api.cjs）
```javascript
// 開発環境でのプロキシ処理
exports.handler = async (event, context) => {
  // フロントエンドからのリクエストを受信
  // GAS（Google Apps Script）にリクエストを転送
  const response = await makeHttpsRequest(MASTER_CONFIG_GAS_API_URL, {
    method: 'POST',
    body: event.body // フロントエンドからのデータをそのまま転送
  });
};
```

#### 5. Google Apps Script（MasterConfig.gs）
```javascript
// GAS側での顧客検索処理
function findCustomerByCode(customerCode) {
  // Googleスプレッドシートから顧客情報を検索
  // D列: サーバー名（顧客コード）
  // E列: スプレッドシートID
  
  // 一致するサーバー名を見つけた場合
  return {
    success: true,
    data: {
      customerCode: "company-server-01",
      serverName: "company-server-01", 
      spreadsheetId: "1If92tWrQIsOy6y-W6838w7mdJJHGxL0_P6GgwIVo3A8"
    }
  };
}
```

#### 6. レスポンス処理
- GAS → Netlify Functions → フロントエンド の順でレスポンスが返る
- 成功時: `CustomerInfo`オブジェクトが返される
- 失敗時: エラーメッセージが返される

### **データ構造**

#### CustomerInfo型
```typescript
interface CustomerInfo {
  customerCode: string;    // 顧客コード（サーバー名）
  serverName: string;      // サーバー名
  spreadsheetId: string;   // GoogleスプレッドシートのID
}
```

#### APIレスポンス型
```typescript
// 成功時
interface ApiOk<T> {
  success: true;
  data: T;
}

// 失敗時
interface ApiErr {
  success: false;
  error: string;
}
```

### **現在のエラーポイント（推定）**

#### 1. プロキシ設定の問題
- 開発環境で`/api/master-config`へのプロキシが正しく動作していない
- `vite.config.ts`のプロキシ設定とNetlify Functionsの連携エラー

#### 2. GAS APIの応答エラー
- MasterConfig.gsからの応答が期待した形式でない
- スプレッドシートアクセス権限の問題
- GAS URLの設定ミス

#### 3. CORS（Cross-Origin Resource Sharing）エラー
- ブラウザがGASへの直接アクセスをブロック
- Netlify Functionsのヘッダー設定不備

#### 4. JSON解析エラー
- GASからHTMLレスポンスが返ってくる（エラーページなど）
- 期待したJSONではない形式のレスポンス

### **デバッグ機能**
Join.tsxには詳細なデバッグ機能が実装されています：

```typescript
// デバッグモードの有効化
localStorage.setItem("kintai_debug_mode", "true");

// デバッグ情報の表示
- リクエスト内容
- レスポンス内容  
- エラー詳細
- 実行時間
```

---

## 🔧 技術的詳細

### ファイル構成
```
c:\Users\tsuma\kintai-app\
├── src/
│   ├── components/
│   │   ├── Join.tsx          # 顧客情報管理コンポーネント
│   │   ├── KintaiForm.tsx    # 勤怠入力フォーム
│   │   └── ...
│   ├── utils/
│   │   ├── apiService.ts     # API通信ユーティリティ
│   │   └── ...
│   └── ...
├── GAS/
│   ├── MasterJoin/
│   │   └── MasterConfig.gs   # 顧客情報管理GAS
│   └── Kintai/
│       └── ...               # 勤怠管理GAS
├── netlify/
│   └── functions/
│       ├── master-config-api.cjs  # Master Config API
│       └── kintai-api.cjs         # 勤怠管理API
└── test-api.ps1              # APIテストスクリプト
```

### 依存関係
- **フロントエンド**: React 18 + TypeScript + Vite
- **バックエンド**: Google Apps Script
- **プロキシ**: Vite dev server proxy
- **デプロイ**: Netlify Functions
- **開発ツール**: nodemon, ESLint, Prettier

## 📋 次のアクション項目

### 優先度: 高
1. `test-api.ps1` スクリプトの修正
2. Master Config APIの接続テスト実行
3. Join機能のブラウザテスト

### 優先度: 中
1. TypeScript型チェック実行
2. ESLint/Prettierチェック実行
3. ビルドテスト実行

### 優先度: 低
1. テストコードの作成
2. ドキュメントの更新
3. CI/CD設定の検討

## 🚨 注意事項

1. **環境変数**: `.env.local` ファイルには実際のGAS URLが含まれているため、セキュリティに注意
2. **CORS設定**: 開発環境とプロダクション環境でCORS設定が異なる可能性
3. **PowerShell実行ポリシー**: スクリプト実行時は `-ExecutionPolicy Bypass` が必要
4. **ポート競合**: 開発サーバーは5173が使用中の場合5174で起動

---

**作成日時**: 2025年1月現在  
**ステータス**: 開発中  
**最終更新**: APIテスト環境構築完了、Join機能テスト待ち