// scripts/set-build-time.js
// ビルド時に現在時刻を環境変数として設定するスクリプト

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// ESモジュールで__dirnameを取得
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 現在時刻をISO形式で取得
const buildTime = new Date().toISOString();

// .env.buildファイルに書き込み
const envContent = `VITE_BUILD_TIME=${buildTime}\n`;
const envPath = path.join(__dirname, '..', '.env.build');

fs.writeFileSync(envPath, envContent);
console.log(`Build time set to: ${buildTime}`);
console.log(`Environment file created at: ${envPath}`);