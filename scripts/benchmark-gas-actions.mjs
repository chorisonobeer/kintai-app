/**
 * scripts/benchmark-gas-actions.mjs                              2026-05-06
 * ────────────────────────────────────────────────────────────────────
 * GAS の各 action の実応答時間を計測（テスト太郎を使用）
 *
 *   - login (auth-login Function) → token
 *   - getMonthlyData × 5 回（cold/warm 比較）
 *   - saveKintai × 5 回（同一日付に上書き = 既存行の更新パス）
 *   - saveKintai 削除（クリーンアップ）
 *
 * 使い方:
 *   node --env-file=.env.local scripts/benchmark-gas-actions.mjs
 * ────────────────────────────────────────────────────────────────────
 */

import crypto from "node:crypto";
import fetch from "node-fetch";

const FN_AUTH = "http://localhost:8888/.netlify/functions/auth-login";
const FN_KINTAI = "http://localhost:8888/.netlify/functions/kintai-api";

const SA_CE = process.env.GOOGLE_SA_CLIENT_EMAIL;
let SA_PK = process.env.GOOGLE_SA_PRIVATE_KEY;
if (SA_PK?.startsWith('"') && SA_PK?.endsWith('"')) SA_PK = SA_PK.slice(1, -1);
SA_PK = SA_PK?.replace(/\\n/g, "\n");
const SHEET_ID = process.env.MEMBER_SHEET_ID;
const TAB = process.env.MEMBER_SHEET_TAB_NAME || "メンバーリスト";

if (!SA_CE || !SA_PK || !SHEET_ID) {
  console.error("missing env");
  process.exit(1);
}

// ─── テスト太郎の name + password を SA で取得 ─────────────────
async function getSAToken() {
  const now = Math.floor(Date.now() / 1000);
  const u =
    Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url") +
    "." +
    Buffer.from(
      JSON.stringify({
        iss: SA_CE,
        scope: "https://www.googleapis.com/auth/spreadsheets.readonly",
        aud: "https://oauth2.googleapis.com/token",
        iat: now,
        exp: now + 3600,
      }),
    ).toString("base64url");
  const s = crypto.createSign("RSA-SHA256");
  s.update(u);
  const sig = s.sign(SA_PK, "base64url");
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: u + "." + sig,
    }),
  });
  return (await r.json()).access_token;
}

const sat = await getSAToken();
const sheetsRes = await fetch(
  "https://sheets.googleapis.com/v4/spreadsheets/" +
    SHEET_ID +
    "/values/" +
    encodeURIComponent(TAB + "!A1:N"),
  { headers: { Authorization: "Bearer " + sat } },
);
const sheetJson = await sheetsRes.json();
const targetRow = sheetJson.values[1]; // テスト太郎
const targetName = targetRow[4];
const targetPw = targetRow[13];

// ─── login (auth-login) ──────────────────────────────────────
console.log("▶ Step 1: login → token 取得");
const tLogin0 = Date.now();
const lr = await fetch(FN_AUTH, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ name: targetName, password: targetPw }),
});
const lj = await lr.json();
console.log(`  login HTTP=${lr.status} elapsed=${Date.now() - tLogin0}ms`);
if (!lj.ok) {
  console.error("login failed:", lj);
  process.exit(1);
}
const TOKEN = lj.token;
const SS_ID = lj.spreadsheetId;
const USER_ID = lj.userId;
console.log(`  spreadsheetId=${SS_ID.slice(0, 12)}...`);

// ─── 計測 helper ─────────────────────────────────────────────
async function callAction(action, payload) {
  const body = JSON.stringify({
    action,
    payload,
    token: TOKEN,
    debug: true,
  });
  const t0 = Date.now();
  const r = await fetch(FN_KINTAI, {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body,
  });
  const text = await r.text();
  let j;
  try {
    j = JSON.parse(text);
  } catch {
    j = { _raw: text };
  }
  return {
    elapsed: Date.now() - t0,
    status: r.status,
    ok: j.ok,
    err: j.err,
    debug: j.debug,
    bodyBytes: text.length,
  };
}

const today = new Date();
const yyyy = today.getFullYear();
const mm = String(today.getMonth() + 1).padStart(2, "0");
const dd = String(today.getDate()).padStart(2, "0");
const TEST_DATE = `${yyyy}-${mm}-${dd}`; // 今日

