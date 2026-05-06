/**  netlify/functions/kintai-api.cjs      2026-04-17
 *  ─────────────────────────────────────────────────────
 *  - ブラウザ→Functions→GAS の pass-through 中継
 *  - クライアント側にリトライを一任する設計（二重リトライ排除）
 *  - Netlify Free プラン 10s 上限に対して AbortController で 7.5s abort
 *  - GAS_API_URL は環境変数で上書き可能
 *  ─────────────────────────────────────────────────────
 */

// Netlify Free プラン上限 10s に対し、abort + catch + 応答返却で 2.5s の余裕を確保
const NETLIFY_INTERNAL_TIMEOUT_MS = 7_500;

// GAS URL は環境変数優先（.env.production ではなく Netlify UI で設定すべき）
const GAS_API_URL =
  process.env.GAS_API_URL ||
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
  const tid = setTimeout(
    () => controller.abort(),
    NETLIFY_INTERNAL_TIMEOUT_MS,
  );

  try {
    const resp = await fetch(GAS_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: reqBody,
      signal: controller.signal,
    });

    const text = await resp.text();

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
