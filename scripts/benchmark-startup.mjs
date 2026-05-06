#!/usr/bin/env node
/**
 * PWA起動ボトルネック実測スクリプト
 *
 * 使い方:
 *   node scripts/benchmark-startup.mjs
 *
 * 対象（認証不要なもののみ、自動実行）:
 *   - GAS getVersion (コールドスタート＋ウォーム応答)
 *   - Google Sheets CSV取得 (作業内容マスタ)
 *   - /version.json 取得 (ローカル dist/ 経由または本番URL)
 *
 * 認証が必要な getMonthlyData 等は、--username と --password を渡せば測定可能:
 *   node scripts/benchmark-startup.mjs --username=... --password=...
 *
 * 出力: docs/benchmark-results.md (上書き)
 */

import { performance } from "node:perf_hooks";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

// ── 定数 ─────────────────────────────────────────
const GAS_URL_HARDCODED =
  "https://script.google.com/macros/s/AKfycbwKy0xPeGCpj9TWikx6sMSb_BuppWhZnNEueNbndHfGGDQnNSbma2ymM1eUig7kBdcy/exec";
const GAS_URL_ENV =
  "https://script.google.com/macros/s/AKfycbxPMNkuofB1CMjD872rhc6XomIckDxCjd0mYxn-szgQP2AIxkb7v5IC-qxx4P5dEK_x/exec";
const CSV_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vTMitO8OL_jLUXrm6etS4CRtg6TZsnGmpLoyxwkedI50wMwnat0l3H_8EQWDno8UIMT0tHYkzmz0cSq/pub?gid=55512795&single=true&output=csv";

const argv = process.argv.slice(2);
const getArg = (name) => {
  const found = argv.find((a) => a.startsWith(`--${name}=`));
  return found ? found.split("=")[1] : null;
};
const username = getArg("username");
const password = getArg("password");
const netlifyUrl = getArg("netlify-url"); // 本番URLを渡された場合の比較測定用

// ── 計測ユーティリティ ─────────────────────────────
async function measureFetch(url, options = {}, label = "") {
  const start = performance.now();
  let status = 0;
  let size = 0;
  let error = null;
  try {
    const res = await fetch(url, options);
    status = res.status;
    const text = await res.text();
    size = text.length;
    return {
      label,
      elapsedMs: performance.now() - start,
      status,
      size,
      body: text,
      error: null,
    };
  } catch (e) {
    error = String(e);
    return {
      label,
      elapsedMs: performance.now() - start,
      status,
      size,
      body: null,
      error,
    };
  }
}

async function callGAS(url, action, payload = {}, token = null) {
  const body = { action, payload };
  if (token) body.token = token;
  return measureFetch(
    url,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
    `GAS ${action}`,
  );
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function stats(values) {
  if (values.length === 0) return { count: 0 };
  const sorted = [...values].sort((a, b) => a - b);
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return {
    count: values.length,
    min: sorted[0],
    max: sorted[sorted.length - 1],
    median: sorted[Math.floor(sorted.length / 2)],
    mean,
    p95: sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))],
  };
}

function fmt(n) {
  return typeof n === "number" ? `${n.toFixed(0)}ms` : "-";
}

// ── 測定シナリオ ──────────────────────────────────

async function scenario1_gasColdAndWarm(url, urlLabel) {
  console.error(`\n[Scenario 1] GAS ${urlLabel}: Cold start + Warm (getVersion×6)`);
  const results = [];

  // 1発目 = コールドスタート扱い
  const first = await callGAS(url, "getVersion");
  console.error(`  Cold:  ${fmt(first.elapsedMs)} (status=${first.status})`);
  results.push({ type: "cold", ...first });

  // 連続5回 = ウォーム
  for (let i = 0; i < 5; i++) {
    await sleep(300); // 少し間隔をあけて、連打による rate limit 回避
    const r = await callGAS(url, "getVersion");
    console.error(`  Warm${i + 1}: ${fmt(r.elapsedMs)} (status=${r.status})`);
    results.push({ type: "warm", ...r });
  }

  return { urlLabel, url, results };
}

