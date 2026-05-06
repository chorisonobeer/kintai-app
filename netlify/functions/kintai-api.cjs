/**  netlify/functions/kintai-api.cjs      2026-04-17
 *  ─────────────────────────────────────────────────────
 *  - ブラウザ→Functions→GAS の pass-through 中継
 *  - クライアント側にリトライを一任する設計（二重リトライ排除）
 *  - Netlify Free プラン 10s 上限に対して AbortController で 7.5s abort
 *  - GAS_API_URL は環境変数で上書き可能
 *  - fetch は node-fetch を使用（netlify-cli dev の lambda compat ラッパーが
 *    globalThis.fetch を傍受して ~5s で abort するため、それを回避）
 *  ─────────────────────────────────────────────────────
 */

// netlify-cli の wrapped fetch を回避するため node-fetch (v2, CJS) を直接使う
const fetch = require("node-fetch");

// Netlify Free プラン上限 10s。 GAS の saveKintai が setFormula 等で 8s 超えるケースがあり、
// 7.5s だと頻発タイムアウト。9s に伸ばし、Netlify 側 10s 上限ギリギリで応答を試みる。
// abort 後の catch + JSON 返却に約 50ms 必要なので 10000 - 50 = 9950 を採用、
// クライアント側 fetchWithTimeout (10500ms) より短くしておく
const NETLIFY_INTERNAL_TIMEOUT_MS = 9_500;

// GAS URL は本ファイルが唯一の真実源（Single Source of Truth）。
// 変更が必要なら本ファイルを編集 → コミット → 再デプロイ。
// 他ファイル（.env.local / .env.production / vite.config.ts 等）から GAS URL は排除済み。
const GAS_API_URL =
  "https://script.google.com/macros/s/AKfycbz3JiuOyBvPpzS3OfuQYktTcm85FP-uyegWGpMfhL-DMVJbaeiJ2tIL3XpcLbaoMoazBg/exec";

exports.handler = async function (event) {
  const cors = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "OPTIONS, GET, POST",
    "Access-Control-Expose-Headers": "X-GAS-Status",
  };

  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: cors };
  if (event.httpMethod === "GET") {
    return {
      statusCode: 200,
      headers: cors,
      body: '{"success":true,"message":"kintai-api OK"}',
    };
  }

  const reqBody = event.body || "{}";
  const controller = new AbortController();
  // 起動診断: 実際にロードされている timeout 値を確認する
  console.log(`[kintai-api] using NETLIFY_INTERNAL_TIMEOUT_MS=${NETLIFY_INTERNAL_TIMEOUT_MS}`);
  const tid = setTimeout(
    () => controller.abort(),
    NETLIFY_INTERNAL_TIMEOUT_MS,
  );

  // dev デバッグ: アクション名と body サイズだけ記録（機密値は出さない）
  let actionForLog = "unknown";
  try {
    const parsed = JSON.parse(reqBody);
    actionForLog = parsed.action || "unknown";
  } catch {
    /* ignore parse error */
  }
  const t0 = Date.now();
  console.log(
    `[kintai-api] → GAS action=${actionForLog} bodyBytes=${reqBody.length}`,
  );

  try {
    const resp = await fetch(GAS_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: reqBody,
      signal: controller.signal,
    });

    const text = await resp.text();
    console.log(
      `[kintai-api] ← GAS status=${resp.status} action=${actionForLog} elapsed=${Date.now() - t0}ms bodyBytes=${text.length}`,
    );

    return {
      statusCode: resp.ok ? 200 : 502,
      headers: {
        ...cors,
        "X-GAS-Status": resp.status.toString(),
        "Content-Type": "application/json",
        "Cache-Control": "no-cache, no-store, must-revalidate",
      },
      body: text,
    };
  } catch (error) {
    const isAbort = error && error.name === "AbortError";
    console.error("[kintai-api] fetch error:", error);
    return {
      statusCode: isAbort ? 504 : 502,
      headers: { ...cors, "Content-Type": "application/json" },
      body: JSON.stringify({
        success: false,
        error: isAbort ? "Gateway timeout" : "Bad gateway",
        message: String((error && error.message) || error),
      }),
    };
  } finally {
    clearTimeout(tid);
  }
};
