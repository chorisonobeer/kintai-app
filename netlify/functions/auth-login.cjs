/**
 * netlify/functions/auth-login.cjs                                  2026-05-06
 * ────────────────────────────────────────────────────────────────────
 * 認証経路の脱 GAS 化 — Phase 2 実装
 *
 *  - POST /.netlify/functions/auth-login
 *    body: {"name":"...","password":"..."}
 *    →    {"ok":true,  "token":"...", "userId":"...", "userName":"...", "spreadsheetId":"..."}
 *      or {"ok":false, "err":"..."}
 *
 *  - SA で Google Sheets API を直読
 *  - 列 E (名前) で行特定、列 N (平文 PW) で照合（hash 移行は P2 別計画）
 *  - HMAC-SHA256 JWT トークン発行（GAS と共有秘密鍵で検証可能形式）
 *  - SA access_token は process メモリでキャッシュ（コンテナ生存中）
 *
 *  関連: docs/plan-auth-migration-from-gas.md / docs/auth-migration-phase1-setup-guide.md
 * ────────────────────────────────────────────────────────────────────
 */

const crypto = require("node:crypto");
const fetch = require("node-fetch");

// ─── 環境変数 ────────────────────────────────────────────────
const SA_CLIENT_EMAIL = process.env.GOOGLE_SA_CLIENT_EMAIL;
const SA_PRIVATE_KEY_RAW = process.env.GOOGLE_SA_PRIVATE_KEY;
const SHEET_ID = process.env.MEMBER_SHEET_ID;
const TAB_NAME = process.env.MEMBER_SHEET_TAB_NAME || "メンバーリスト";
const AUTH_SECRET = process.env.NETLIFY_AUTH_SECRET;

// Netlify Free 上限 10s。Sheets fetch を 7.5s で abort
const SHEETS_FETCH_TIMEOUT_MS = 7_500;
// トークン有効期限 8 時間
const TOKEN_TTL_SEC = 8 * 60 * 60;

// 列インデックス (CSV 観察に基づく確定値)
const COL = {
  USER_ID: 1, // B: ユニークID
  NAME: 4, // E: 名前
  FILE_URL: 8, // I: ファイルURL（個人勤怠 sheet）
  PASSWORD: 13, // N: パスワード（平文）
};

// SA access_token のメモリキャッシュ（同コンテナ内のみ有効）
let cachedToken = null;
let cachedTokenExpiry = 0;

function decodePrivateKey() {
  let pk = SA_PRIVATE_KEY_RAW || "";
  if (pk.startsWith('"') && pk.endsWith('"')) pk = pk.slice(1, -1);
  return pk.replace(/\\n/g, "\n");
}

async function getSAAccessToken() {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && cachedTokenExpiry - 60 > now) {
    return cachedToken;
  }

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
  const sig = signer.sign(decodePrivateKey(), "base64url");
  const jwt = `${unsigned}.${sig}`;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });
  const json = await res.json();
  if (!res.ok || json.error) {
    throw new Error(
      `SA auth failed: ${json.error || ""} ${json.error_description || res.status}`,
    );
  }
  cachedToken = json.access_token;
  cachedTokenExpiry = now + (json.expires_in || 3600);
  return cachedToken;
}