async function scenario2_csv() {
  console.error("\n[Scenario 2] Google Sheets CSV (×5)");
  const results = [];
  for (let i = 0; i < 5; i++) {
    await sleep(200);
    const r = await measureFetch(CSV_URL, { method: "GET" }, "CSV");
    console.error(`  Run${i + 1}: ${fmt(r.elapsedMs)} (status=${r.status}, size=${r.size}B)`);
    results.push(r);
  }
  return { results };
}

async function scenario3_idleGap(url, urlLabel) {
  console.error(
    `\n[Scenario 3] GAS ${urlLabel}: 1分/3分アイドル後の応答時間（コールド回復速度）`,
  );
  const results = [];

  await sleep(60_000); // 1分待機
  const after1min = await callGAS(url, "getVersion");
  console.error(`  After 1min idle: ${fmt(after1min.elapsedMs)}`);
  results.push({ idleSec: 60, ...after1min });

  await sleep(180_000); // さらに3分待機 → 計4分ぶり
  const after4min = await callGAS(url, "getVersion");
  console.error(`  After 4min idle: ${fmt(after4min.elapsedMs)}`);
  results.push({ idleSec: 240, ...after4min });

  return { urlLabel, results };
}

async function scenario4_login(url) {
  if (!username || !password) {
    console.error(
      "\n[Scenario 4] ログイン測定: --username と --password 未指定のためスキップ",
    );
    return null;
  }
  console.error("\n[Scenario 4] GAS login → getMonthlyData (実ユーザー)");

  // login
  const loginRes = await callGAS(url, "login", { name: username, password });
  console.error(
    `  login: ${fmt(loginRes.elapsedMs)} (status=${loginRes.status})`,
  );
  if (loginRes.error) return { loginError: loginRes.error };

  let loginJson;
  try {
    loginJson = JSON.parse(loginRes.body);
  } catch {
    return { loginParseError: loginRes.body };
  }

  const ok = loginJson.success === true || loginJson.ok === true;
  if (!ok) {
    console.error(`  login failed: ${JSON.stringify(loginJson).slice(0, 200)}`);
    return { loginJson };
  }
  const token = loginJson.token;
  const spreadsheetId = loginJson.spreadsheetId;
  const userId = loginJson.userId;

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  // 連続3回: 初回は GAS保存済みのキャッシュあり/なしで変動を見る
  const monthlyResults = [];
  for (let i = 0; i < 3; i++) {
    await sleep(300);
    const r = await callGAS(
      url,
      "getMonthlyData",
      { spreadsheetId, userId, year, month },
      token,
    );
    console.error(
      `  getMonthlyData${i + 1}: ${fmt(r.elapsedMs)} (status=${r.status}, size=${r.size}B)`,
    );
    monthlyResults.push(r);
  }

  return { loginMs: loginRes.elapsedMs, monthlyResults };
}

// ── メイン ────────────────────────────────────────

async function main() {
  const startedAt = new Date().toISOString();
  console.error(`=== PWA Startup Benchmark ===`);
  console.error(`Started: ${startedAt}\n`);

  // Scenario 1: GAS (ハードコードURL)
  const s1a = await scenario1_gasColdAndWarm(GAS_URL_HARDCODED, "HARDCODED");

  // Scenario 1b: GAS (env URL)
  const s1b = await scenario1_gasColdAndWarm(GAS_URL_ENV, "ENV_PRODUCTION");

  // Scenario 2: CSV
  const s2 = await scenario2_csv();

  // Scenario 4: 認証付きフル測定（オプション）
  const s4 = await scenario4_login(GAS_URL_HARDCODED);

  // Scenario 3: アイドル後（時間がかかるため最後）
  // デフォルトではスキップ。--idle フラグで有効化
  let s3 = null;
  if (argv.includes("--idle")) {
    s3 = await scenario3_idleGap(GAS_URL_HARDCODED, "HARDCODED");
  } else {
    console.error("\n[Scenario 3] アイドル測定: --idle フラグなしのためスキップ");
  }

  // ── レポート生成 ─────────────────────────────────
  const report = buildReport({
    startedAt,
    s1a,
    s1b,
    s2,
    s3,
    s4,
  });

  const outPath = resolve(
    process.cwd(),
    "docs/benchmark-results.md",
  );
  writeFileSync(outPath, report);
  console.error(`\n=== Report written to ${outPath} ===`);
}

