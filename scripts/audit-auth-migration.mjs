/**
 * scripts/audit-auth-migration.mjs                                  2026-05-06
 * ────────────────────────────────────────────────────────────────────
 * Phase 2 audit — 不変条件 I1〜I12 を機械判定
 *
 * 使い方:
 *   node --env-file=.env.local scripts/audit-auth-migration.mjs
 *
 * 前提: netlify dev が localhost:8888 で起動中
 *
 * セキュリティ: 名前・パスワード・トークン・hash 等の値は出力しない
 *               row index と pass/fail のみ表示
 * ────────────────────────────────────────────────────────────────────
 */

import crypto from "node:crypto";
import fetch from "node-fetch";

const FN_URL = "http://localhost:8888/.netlify/functions/auth-login";

// ─── 設定 ─────────────────────────────────────────────
const SA_CLIENT_EMAIL = process.env.GOOGLE_SA_CLIENT_EMAIL;
const SA_PRIVATE_KEY_RAW = process.env.GOOGLE_SA_PRIVATE_KEY;
const SHEET_ID = process.env.MEMBER_SHEET_ID;
const TAB_NAME = process.env.MEMBER_SHEET_TAB_NAME || "メンバーリスト";
const AUTH_SECRET = process.env.NETLIFY_AUTH_SECRET;

// 列インデックス (auth-login.cjs の COL と一致)
const COL = { USER_ID: 1, NAME: 4, FILE_URL: 8, PASSWORD: 13 };

if (!SA_CLIENT_EMAIL || !SA_PRIVATE_KEY_RAW || !SHEET_ID || !AUTH_SECRET) {
  console.error("❌ env vars missing (GOOGLE_SA_*, MEMBER_SHEET_ID, NETLIFY_AUTH_SECRET)");
  process.exit(1);
}

// ─── 計数器 ─────────────────────────────────────────
const stats = {
  total: 0,
  i1_login_ok: 0,
  i2_userId_match: 0,
  i3_userName_match: 0,
  i4_sheetId_match: 0,
  i12_no_leak: 0,
  failures: [], // {row, code, reason}
};

// ─── SA 経由で member sheet を取得 ─────────────────────
function decodePrivateKey(raw) {
  let pk = raw;
  if (pk.startsWith('"') && pk.endsWith('"')) pk = pk.slice(1, -1);
  return pk.replace(/\\n/g, "\n");
}