async function fetchMemberRows() {
  const accessToken = await getSAAccessToken();
  const range = encodeURIComponent(`${TAB_NAME}!A1:N`);
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${range}`;
  const ctrl = new AbortController();
  const tid = setTimeout(() => ctrl.abort(), SHEETS_FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: ctrl.signal,
    });
    const json = await res.json();
    if (!res.ok || json.error) {
      throw new Error(
        `Sheets API failed: ${json.error?.message || res.status}`,
      );
    }
    return json.values || [];
  } finally {
    clearTimeout(tid);
  }
}

// タイミング攻撃対策の定数時間比較
function constantTimeEqual(a, b) {
  const A = Buffer.from(String(a));
  const B = Buffer.from(String(b));
  if (A.length !== B.length) {
    // 長さ違いでも一定時間消費（情報漏洩抑止）
    crypto.timingSafeEqual(A, A);
    return false;
  }
  return crypto.timingSafeEqual(A, B);
}

function extractSheetIdFromUrl(url) {
  if (!url) return "";
  const m = String(url).match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return m ? m[1] : "";
}

// HMAC-SHA256 JWT 発行（GAS との互換性を担保）
function issueToken(userId, userName, spreadsheetId) {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    sub: userId,
    name: userName,
    sid: spreadsheetId,
    iat: now,
    exp: now + TOKEN_TTL_SEC,
  };
  const b64u = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const header = b64u({ alg: "HS256", typ: "JWT" });
  const body = b64u(payload);
  const unsigned = `${header}.${body}`;
  const sig = crypto
    .createHmac("sha256", AUTH_SECRET)
    .update(unsigned)
    .digest("base64url");
  return `${unsigned}.${sig}`;
}

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Methods": "OPTIONS, POST",
};

const respond = (status, body) => ({
  statusCode: status,
  headers: {
    ...cors,
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  },
  body: JSON.stringify(body),
});

exports.handler = async (event) => {
  const t0 = Date.now();

  if (event.httpMethod === "OPTIONS")
    return { statusCode: 204, headers: cors };
  if (event.httpMethod !== "POST")
    return respond(405, { ok: false, err: "Method Not Allowed" });

  // env 必須チェック
  if (!SA_CLIENT_EMAIL || !SA_PRIVATE_KEY_RAW || !SHEET_ID || !AUTH_SECRET) {
    console.error("[auth-login] missing env vars");
    return respond(500, { ok: false, err: "Server misconfiguration" });
  }

  // body 解析
  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return respond(400, { ok: false, err: "Invalid JSON body" });
  }
  const name = (body.name || "").trim();
  const password = body.password || "";

  if (!name || !password) {
    return respond(400, {
      ok: false,
      err: "名前とパスワードを入力してください",
    });
  }

  // メンバー取得
  let rows;
  try {
    rows = await fetchMemberRows();
  } catch (err) {
    console.error("[auth-login] sheet fetch failed:", err.message);
    return respond(502, {
      ok: false,
      err: "メンバーリストの取得に失敗しました",
    });
  }

  if (rows.length < 2) {
    return respond(500, { ok: false, err: "メンバーリストが空です" });
  }

  // 名前で行特定（先頭一致のみ）
  let userRow = null;
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][COL.NAME] === name) {
      userRow = rows[i];
      break;
    }
  }

  // ユーザー存在の有無を漏らさないため、PW 不一致と同じメッセージで返す
  const failBadCreds = () =>
    respond(401, {
      ok: false,
      err: "名前またはパスワードが正しくありません",
    });

  if (!userRow) {
    console.log(
      `[auth-login] FAIL no_user name="${name}" elapsed=${Date.now() - t0}ms`,
    );
    return failBadCreds();
  }

  const storedPw = userRow[COL.PASSWORD] || "";
  if (!constantTimeEqual(password, storedPw)) {
    console.log(
      `[auth-login] FAIL pw_mismatch name="${name}" elapsed=${Date.now() - t0}ms`,
    );
    return failBadCreds();
  }

  // 必須属性チェック
  const userId = userRow[COL.USER_ID];
  const spreadsheetId = extractSheetIdFromUrl(userRow[COL.FILE_URL]);
  if (!userId || !spreadsheetId) {
    console.error(
      `[auth-login] user incomplete name="${name}" hasUserId=${!!userId} hasSheetId=${!!spreadsheetId}`,
    );
    return respond(500, { ok: false, err: "ユーザー情報が不完全です" });
  }

  const token = issueToken(userId, name, spreadsheetId);

  console.log(
    `[auth-login] OK name="${name}" elapsed=${Date.now() - t0}ms`,
  );
  return respond(200, {
    ok: true,
    token,
    userId,
    userName: name,
    spreadsheetId,
  });
};