function buildReport({ startedAt, s1a, s1b, s2, s3, s4 }) {
  const lines = [];
  lines.push("# PWA起動時間ベンチマーク結果");
  lines.push("");
  lines.push(`**実行日時**: ${startedAt}`);
  lines.push(`**実行環境**: Node.js ${process.version} / ${process.platform}`);
  lines.push("");
  lines.push("---");
  lines.push("");

  // Scenario 1a
  lines.push("## 1. GAS API応答時間（ハードコードURL = 実運用URL）");
  lines.push("");
  lines.push(`URL: \`${s1a.url.slice(0, 80)}...\``);
  lines.push("");
  lines.push(renderGASResults(s1a));
  lines.push("");

  // Scenario 1b
  lines.push("## 2. GAS API応答時間（.env.production の別URL）");
  lines.push("");
  lines.push(`URL: \`${s1b.url.slice(0, 80)}...\``);
  lines.push("");
  lines.push(renderGASResults(s1b));
  lines.push("");

  // Scenario 2: CSV
  lines.push("## 3. Google Sheets CSV応答時間");
  lines.push("");
  const csvMs = s2.results.map((r) => r.elapsedMs);
  const csvStats = stats(csvMs);
  lines.push("| Run | elapsed | status | size |");
  lines.push("|-----|---------|--------|------|");
  s2.results.forEach((r, i) => {
    lines.push(
      `| ${i + 1} | ${fmt(r.elapsedMs)} | ${r.status} | ${r.size}B |`,
    );
  });
  lines.push("");
  lines.push(
    `**統計**: min=${fmt(csvStats.min)} / median=${fmt(csvStats.median)} / mean=${fmt(csvStats.mean)} / p95=${fmt(csvStats.p95)} / max=${fmt(csvStats.max)}`,
  );
  lines.push("");

  // Scenario 3: idle
  if (s3) {
    lines.push("## 4. アイドル後のコールドスタート回復");
    lines.push("");
    lines.push("| idle | elapsed | status |");
    lines.push("|------|---------|--------|");
    s3.results.forEach((r) => {
      lines.push(
        `| ${r.idleSec}s | ${fmt(r.elapsedMs)} | ${r.status} |`,
      );
    });
    lines.push("");
  }

  // Scenario 4: login + getMonthlyData
  if (s4) {
    lines.push("## 5. 認証付きフル測定（getMonthlyData）");
    lines.push("");
    if (s4.loginError) {
      lines.push(`ログインエラー: ${s4.loginError}`);
    } else if (s4.loginJson) {
      lines.push(`ログイン失敗: ${JSON.stringify(s4.loginJson).slice(0, 200)}`);
    } else {
      lines.push(`- login: **${fmt(s4.loginMs)}**`);
      lines.push("");
      lines.push("| Run | getMonthlyData elapsed | status | size |");
      lines.push("|-----|----|----|----|");
      s4.monthlyResults.forEach((r, i) => {
        lines.push(
          `| ${i + 1} | ${fmt(r.elapsedMs)} | ${r.status} | ${r.size}B |`,
        );
      });
      const mms = s4.monthlyResults.map((r) => r.elapsedMs);
      const mstats = stats(mms);
      lines.push("");
      lines.push(
        `**getMonthlyData 統計**: min=${fmt(mstats.min)} / median=${fmt(mstats.median)} / mean=${fmt(mstats.mean)}`,
      );
    }
    lines.push("");
  }

  // 解釈
  lines.push("---");
  lines.push("");
  lines.push("## 解釈（自動生成）");
  lines.push("");
  lines.push(interpretResults({ s1a, s1b, s2, s3, s4 }));

  return lines.join("\n");
}

