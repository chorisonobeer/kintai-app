/**  netlify/functions/kintai-api.js      2025‑04‑21
 *  ─────────────────────────────────────────────────────
 *  - ブラウザ→Functions→GAS の完全中継
 *  - GAS の生レスポンスをヘッダーとログに必ず出力
 *  - スプレッドシート詳細情報をログに出力
 *  ─────────────────────────────────────────────────────
 */

const GAS_API_URL =
  'https://script.google.com/macros/s/AKfycbzW33cRCB_rYdRx-bNQhj-2pghluHl09_iu26As9Xm7f7PIEoRk2B_42ubLYO6kKpid4w/exec';

exports.handler = async function(event) {
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
    
    console.log('GAS APIにリクエスト送信:', {
      url: GAS_API_URL,
      method: 'POST',
      bodySize: reqBody.length
    });

    // タイムアウト付きfetch関数
    const fetchWithTimeout = (url, options, timeout = 8000) => {
      return new Promise((resolve, reject) => {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => {
          controller.abort();
          reject(new Error(`Request timeout after ${timeout}ms`));
        }, timeout);

        fetch(url, { ...options, signal: controller.signal })
          .then(resolve)
          .catch(reject)
          .finally(() => clearTimeout(timeoutId));
      });
    };

    // リトライ付きfetch関数
    const fetchWithRetry = async (url, options, maxRetries = 2) => {
      let lastError;
      
      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          console.log(`GAS API呼び出し試行 ${attempt + 1}/${maxRetries + 1}`);
          const response = await fetchWithTimeout(url, options, 8000);
          return response;
        } catch (error) {
          lastError = error;
          console.warn(`試行 ${attempt + 1} 失敗:`, error.message);
          
          // 最後の試行でない場合は少し待機
          if (attempt < maxRetries) {
            const delay = Math.min(1000 * Math.pow(2, attempt), 3000);
            console.log(`${delay}ms後にリトライします...`);
            await new Promise(resolve => setTimeout(resolve, delay));
          }
        }
      }
      
      throw lastError;
    };

    const resp = await fetchWithRetry(GAS_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: reqBody
    });
    
    console.log('GAS APIからのレスポンス:', {
      status: resp.status,
      statusText: resp.statusText,
      headers: Object.fromEntries(resp.headers.entries())
    });

    if (!resp.ok) {
      throw new Error(`GAS API error: ${resp.status} ${resp.statusText}`);
    }

    // レスポンス本文取得
    console.log('[kintai-api] Attempting to get response text...');
    const text = await resp.text();
    console.log('GAS APIレスポンステキスト:', text.substring(0, 500));
    
    // JSONとして解析
    let jsonData;
    try {
      console.log('[kintai-api] Attempting to parse response text as JSON...');
      jsonData = JSON.parse(text);
      console.log('解析済みレスポンス:', jsonData);
    } catch (e) {
      console.error('JSON解析エラー:', e);
      console.error('レスポンステキスト:', text);
      throw new Error('Invalid JSON response from GAS API');
    }
    
    // レスポンス返却
    console.log('[kintai-api] Returning response to client.');
    return {
      statusCode: 200,
      headers: {
        ...cors,
        'X-GAS-Status': resp.status.toString(),
        'X-GAS-Body': encodeURIComponent(text.slice(0,300)),
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache, no-store, must-revalidate'
      },
      body: text
    };
  } catch (error) {
    // エラーハンドリング
    console.error('[kintai-api] Error in handler:', error);
    return {
      statusCode: 500,
      headers: { ...cors, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: false,
        error: String(error),
        message: error.message,
        name: error.name,
        stack: error.stack,
        details: JSON.stringify(error, Object.getOwnPropertyNames(error)), // エラーオブジェクト全体を文字列化
        timestamp: new Date().toISOString()
      })
    };
  }
};