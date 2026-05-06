/**
 * scripts/verify-sa-access.mjs
 * 2026-05-06
 * Phase 1 Step 7 検証スクリプト
 *
 * 目的:
 *   Service Account JSON 鍵で Google Sheets API を叩き、
 *   メンバーリスト Sheet を読めるか確認する。
 *
 * 使い方:
 *   .env.local に以下 4 個を設定（Netlify UI と同じ値）:
 *     GOOGLE_SA_CLIENT_EMAIL
 *     GOOGLE_SA_PRIVATE_KEY      ← "-----BEGIN ... \n ... \n-----END ... \n" の文字列
 *     MEMBER_SHEET_ID
 *     MEMBER_SHEET_TAB_NAME      ← 既定: メンバーリスト
 *
 *   実行:
 *     node --env-file=.env.local scripts/verify-sa-access.mjs
 *
 * 出力（成功時）:
 *   ✅ Auth: OK (token expires in 3599s)
 *   ✅ Sheet ID: 1XF8QIo...
 *   ✅ Tab: メンバーリスト
 *   ✅ Total rows: 200 (199 member rows + 1 header)
 *   ✅ Header (14 cols): 番号 | ユニークID | ソルト | ハッシュ | 名前 | ...
 *   ✅ Sample row 2 (redacted): name="テスト太郎" cols=14
 *
 * セキュリティ注意:
 *   - private_key 値そのものはログに出さない
 *   - パスワード列 (N) や ハッシュ列 (D) も出さない
 *   - 漏れて困らない情報（行数・列名・名前列の先頭1件）のみ表示
 */

import crypto from "node:crypto";
import fetch from "node-fetch";

const SCOPE = "https://www.googleapis.com/auth/spreadsheets.readonly";
const TOKEN_URL = "https://oauth2.googleapis.com/token";

function fail(msg) {
  console.error(`❌ ${msg}`);
  process.exit(1);
}

// ─── 1. env 読込・検証 ────────────────────────────────────
const clientEmail = process.env.GOOGLE_SA_CLIENT_EMAIL;
const rawPrivateKey = process.env.GOOGLE_SA_PRIVATE_KEY;
const sheetId = process.env.MEMBER_SHEET_ID;
const tabName = process.env.MEMBER_SHEET_TAB_NAME || "メンバーリスト";

if (!clientEmail) fail("GOOGLE_SA_CLIENT_EMAIL が未設定（.env.local に追加してください）");
if (!rawPrivateKey) fail("GOOGLE_SA_PRIVATE_KEY が未設定");
if (!sheetId) fail("MEMBER_SHEET_ID が未設定");

// 改行のエスケープ解除（dotenv 形式から PEM 形式へ）
// Netlify UI と .env.local どちらも \n リテラルで保管されている前提
let privateKey = rawPrivateKey;
// 引用符を剥がす（先頭末尾の "..." を除去）
if (privateKey.startsWith('"') && privateKey.endsWith('"')) {
  privateKey = privateKey.slice(1, -1);
}
privateKey = privateKey.replace(/\\n/g, "\n");

if (!privateKey.includes("BEGIN PRIVATE KEY") || !privateKey.includes("END PRIVATE KEY")) {
  fail("GOOGLE_SA_PRIVATE_KEY の形式が不正（BEGIN/END マーカー欠落）");
}

console.log(`▶ env OK:`);
console.log(`   SA email : ${clientEmail}`);
console.log(`   sheet ID : ${sheetId.slice(0, 12)}... (${sheetId.length} chars)`);
console.log(`   tab name : ${tabName}`);
console.log(`   key len  : ${privateKey.length} chars (BEGIN found: ${privateKey.includes("BEGIN PRIVATE KEY")})`);

// ─── 2. JWT 生成（RS256） ─────────────────────────────────
const now = Math.floor(Date.now() / 1000);
const header = { alg: "RS256", typ: "JWT" };
const claim = {
  iss: clientEmail,
  scope: SCOPE,
  aud: TOKEN_URL,
  iat: now,
  exp: now + 3600,
};

const toBase64Url = (obj) =>
  Buffer.from(JSON.stringify(obj)).toString("base64url");

