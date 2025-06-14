# 勤怠管理アプリ - セットアップ・運用ドキュメント

## 📋 目次

1. [開発環境構築](#開発環境構築)
2. [プロジェクト設定](#プロジェクト設定)
3. [デプロイメント](#デプロイメント)
4. [環境管理](#環境管理)
5. [監視・メンテナンス](#監視メンテナンス)
6. [トラブルシューティング](#トラブルシューティング)
7. [パフォーマンス最適化](#パフォーマンス最適化)

## 開発環境構築

### 必要な環境

#### システム要件

- **Node.js**: v18.0.0 以上
- **npm**: v8.0.0 以上（Node.jsに同梱）
- **Git**: v2.30.0 以上
- **ブラウザ**: Chrome 90+, Firefox 88+, Safari 14+, Edge 90+

#### 推奨開発環境

- **OS**: Windows 10/11, macOS 12+, Ubuntu 20.04+
- **エディタ**: Visual Studio Code
- **拡張機能**:
  - ES7+ React/Redux/React-Native snippets
  - TypeScript Importer
  - Prettier - Code formatter
  - ESLint
  - Auto Rename Tag
  - Bracket Pair Colorizer

### 初期セットアップ手順

#### 1. リポジトリのクローン

```bash
# HTTPSでクローン
git clone https://github.com/your-username/kintai-app.git
cd kintai-app

# または SSH でクローン
git clone git@github.com:your-username/kintai-app.git
cd kintai-app
```

#### 2. 依存関係のインストール

```bash
# パッケージのインストール
npm install

# インストール確認
npm list --depth=0
```

#### 3. 環境変数の設定

```bash
# 環境変数ファイルの作成
cp .env.example .env.local

# 必要な環境変数を設定
# .env.local ファイルを編集
```

#### 4. 開発サーバーの起動

```bash
# 開発サーバー起動
npm run dev

# ブラウザで http://localhost:5173 にアクセス
```

### 開発用スクリプト

```json
{
  "scripts": {
    "dev": "vite", // 開発サーバー起動
    "build": "tsc && vite build", // 本番ビルド
    "preview": "vite preview", // ビルド結果のプレビュー
    "lint": "eslint . --ext ts,tsx", // リント実行
    "lint:fix": "eslint src --ext .ts,.tsx --fix",
    "format": "prettier --write \"src/**/*.{ts,tsx,css}\"",
    "quality:check": "npx tsc --noEmit && npx eslint src --ext .ts,.tsx && npx prettier --check \"src/**/*.{ts,tsx,css}\" && npm run build"
  }
}
```

#### スクリプトの詳細

**開発関連**

- `npm run dev`: Vite開発サーバーを起動（HMR有効）
- `npm run preview`: ビルド結果をローカルでプレビュー

**ビルド関連**

- `npm run build`: TypeScriptコンパイル + Viteビルド
- `npm run quality:check`: 型チェック + リント + フォーマット + ビルドの一括実行

**コード品質**

- `npm run lint`: ESLintによる静的解析
- `npm run lint:fix`: 自動修正可能な問題を修正
- `npm run format`: Prettierによるコードフォーマット

## プロジェクト設定

### TypeScript設定

#### tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2020", // モダンブラウザ対応
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler", // Vite対応
    "jsx": "react-jsx", // React 17+ JSX Transform
    "strict": true, // 厳密な型チェック
    "noUnusedLocals": true, // 未使用変数の検出
    "noUnusedParameters": true, // 未使用パラメータの検出
    "noFallthroughCasesInSwitch": true
  },
  "include": ["src"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

### Vite設定

#### vite.config.ts

```typescript
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// バージョン更新プラグイン
function updateVersionPlugin() {
  return {
    name: "update-version",
    buildStart() {
      const buildTime = new Date().toISOString();
      // version.json と index.html を更新
    },
  };
}

export default defineConfig(({ command, mode }) => {
  const buildTime = new Date().toISOString();

  return {
    plugins: [react(), updateVersionPlugin()],
    define: {
      "import.meta.env.VITE_BUILD_TIME": JSON.stringify(buildTime),
    },
    build: {
      rollupOptions: {
        output: {
          // キャッシュバスティング用ハッシュ
          entryFileNames: "assets/[name].[hash].js",
          chunkFileNames: "assets/[name].[hash].js",
          assetFileNames: "assets/[name].[hash].[ext]",
        },
      },
    },
  };
});
```

### ESLint設定

#### 主要ルール

- **Airbnb設定**: 業界標準のコーディング規約
- **TypeScript対応**: 型安全性の確保
- **React Hooks**: フックの正しい使用
- **アクセシビリティ**: jsx-a11yプラグイン

### Prettier設定

```json
{
  "semi": true,
  "trailingComma": "es5",
  "singleQuote": true,
  "printWidth": 80,
  "tabWidth": 2,
  "useTabs": false
}
```

## デプロイメント

### Netlify設定

#### netlify.toml

```toml
[build]
  publish = "dist"              # ビルド出力ディレクトリ
  functions = "netlify/functions" # サーバーレス関数

[build.environment]
  VITE_GIT_COMMIT = "$COMMIT_REF"
  VITE_GIT_BRANCH = "$BRANCH"
  VITE_DEPLOY_URL = "$DEPLOY_URL"
  VITE_CONTEXT = "$CONTEXT"

# セキュリティヘッダー
[[headers]]
  for = "/index.html"
  [headers.values]
    Cache-Control = "no-cache, no-store, must-revalidate"
    X-Frame-Options = "DENY"
    X-Content-Type-Options = "nosniff"
    X-XSS-Protection = "1; mode=block"
    Content-Security-Policy = "default-src 'self'; script-src 'self' 'unsafe-inline'"
```

#### デプロイフロー

1. **自動デプロイ**

   ```bash
   # mainブランチへのプッシュで自動デプロイ
   git push origin main
   ```

2. **プレビューデプロイ**

   ```bash
   # プルリクエスト作成で自動プレビュー
   git checkout -b feature/new-feature
   git push origin feature/new-feature
   # GitHub でプルリクエスト作成
   ```

3. **手動デプロイ**

   ```bash
   # ローカルビルド
   npm run build

   # Netlify CLI でデプロイ
   npx netlify deploy --prod --dir=dist
   ```

### 環境別設定

#### 開発環境（Development）

- **URL**: http://localhost:5173
- **API**: 開発用GAS API
- **デバッグ**: 有効
- **ソースマップ**: 有効

#### ステージング環境（Preview）

- **URL**: https://deploy-preview-{PR番号}--kintai-app.netlify.app
- **API**: ステージング用GAS API
- **デバッグ**: 有効
- **ソースマップ**: 有効

#### 本番環境（Production）

- **URL**: https://kintai-app.netlify.app
- **API**: 本番用GAS API
- **デバッグ**: 無効
- **ソースマップ**: 無効

## 環境管理

### 環境変数

#### .env.local（開発用）

```bash
# API設定
VITE_API_BASE_URL=https://script.google.com/macros/s/YOUR_DEV_SCRIPT_ID/exec
VITE_ENVIRONMENT=development

# デバッグ設定
VITE_DEBUG_MODE=true
VITE_LOG_LEVEL=debug

# 機能フラグ
VITE_ENABLE_OFFLINE_MODE=true
VITE_ENABLE_BACKGROUND_SYNC=true
```

#### Netlify環境変数

```bash
# 本番環境
VITE_API_BASE_URL=https://script.google.com/macros/s/YOUR_PROD_SCRIPT_ID/exec
VITE_ENVIRONMENT=production
VITE_DEBUG_MODE=false

# ビルド時変数（Netlify自動設定）
VITE_GIT_COMMIT=$COMMIT_REF
VITE_GIT_BRANCH=$BRANCH
VITE_DEPLOY_URL=$DEPLOY_URL
```

### バージョン管理

#### 自動バージョン更新

```typescript
// vite.config.ts でビルド時に自動更新
const buildTime = new Date().toISOString()

// public/version.json
{
  "version": "1.0.0",
  "buildTime": "2025-01-20T10:00:00.000Z",
  "gitCommit": "abc123",
  "environment": "production"
}
```

## 監視・メンテナンス

### パフォーマンス監視

#### Core Web Vitals

```typescript
// src/utils/performance.ts
export const measureWebVitals = () => {
  // Largest Contentful Paint (LCP)
  new PerformanceObserver((list) => {
    const entries = list.getEntries();
    const lastEntry = entries[entries.length - 1];
    console.log("LCP:", lastEntry.startTime);
  }).observe({ entryTypes: ["largest-contentful-paint"] });

  // First Input Delay (FID)
  new PerformanceObserver((list) => {
    const entries = list.getEntries();
    entries.forEach((entry) => {
      console.log("FID:", entry.processingStart - entry.startTime);
    });
  }).observe({ entryTypes: ["first-input"] });

  // Cumulative Layout Shift (CLS)
  new PerformanceObserver((list) => {
    let clsValue = 0;
    list.getEntries().forEach((entry) => {
      if (!entry.hadRecentInput) {
        clsValue += entry.value;
      }
    });
    console.log("CLS:", clsValue);
  }).observe({ entryTypes: ["layout-shift"] });
};
```

#### エラー監視

```typescript
// src/utils/errorTracking.ts
window.addEventListener("error", (event) => {
  console.error("Global Error:", {
    message: event.message,
    filename: event.filename,
    lineno: event.lineno,
    colno: event.colno,
    error: event.error,
  });
});

window.addEventListener("unhandledrejection", (event) => {
  console.error("Unhandled Promise Rejection:", event.reason);
});
```

### ログ管理

#### 構造化ログ

```typescript
// src/utils/logger.ts
interface LogEntry {
  level: "debug" | "info" | "warn" | "error";
  message: string;
  timestamp: string;
  context?: Record<string, any>;
}

export const logger = {
  debug: (message: string, context?: Record<string, any>) => {
    if (import.meta.env.VITE_DEBUG_MODE === "true") {
      console.debug(createLogEntry("debug", message, context));
    }
  },
  info: (message: string, context?: Record<string, any>) => {
    console.info(createLogEntry("info", message, context));
  },
  warn: (message: string, context?: Record<string, any>) => {
    console.warn(createLogEntry("warn", message, context));
  },
  error: (message: string, context?: Record<string, any>) => {
    console.error(createLogEntry("error", message, context));
  },
};
```

### 定期メンテナンス

#### 依存関係の更新

```bash
# セキュリティ脆弱性チェック
npm audit

# 脆弱性の自動修正
npm audit fix

# 依存関係の更新確認
npm outdated

# 安全な更新
npm update

# メジャーバージョン更新（慎重に）
npm install package@latest
```

#### キャッシュクリア

```bash
# npm キャッシュクリア
npm cache clean --force

# node_modules 再インストール
rm -rf node_modules package-lock.json
npm install

# Vite キャッシュクリア
rm -rf .vite
```

## トラブルシューティング

### よくある問題と解決方法

#### 1. ビルドエラー

```bash
# TypeScript エラー
npm run lint
npx tsc --noEmit

# 依存関係の問題
rm -rf node_modules package-lock.json
npm install

# メモリ不足
node --max-old-space-size=4096 node_modules/.bin/vite build
```

#### 2. 開発サーバーの問題

```bash
# ポート競合
lsof -ti:5173 | xargs kill -9
npm run dev

# HMR が動作しない
rm -rf .vite
npm run dev
```

#### 3. デプロイエラー

```bash
# Netlify ビルドログ確認
netlify logs

# 環境変数確認
netlify env:list

# 手動デプロイテスト
npm run build
netlify deploy --dir=dist
```

### デバッグ手順

#### 1. ローカル環境

```typescript
// デバッグモード有効化
localStorage.setItem("debug", "true");

// React Developer Tools 使用
// Redux DevTools Extension 使用
```

#### 2. 本番環境

```typescript
// エラー情報収集
console.log("Version:", import.meta.env.VITE_BUILD_TIME);
console.log("Environment:", import.meta.env.VITE_ENVIRONMENT);
console.log("User Agent:", navigator.userAgent);
```

## パフォーマンス最適化

### ビルド最適化

#### バンドルサイズ分析

```bash
# バンドル分析
npm install --save-dev rollup-plugin-visualizer

# 分析レポート生成
npm run build
# dist/stats.html で確認
```

#### Tree Shaking

```typescript
// 名前付きインポートを使用
import { format } from "date-fns";

// デフォルトインポートは避ける
// import * as dateFns from 'date-fns' // ❌
```

#### Code Splitting

```typescript
// 動的インポート
const LazyComponent = React.lazy(() => import("./LazyComponent"));

// ルートベース分割
const MonthlyView = React.lazy(() => import("./components/MonthlyView"));
```

### ランタイム最適化

#### メモ化

```typescript
// React.memo
const ExpensiveComponent = React.memo(({ data }) => {
  return <div>{/* 重い処理 */}</div>
})

// useMemo
const expensiveValue = useMemo(() => {
  return heavyCalculation(data)
}, [data])

// useCallback
const memoizedCallback = useCallback(() => {
  doSomething(a, b)
}, [a, b])
```

### ネットワーク最適化

#### Service Worker

```typescript
// public/sw.js
self.addEventListener("fetch", (event) => {
  if (event.request.destination === "document") {
    event.respondWith(
      caches
        .match(event.request)
        .then((response) => response || fetch(event.request))
    );
  }
});
```

#### リソース最適化

```html
<!-- プリロード -->
<link
  rel="preload"
  href="/fonts/main.woff2"
  as="font"
  type="font/woff2"
  crossorigin
/>

<!-- プリフェッチ -->
<link rel="prefetch" href="/api/data" />

<!-- DNS プリフェッチ -->
<link rel="dns-prefetch" href="//fonts.googleapis.com" />
```

---

**最終更新**: 2025年1月
**バージョン**: 1.0.0
**作成者**: 勤怠管理アプリ開発チーム
