# 環境変数設定ガイド

## 概要

このプロジェクトでは、GAS（Google Apps Script）のAPIエンドポイントを環境変数で管理しています。

## 修正内容

### 1. Netlify Functions の修正

**修正前:**
```javascript
const GAS_API_URL = "https://script.google.com/macros/s/AKfycby4UPAul1WJ1KeHxCgzWaK8paqhGfEwy2UDuujoAmSZr7CVYy-qo2gBjk8cersds25_xQ/exec";
```

**修正後:**
```javascript
const GAS_API_URL = process.env.VITE_GAS_API_URL ||
  "https://script.google.com/macros/s/AKfycby4UPAul1WJ1KeHxCgzWaK8paqhGfEwy2UDuujoAmSZr7CVYy-qo2gBjk8cersds25_xQ/exec";
```

### 2. 環境変数ファイルの追加

- `.env.local` - 開発環境用（既存）
- `.env.production` - 本番環境用（新規作成）

### 3. Netlify設定の更新

`netlify.toml`に環境変数設定を追加しました。

## 環境変数一覧

| 変数名 | 説明 | 用途 |
|--------|------|------|
| `VITE_GAS_API_URL` | 勤怠管理用GAS API URL | メイン機能 |
| `VITE_MASTER_CONFIG_API_URL` | 顧客情報管理用GAS API URL | マスター設定 |
| `VITE_DEV_PROXY_PATH` | 開発環境プロキシパス | 開発時のみ |
| `VITE_DEV_MASTER_CONFIG_PROXY_PATH` | マスター設定プロキシパス | 開発時のみ |

## 設定方法

### 開発環境

1. `.env.local`ファイルが既に設定済みです
2. `npm run dev`で開発サーバーを起動

### 本番環境（Netlify）

#### 方法1: Netlify管理画面での設定

1. Netlifyダッシュボードにログイン
2. サイト設定 → Environment variables
3. 以下の環境変数を追加:
   - `VITE_GAS_API_URL`
   - `VITE_MASTER_CONFIG_API_URL`
   - `VITE_DEV_PROXY_PATH`
   - `VITE_DEV_MASTER_CONFIG_PROXY_PATH`

#### 方法2: netlify.toml（既に設定済み）

`netlify.toml`の`[build.environment]`セクションに設定済みです。

## トラブルシューティング

### CORSエラーが発生する場合

1. 環境変数が正しく設定されているか確認
2. GAS側のデプロイメントIDが正しいか確認
3. Netlify Functionsが正しく動作しているか確認

### 環境変数が読み込まれない場合

1. ファイル名が正しいか確認（`.env.local`, `.env.production`）
2. Netlifyの環境変数設定を確認
3. ビルドログで環境変数が読み込まれているか確認

## 注意事項

- 環境変数ファイル（`.env.*`）はGitにコミットしないでください
- 本番環境のAPIキーは必ずNetlify管理画面で設定してください
- GASのデプロイメントIDが変更された場合は、環境変数も更新してください