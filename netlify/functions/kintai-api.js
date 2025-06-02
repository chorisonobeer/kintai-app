/**  netlify/functions/kintai-api.js      2025‑04‑21
 *  ─────────────────────────────────────────────────────
 *  - ブラウザ→Functions→GAS の完全中継
 *  - GAS の生レスポンスをヘッダーとログに必ず出力
 *  - スプレッドシート詳細情報をログに出力
 *  ─────────────────────────────────────────────────────
 */

const GAS_API_URL =
  'https://script.google.com/macros/s/AKfycbwViNC0mNfASjQDCVBcN-Dahrvs2mZJREsyYQkVY9OeuAYwy3Xn80ixv5lg9A5jZHbFEg/exec';

export async function handler(event) {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'OPTIONS, GET, POST',
    'Access-Control-Expose-Headers': 'X-GAS-Status, X-GAS-Body'
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode:204, headers:cors };
  if (event.httpMethod === 'GET')
    return { statusCode:200, headers:cors,
             body:'{"success":true,"message":"kintai-api OK"}' };

  try {
    const reqBody = event.body || '{}';
    
    let reqJSON;
    try {
      reqJSON = JSON.parse(reqBody);
    } catch (e) {
      // リクエスト解析エラーは無視
    }
    
    // GASへリクエスト
    const resp = await fetch(GAS_API_URL, {
      method:'POST', 
      headers:{'Content-Type':'application/json'}, 
      body:reqBody
    });
    

    
    // レスポンス本文取得
    const text = await resp.text();
    
    // JSONとして解析
    let jsonData;
    try {
      jsonData = JSON.parse(text);
    } catch (e) {
      // レスポンス解析エラーは無視
    }
    
    // レスポンス返却
    return {
      statusCode: resp.status,
      headers: {
        ...cors,
        'X-GAS-Status': resp.status.toString(),
        'X-GAS-Body': encodeURIComponent(text.slice(0,300)),
        'Content-Type': 'application/json'
      },
      body: text
    };
  } catch (error) {
    // エラーハンドリング
    return {
      statusCode: 500,
      headers: { ...cors, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: false,
        error: String(error),
        stack: error.stack,
        timestamp: new Date().toISOString()
      })
    };
  }
}