const unsigned = `${toBase64Url(header)}.${toBase64Url(claim)}`;

let signature;
try {
  const signer = crypto.createSign("RSA-SHA256");
  signer.update(unsigned);
  signature = signer.sign(privateKey, "base64url");
} catch (e) {
  fail(`JWT 署名失敗: ${e.message} (private_key の改行・形式を確認)`);
}

const jwt = `${unsigned}.${signature}`;

// ─── 3. アクセストークン取得 ───────────────────────────────
let tokenJson;
try {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });
  tokenJson = await res.json();
  if (!res.ok || tokenJson.error) {
    console.error(`❌ Token 取得失敗: HTTP ${res.status}`);
    console.error(`   error             : ${tokenJson.error}`);
    console.error(`   error_description : ${tokenJson.error_description}`);
    if (tokenJson.error === "invalid_grant" && /account not found/i.test(tokenJson.error_description || "")) {
      console.error(`\n💡 "account not found" の典型原因:`);
      console.error(`   1. client_email のタイプミス（上の SA email を Cloud Console と 1 文字単位で比較）`);
      console.error(`   2. SA を削除→再作成した後、古い JSON 鍵を使っている`);
      console.error(`   3. SA がまだ反映中（作成直後 1 分程度待つ）`);
      console.error(`   4. private_key の本体が別 SA のものと混在している`);
      console.error(`   確認: https://console.cloud.google.com/iam-admin/serviceaccounts`);
    }
    process.exit(1);
  }
} catch (e) {
  fail(`Token 取得通信エラー: ${e.message}`);
}

const accessToken = tokenJson.access_token;
const expiresIn = tokenJson.expires_in;
console.log(`✅ Auth: OK (token expires in ${expiresIn}s)`);

// ─── 4. Sheets API 呼出 ──────────────────────────────────
const range = encodeURIComponent(`${tabName}!A1:N`);
const sheetUrl = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${range}`;

let sheetJson;
try {
  const res = await fetch(sheetUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  sheetJson = await res.json();
  if (!res.ok || sheetJson.error) {
    fail(`Sheets API 失敗: HTTP ${res.status} / ${sheetJson.error?.message || "?"}`);
  }
} catch (e) {
  fail(`Sheets API 通信エラー: ${e.message}`);
}

// ─── 5. 結果レポート（機密値は出さない） ──────────────────
const rows = sheetJson.values || [];
if (rows.length === 0) fail("Sheet が空 / 範囲が違う");

const headerRow = rows[0] || [];
const memberRowsCount = rows.length - 1;

console.log(`✅ Sheet ID: ${sheetId.slice(0, 12)}...`);
console.log(`✅ Tab: ${tabName}`);
console.log(`✅ Total rows: ${rows.length} (${memberRowsCount} member rows + 1 header)`);
console.log(`✅ Header (${headerRow.length} cols): ${headerRow.join(" | ")}`);

// サンプル: 1 件目の名前列だけ（パスワード・ハッシュ・電話・住所等は出さない）
const sampleRow = rows[1];
if (sampleRow) {
  const sampleName = sampleRow[4] ?? "(名前列なし)";
  console.log(`✅ Sample row 2 (redacted): name="${sampleName}" cols=${sampleRow.length}`);
}

// ─── 6. 期待値チェック（CSV 観察と整合するか） ────────────
const expectedHeaders = [
  "番号", "ユニークID", "ソルト", "ハッシュ", "名前",
  "電話番号", "連絡手段", "住所", "ファイルURL",
  "時給", "甲乙", "扶養人数", "外国人", "パスワード",
];
const headerMismatch = expectedHeaders.filter((expected, i) => headerRow[i] !== expected);
if (headerMismatch.length === 0) {
  console.log("✅ Header schema: matches expected 14-column layout");
} else {
  console.log(`⚠️  Header mismatch (期待と違う列が ${headerMismatch.length} 件): ${headerMismatch.join(", ")}`);
}

if (memberRowsCount < 100) {
  console.log(`⚠️  Member count (${memberRowsCount}) が想定 (199±) より少ない。範囲設定を確認`);
}

console.log("\n🎉 Step 7 verification complete.");
