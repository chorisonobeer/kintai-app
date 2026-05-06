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

// version.jsonファイルのパス
const versionJsonPath = path.join(__dirname, '..', 'public', 'version.json');

// version.jsonの内容を作成
const versionData = {
  buildTime: buildTime,
  version: "1.0.0",
  lastUpdated: buildTime
};

// version.jsonファイルに書き込み
fs.writeFileSync(versionJsonPath, JSON.stringify(versionData, null, 2));

// sw.js の CACHE_NAME をビルドごとにバンプ
// buildTime から短いハッシュを作成 (例: "v26-04-17t08" + timestamp末尾5桁)
const ts = Date.parse(buildTime);
const cacheVersion = `${ts.toString(36).slice(-8)}`;
const newCacheName = `kintai-app-${cacheVersion}`;

const swJsPath = path.join(__dirname, '..', 'public', 'sw.js');
try {
  let swContent = fs.readFileSync(swJsPath, 'utf-8');
  const replaced = swContent.replace(
    /const CACHE_NAME = ['"][^'"]*['"]/,
    `const CACHE_NAME = '${newCacheName}'`,
  );
  if (replaced !== swContent) {
    fs.writeFileSync(swJsPath, replaced);
    console.log(`CACHE_NAME bumped to: ${newCacheName}`);
  } else {
    console.warn(`CACHE_NAME pattern not found in sw.js`);
  }
} catch (err) {
  console.error(`Failed to bump CACHE_NAME:`, err);
}

console.log(`Build time set to: ${buildTime}`);
console.log(`Environment file created at: ${envPath}`);
console.log(`Version JSON written to: ${versionJsonPath}`);
console.log(`Version data:`, versionData);