function renderGASResults(s) {
  const lines = [];
  const cold = s.results.find((r) => r.type === "cold");
  const warms = s.results.filter((r) => r.type === "warm").map((r) => r.elapsedMs);
  const warmStats = stats(warms);

  lines.push("| # | type | elapsed | status |");
  lines.push("|---|------|---------|--------|");
  s.results.forEach((r, i) => {
    lines.push(
      `| ${i + 1} | ${r.type} | ${fmt(r.elapsedMs)} | ${r.status}${r.error ? ` (err: ${r.error.slice(0, 60)})` : ""} |`,
    );
  });
  lines.push("");
  lines.push(
    `**Cold**: ${fmt(cold?.elapsedMs)}  |  **Warm**: min=${fmt(warmStats.min)} / median=${fmt(warmStats.median)} / mean=${fmt(warmStats.mean)}`,
  );
  return lines.join("\n");
}

function interpretResults({ s1a, s1b, s2, s3, s4 }) {
  const lines = [];

  const cold1a = s1a.results.find((r) => r.type === "cold")?.elapsedMs;
  const warms1a = s1a.results.filter((r) => r.type === "warm").map((r) => r.elapsedMs);
  const warmMean1a = warms1a.length
    ? warms1a.reduce((a, b) => a + b, 0) / warms1a.length
    : 0;

  lines.push(
    `- **GAS コールドスタート**: ${fmt(cold1a)}（この値がPWA初回起動時に最低限かかる）`,
  );
  lines.push(
    `- **GAS ウォーム応答**: ~${fmt(warmMean1a)}（連続呼び出し時の平均）`,
  );
  lines.push(
    `- **コールド/ウォーム比**: ${cold1a && warmMean1a ? (cold1a / warmMean1a).toFixed(1) : "-"}倍`,
  );
  lines.push("");

  if (s2) {
    const csvMs = s2.results.map((r) => r.elapsedMs);
    const csvMean = csvMs.reduce((a, b) => a + b, 0) / csvMs.length;
    lines.push(`- **CSV取得時間**: ~${fmt(csvMean)}（作業内容マスタの取得）`);
  }

  if (s4?.monthlyResults?.length) {
    const mmsMin = Math.min(...s4.monthlyResults.map((r) => r.elapsedMs));
    lines.push(
      `- **getMonthlyData**: 最速${fmt(mmsMin)} — これが実運用の月次データ取得に実際にかかる時間`,
    );
    const overheadVsVersion = mmsMin - warmMean1a;
    lines.push(
      `- **Sheetsアクセスのオーバーヘッド**: ~${fmt(overheadVsVersion)}（getMonthlyData - getVersion）`,
    );
  }

  lines.push("");
  lines.push("### 示唆");
  if (cold1a && cold1a > 5000) {
    lines.push(
      "- GAS コールドスタートが5秒超。Phase D (GAS最適化) の効果は限定的。むしろ Phase B (リトライ排除) と Phase E (SWR) の方が体感改善に寄与する",
    );
  } else if (cold1a && cold1a > 2000) {
    lines.push(
      "- GAS コールドスタートは2〜5秒。ウォーム時は1秒未満なら、SWRキャッシュの効果が最大化する",
    );
  } else {
    lines.push(
      "- GAS 応答は比較的速い。ボトルネックはSW更新フロー（Phase A）とリトライ二重化（Phase B）の方にある",
    );
  }

  return lines.join("\n");
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