async function getSAAccessToken() {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const claim = {
    iss: SA_CLIENT_EMAIL,
    scope: "https://www.googleapis.com/auth/spreadsheets.readonly",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  };
  const b64u = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const unsigned = `${b64u(header)}.${b64u(claim)}`;
  const signer = crypto.createSign("RSA-SHA256");
  signer.update(unsigned);
  const sig = signer.sign(decodePrivateKey(SA_PRIVATE_KEY_RAW), "base64url");
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${unsigned}.${sig}`,
    }),
  });
  const json = await res.json();
  if (!res.ok || json.error)
    throw new Error(`SA auth: ${json.error_description || json.error}`);
  return json.access_token;
}

async function fetchAllMembers() {
  const token = await getSAAccessToken();
  const range = encodeURIComponent(`${TAB_NAME}!A1:N`);
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${range}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const json = await res.json();
  if (!res.ok || json.error)
    throw new Error(`Sheets fetch: ${json.error?.message || res.status}`);
  return json.values || [];
}

function extractSheetIdFromUrl(url) {
  if (!url) return "";
  const m = String(url).match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return m ? m[1] : "";
}

// 期待されるレスポンスキー (I12 漏洩監査)
const EXPECTED_KEYS = ["ok", "token", "userId", "userName", "spreadsheetId"];
const FORBIDDEN_KEYS = ["salt", "hash", "password", "phoneNumber", "address", "電話番号", "住所"];

function checkResponseLeak(json) {
  // OK レスポンスのキーが期待集合の中だけか
  const keys = Object.keys(json);
  for (const k of keys) {
    if (FORBIDDEN_KEYS.includes(k)) return `forbidden key "${k}"`;
  }
  for (const must of EXPECTED_KEYS) {
    if (!(must in json)) return `missing expected key "${must}"`;
  }
  return null;
}

async function loginRequest(name, password) {
  const res = await fetch(FN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, password }),
  });
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = { _raw: text };
  }
  return { status: res.status, body };
}

// ─── メイン ──────────────────────────────────────────
console.log("[audit] Phase 2 — auth-login 不変条件 I1〜I12 検証");
console.log("");

// 1. メンバー全件取得
let rows;
try {
  console.log("▶ Step 1: Sheets API でメンバー取得中...");
  rows = await fetchAllMembers();
  console.log(`  取得行数: ${rows.length} (${rows.length - 1} メンバー + ヘッダ)`);
} catch (e) {
  console.error(`❌ メンバー取得失敗: ${e.message}`);
  process.exit(1);
}

// 2. 全メンバーで I1-I4, I12 を検証
console.log("");
console.log("▶ Step 2: 各メンバーで I1〜I4, I12 検証中...");
const t0 = Date.now();
for (let i = 1; i < rows.length; i++) {
  const row = rows[i];
  const name = row[COL.NAME];
  const password = row[COL.PASSWORD];
  const expectedUserId = row[COL.USER_ID];
  const expectedSheetId = extractSheetIdFromUrl(row[COL.FILE_URL]);

  // 必須属性なし行はスキップ（カウント対象外）
  if (!name || password === "" || password == null || !expectedUserId || !expectedSheetId) {
    continue;
  }
  stats.total++;

  const { status, body } = await loginRequest(name, password);

  if (status === 200 && body.ok === true) stats.i1_login_ok++;
  else {
    stats.failures.push({ row: i + 1, code: `I1 status=${status}`, reason: body.err || "?" });
    continue;
  }

  if (body.userId === expectedUserId) stats.i2_userId_match++;
  else stats.failures.push({ row: i + 1, code: "I2 userId mismatch" });

  if (body.userName === name) stats.i3_userName_match++;
  else stats.failures.push({ row: i + 1, code: "I3 userName mismatch" });

  if (body.spreadsheetId === expectedSheetId) stats.i4_sheetId_match++;
  else stats.failures.push({ row: i + 1, code: "I4 sheetId mismatch" });

  const leak = checkResponseLeak(body);
  if (!leak) stats.i12_no_leak++;
  else stats.failures.push({ row: i + 1, code: `I12 ${leak}` });
}
const elapsedTotal = Date.now() - t0;

// 3. 攻撃テスト I5, I6, I7
console.log("");
console.log("▶ Step 3: 攻撃テスト I5〜I7");
const attacks = [];

// I7: 空入力
{
  const r = await loginRequest("", "");
  attacks.push({ id: "I7-empty-both", expect: 400, actual: r.status, ok: r.status === 400 });
}
{
  const r = await loginRequest("test", "");
  attacks.push({ id: "I7-empty-pw", expect: 400, actual: r.status, ok: r.status === 400 });
}
{
  const r = await loginRequest("", "test");
  attacks.push({ id: "I7-empty-name", expect: 400, actual: r.status, ok: r.status === 400 });
}

// I6: 存在しない名前
{
  const r = await loginRequest(`__not_a_real_user_${Date.now()}__`, "anything");
  attacks.push({
    id: "I6-no-user",
    expect: 401,
    actual: r.status,
    ok: r.status === 401 && r.body.ok === false && !r.body.token,
  });
}

// I5: 名前一致 + PW 不一致 (テスト太郎 などの実在 row を借用)
{
  // 1 行目（最初の実在ユーザー）の名前で間違った PW
  const realName = rows[1]?.[COL.NAME];
  if (realName) {
    const r = await loginRequest(realName, `__wrong_pw_${Date.now()}__`);
    attacks.push({
      id: "I5-bad-pw",
      expect: 401,
      actual: r.status,
      ok: r.status === 401 && r.body.ok === false && !r.body.token,
    });
  }
}

// 4. I8: token 形式 & 検証可能性
console.log("");
console.log("▶ Step 4: I8 token 形式・HMAC 検証");
let i8 = { ok: false, reason: "" };
const sampleRow = rows[1];
if (sampleRow) {
  const r = await loginRequest(sampleRow[COL.NAME], sampleRow[COL.PASSWORD]);
  if (r.status === 200 && r.body.token) {
    const parts = String(r.body.token).split(".");
    if (parts.length !== 3) i8.reason = "token は header.payload.signature の 3 segment ではない";
    else {
      // HMAC 再計算で一致するか
      const expected = crypto
        .createHmac("sha256", AUTH_SECRET)
        .update(`${parts[0]}.${parts[1]}`)
        .digest("base64url");
      if (expected === parts[2]) {
        // payload claims の整合性
        try {
          const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString());
          const now = Math.floor(Date.now() / 1000);
          if (payload.sub && payload.exp > now && payload.iat <= now) {
            i8.ok = true;
          } else {
            i8.reason = "payload claims invalid";
          }
        } catch {
          i8.reason = "payload JSON 解析失敗";
        }
      } else {
        i8.reason = "HMAC mismatch";
      }
    }
  } else {
    i8.reason = `login failed status=${r.status}`;
  }
}

// 5. レポート
console.log("");
console.log("════════════════════════════════════════════════════");
console.log(" AUDIT RESULT — 不変条件 I1〜I12");
console.log("════════════════════════════════════════════════════");
console.log("");
console.log(`▶ 対象メンバー: ${stats.total}`);
console.log(`▶ Step 2 全件検証 elapsed: ${elapsedTotal}ms (avg ${Math.round(elapsedTotal / Math.max(1, stats.total))}ms/req)`);
console.log("");

const checks = [
  { id: "I1", label: "全メンバー login 成功", got: stats.i1_login_ok, expected: stats.total },
  { id: "I2", label: "userId 一致", got: stats.i2_userId_match, expected: stats.total },
  { id: "I3", label: "userName 一致", got: stats.i3_userName_match, expected: stats.total },
  { id: "I4", label: "spreadsheetId 一致", got: stats.i4_sheetId_match, expected: stats.total },
  { id: "I12", label: "レスポンスに機密列が含まれない", got: stats.i12_no_leak, expected: stats.total },
];

let pass = 0, fail = 0;
for (const c of checks) {
  const ok = c.got === c.expected;
  console.log(
    `${ok ? "✅" : "❌"} ${c.id}: ${c.label} — ${c.got}/${c.expected}`,
  );
  ok ? pass++ : fail++;
}

for (const a of attacks) {
  console.log(`${a.ok ? "✅" : "❌"} ${a.id}: expect HTTP ${a.expect}, got ${a.actual}`);
  a.ok ? pass++ : fail++;
}

console.log(`${i8.ok ? "✅" : "❌"} I8: token format & HMAC 検証 — ${i8.ok ? "OK" : i8.reason}`);
i8.ok ? pass++ : fail++;

console.log("");
console.log("⏭️  I9 (公開停止), I10 (warm < 1s), I11 (frontend 互換) は別検証で実施");
console.log("");
console.log(`総合: ${pass} pass / ${fail} fail`);

if (stats.failures.length > 0) {
  console.log("");
  console.log("失敗詳細（先頭 10 件）:");
  for (const f of stats.failures.slice(0, 10)) {
    console.log(`  - row ${f.row}: ${f.code} ${f.reason || ""}`);
  }
  if (stats.failures.length > 10) {
    console.log(`  ... 他 ${stats.failures.length - 10} 件`);
  }
}

console.log("");
process.exit(fail === 0 ? 0 : 1);