// ─── getMonthlyData × 5 ───────────────────────────────────────
console.log("\n▶ Step 2: getMonthlyData × 5（warm 化含む）");
const gmdResults = [];
for (let i = 0; i < 5; i++) {
  const r = await callAction("getMonthlyData", {
    spreadsheetId: SS_ID,
    userId: USER_ID,
    year: yyyy,
    month: today.getMonth() + 1,
  });
  gmdResults.push(r);
  console.log(
    `  [${i + 1}] HTTP=${r.status} elapsed=${r.elapsed}ms ok=${r.ok} bytes=${r.bodyBytes}${r.err ? " err=" + r.err : ""}`,
  );
}

// ─── saveKintai × 5 ──────────────────────────────────────────
console.log("\n▶ Step 3: saveKintai × 5（同一日付上書き、既存行更新パス）");
const skResults = [];
for (let i = 0; i < 5; i++) {
  const r = await callAction("saveKintai", {
    date: TEST_DATE,
    startTime: "09:00",
    breakTime: "01:00",
    endTime: "18:00",
    spreadsheetId: SS_ID,
    userId: USER_ID,
    tasks: [{ job: "ベンチマーク用", hours: 8 }],
  });
  skResults.push(r);
  console.log(
    `  [${i + 1}] HTTP=${r.status} elapsed=${r.elapsed}ms ok=${r.ok}${r.err ? " err=" + r.err : ""}${r.debug?.stage ? " stage=" + r.debug.stage : ""}`,
  );
}

// ─── 削除（クリーンアップ） ──────────────────────────────────
console.log("\n▶ Step 4: クリーンアップ（空データ送信で削除）");
const delR = await callAction("saveKintai", {
  date: TEST_DATE,
  startTime: "",
  breakTime: "",
  endTime: "",
  spreadsheetId: SS_ID,
  userId: USER_ID,
  tasks: [],
});
console.log(
  `  delete HTTP=${delR.status} elapsed=${delR.elapsed}ms ok=${delR.ok}${delR.err ? " err=" + delR.err : ""}`,
);

// ─── 統計 ────────────────────────────────────────────────────
function stats(arr, key = "elapsed") {
  const vals = arr.map((r) => r[key]).filter((v) => typeof v === "number");
  vals.sort((a, b) => a - b);
  return {
    n: vals.length,
    min: vals[0],
    median: vals[Math.floor(vals.length / 2)],
    max: vals[vals.length - 1],
    avg: Math.round(vals.reduce((s, v) => s + v, 0) / vals.length),
  };
}

console.log("\n═════════ 集計 ═════════");
const gmd = stats(gmdResults);
const sk = stats(skResults);
console.log(
  `getMonthlyData: n=${gmd.n} min=${gmd.min}ms median=${gmd.median}ms max=${gmd.max}ms avg=${gmd.avg}ms`,
);
console.log(
  `saveKintai   : n=${sk.n} min=${sk.min}ms median=${sk.median}ms max=${sk.max}ms avg=${sk.avg}ms`,
);

// ─── 失敗解析 ──────────────────────────────────────────────
const skFailed = skResults.filter((r) => r.status !== 200 || !r.ok);
if (skFailed.length > 0) {
  console.log(`\n⚠ saveKintai 失敗 ${skFailed.length}件:`);
  skFailed.forEach((r, i) => {
    console.log(
      `  [${i}] HTTP=${r.status} ok=${r.ok} err=${r.err}${r.debug?.stage ? " stage=" + r.debug.stage : ""}${r.debug?.formulaError ? " formulaErr=" + r.debug.formulaError : ""}`,
    );
  });
}

// ─── 最初の getMonthlyData の debug 詳細 ──────────────────────
if (gmdResults[0]?.debug) {
  console.log("\nDebug detail (1st getMonthlyData):");
  const d = gmdResults[0].debug;
  console.log(JSON.stringify({ stage: d.stage, rowCount: d.rowCount, lastRow: d.lastRow, lastCol: d.lastCol, scanned: d.scanned }, null, 2));
}
if (skResults[0]?.debug) {
  console.log("\nDebug detail (1st saveKintai):");
  const d = skResults[0].debug;
  console.log(
    JSON.stringify(
      {
        stage: d.stage,
        isDelete: d.isDelete,
        gValue: d.gValue ? "(有)" : "(空)",
        rowUpdated: d.rowUpdated,
        formulaError: d.formulaError,
        updated: d.updated,
        monthValue: d.monthValue,
      },
      null,
      2,
    ),
  );
}
