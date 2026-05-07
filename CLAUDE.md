# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## プロジェクト概要

勤怠管理PWAアプリ。モバイルファーストのSPAで、日次の勤怠入力と月次の一覧表示を提供する。

## 開発コマンド

```bash
npm run dev          # Vite (5173) + netlify functions:serve (8888) を concurrently で同時起動
npm run dev:vite     # Vite 単体 (port 5173) — Functions 不要時
npm run dev:fn       # netlify functions:serve 単体 (port 8888)
npm run build        # TypeScriptチェック + Viteビルド (dist/へ出力)
npm run lint         # ESLint実行
npm run lint:fix     # ESLint自動修正
npm run format       # Prettier + ESLint自動整形
npm run quality:check # tsc + eslint + prettier + build の一括チェック
```

ローカル開発は **`npm run dev` のみ** で完結する（`netlify dev` は使わない — フレームワーク検査タイムアウトの再発防止）。
Vite proxy が `/.netlify/functions/*` を `localhost:8888` (functions:serve) に流すので、ブラウザからは http://localhost:5173 一本でアクセスする。
`predev` フックで起動前に 5173/8888 の orphan を自動 kill する。

## アーキテクチャ

### データフロー

```
ブラウザ(React SPA)
  ├─ 本番: → Netlify Functions (kintai-api.cjs) → Google Apps Script → Google Sheets
  └─ 開発: → Vite proxy (/api/gas) → Google Apps Script → Google Sheets
```

- **フロントエンド**: React 18 + TypeScript + Vite。styled-components + CSS。react-router-dom v7でルーティング
- **APIプロキシ**: `netlify/functions/kintai-api.cjs` — CORS処理・リトライ・タイムアウトを担当するNetlify Function (CommonJS)
- **バックエンド**: `GAS/` 配下のGoogle Apps Script — Google Sheetsを直接読み書き。認証(Auth.gs)、勤怠CRUD(kintai.gs)、ユーティリティ(Utils.gs)

### ルーティングと画面構成

- `/login` — ログイン画面 (`Login.tsx`)
- `/` — 日次勤怠入力 (`KintaiForm.tsx`) ※認証必須
- `/monthly` — 月次一覧 (`MonthlyView.tsx`) ※認証必須

認証はlocalStorageベースのトークン管理（`apiService.ts`内の`TOKEN_KEY`等）。

### 主要モジュール

- `contexts/KintaiContext.tsx` — 月間データ・入力状態の共有コンテキスト。入力判定ロジックの新旧並行運用中
- `utils/apiService.ts` — API通信の中核。login/logout/saveKintai/getHistory/getMonthlyData等
- `utils/backgroundSync.ts` — Service Workerと連携したバックグラウンド同期
- `utils/entryStatusManager.ts` — 日付ごとの入力済み判定キャッシュ管理
- `types/unified.ts` — 統一データ型定義（TimeString, DateString, UnifiedKintaiData等）

### PWA

Service Worker (`public/sw.js`) でキャッシュ管理・バージョン更新検知・バックグラウンド同期を実装。ビルド時に`version.json`と`index.html`にビルドタイムスタンプを埋め込む。

## 注意点

- 時刻は全て`HH:mm`形式の文字列、日付は`YYYY-MM-DD`形式で統一（`types/unified.ts`参照）
- 休憩時間も`HH:mm`形式（`"00:00"`=休憩なし）。数値(分)ではない
- `vite.config.ts`にGAS APIのURLがハードコードされている（プロキシ設定）
- Netlify Functionは`.cjs`拡張子（CommonJS）。フロントはESM
- モバイルUIにドラムピッカー（`drumtimepicker.tsx`, `MobileTimePicker.tsx`等）を使用。長押しで編集モード切替
- テストフレームワーク未導入。`src/test/`に手動テストスクリプトのみ存在
