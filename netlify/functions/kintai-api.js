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
    console.log('REQ FULL →', reqBody);
    
    let reqJSON;
    try {
      reqJSON = JSON.parse(reqBody);
      console.log('REQ PARSED →', JSON.stringify(reqJSON));
    } catch (e) {
      console.error('REQ PARSE ERROR →', e);
    }
    
    // GASへリクエスト
    console.log(`GAS REQUEST START → ${new Date().toISOString()}`);
    const resp = await fetch(GAS_API_URL, {
      method:'POST', 
      headers:{'Content-Type':'application/json'}, 
      body:reqBody
    });
    console.log(`GAS REQUEST END → ${new Date().toISOString()}`);
    
    // レスポンスヘッダーの詳細ログ
    const respHeaders = {};
    resp.headers.forEach((value, key) => {
      respHeaders[key] = value;
    });
    console.log('GAS RESP HEADERS →', JSON.stringify(respHeaders));
    
    // レスポンス本文取得
    const text = await resp.text();
    console.log('GAS RESP FULL →', text);
    
    // JSONとして解析
    let jsonData;
    try {
      jsonData = JSON.parse(text);
      console.log('GAS RESP JSON →', JSON.stringify(jsonData));
      
      // スプレッドシート詳細情報のログ出力
      if (reqJSON && reqJSON.action === 'saveKintai' && jsonData.sheetDetails) {
        console.log('===== SPREADSHEET DETAILS =====');
        console.log('SPREADSHEET ID →', jsonData.sheetDetails.spreadsheetId);
        console.log('SPREADSHEET URL →', jsonData.sheetDetails.spreadsheetUrl);
        console.log('SHEET ID →', jsonData.sheetDetails.sheetId);
        console.log('SHEET NAME →', jsonData.sheetDetails.sheetName);
        
        // 更新か追加かによって出力を変更
        if (jsonData.sheetDetails.updatedRow) {
          console.log('UPDATED ROW →', jsonData.sheetDetails.updatedRow);
        } else if (jsonData.sheetDetails.newRow) {
          console.log('NEW ROW →', jsonData.sheetDetails.newRow);
        }
        
        console.log('COLUMNS →', jsonData.sheetDetails.columns || "A-H");
        console.log('OPERATION TIME →', jsonData.sheetDetails.timestamp);
        console.log('=============================');
      }
    } catch (e) {
      console.error('GAS RESP PARSE ERROR →', e);
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
    console.error('FUNCTION ERROR →', error);
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