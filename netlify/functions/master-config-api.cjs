/**
 * Netlify Function for Master Config API
 * GAS (Google Apps Script) のMaster Config APIへのプロキシ
 */

const { https } = require("follow-redirects"); // To handle redirects from GAS
const { URL } = require("url");

// 環境変数からMaster Config GAS APIのURLを取得
const MASTER_CONFIG_GAS_API_URL =
  process.env.MASTER_CONFIG_GAS_API_URL ||
  "https://script.google.com/macros/s/AKfycbzOb7Pjukgsk5nyjjl5uaDtGPgHxHIooOHxjHrmGpvNfk1e-8vm_UvSYDg1pZ4QAu4J/exec";

/**
 * HTTPSリクエストを送信する関数
 * @param {string} url - リクエスト先URL
 * @param {Object} options - リクエストオプション
 * @param {string} postData - POSTデータ（オプション）
 * @returns {Promise<Object>} レスポンスデータ
 */
function makeHttpsRequest(url, options, postData = null) {
  console.log("[DEBUG] makeHttpsRequest: URL:", url);
  console.log(
    "[DEBUG] makeHttpsRequest: Options:",
    JSON.stringify(options, null, 2)
  );
  if (postData) {
    console.log(
      "[DEBUG] makeHttpsRequest: PostData Preview:",
      postData.substring(0, 200)
    );
  }
  return new Promise((resolve, reject) => {
    const req = https.request(url, options, (res) => {
      console.log("[DEBUG] GAS Response Status:", res.statusCode);
      console.log(
        "[DEBUG] GAS Response Headers:",
        JSON.stringify(res.headers, null, 2)
      );
      let data = "";
      res.on("data", (chunk) => {
        data += chunk;
      });
      res.on("end", () => {
        console.log(
          "[DEBUG] GAS Response Body Preview:",
          data.substring(0, 200)
        );
        try {
          const jsonData = data ? JSON.parse(data) : {};
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            data: jsonData,
          });
        } catch (error) {
          console.error(
            "[ERROR] JSON parse error in makeHttpsRequest:",
            data,
            error
          );
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            data: {
              error: "Invalid JSON response from upstream",
              rawData: data,
              details: error.message,
            },
          });
        }
      });
    });

    req.on("error", (error) => {
      console.error("[ERROR] Request error in makeHttpsRequest:", error);
      reject(error);
    });

    // Log redirect attempts if follow-redirects provides such events
    // This part is speculative as 'follow-redirects' might not emit 'redirect' event on the request object directly
    // or it might be on the response. Check documentation if more detailed redirect logging is needed.
    req.on("response", (response) => {
      if (response.responseUrl && response.responseUrl !== url) {
        console.log(
          `[DEBUG] Redirected: Original URL: ${url}, Final URL: ${response.responseUrl}`
        );
      }
    });

    if (postData) {
      req.write(postData);
    }

    req.end();
  });
}

/**
 * Netlify Function のメインハンドラー
 * @param {Object} event - Netlify event object
 * @param {Object} context - Netlify context object
 * @returns {Promise<Object>} レスポンス
 */
exports.handler = async (event, context) => {
  console.log("\n[DEBUG] Netlify Function Invoked");
  console.log("[DEBUG] Event HTTP Method:", event.httpMethod);
  console.log("[DEBUG] Event Path:", event.path);
  console.log(
    "[DEBUG] Event QueryStringParameters:",
    JSON.stringify(event.queryStringParameters, null, 2)
  );
  console.log("[DEBUG] Event Headers:", JSON.stringify(event.headers, null, 2));
  console.log(
    "[DEBUG] Event Body Preview:",
    event.body ? event.body.substring(0, 200) : "No body"
  );

  const baseHeaders = {
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers":
      "Content-Type, Authorization, X-Requested-With, Origin, Accept",
    // 'Content-Type': 'application/json' // This will be set based on GAS response or default to JSON
  };

  // OPTIONSリクエスト（プリフライト）の処理
  if (event.httpMethod === "OPTIONS") {
    const optionsResponseHeaders = {
      ...baseHeaders,
      "Access-Control-Allow-Origin": event.headers.origin || "*", // Dynamically set origin or fallback to wildcard
      "Access-Control-Max-Age": "86400", // Cache preflight response for 1 day
      "Content-Length": "0", // Required for 204
    };
    console.log(
      "[DEBUG] OPTIONS Request - Responding with Headers:",
      JSON.stringify(optionsResponseHeaders, null, 2)
    );
    return {
      statusCode: 204, // Standard for preflight
      headers: optionsResponseHeaders,
      body: "", // Empty body for 204
    };
  }

  try {
    let gasResponse;
    const requestHeadersForGas = {
      // Forward essential headers. Be cautious about forwarding all headers due to security.
      ...(event.headers.authorization && {
        Authorization: event.headers.authorization,
      }),
      // ...(event.headers["content-type"] && { // クライアントのContent-Typeを引き継がないようにコメントアウト
      //   "Content-Type": event.headers["content-type"],
      // }),
      // Add any other specific headers you need to pass to GAS
    };

    if (event.httpMethod === "GET") {
      const queryParams = new URLSearchParams(
        event.queryStringParameters || {}
      );
      const targetUrl = `${MASTER_CONFIG_GAS_API_URL}?${queryParams.toString()}`;
      console.log(`[DEBUG] GET Request to GAS: ${targetUrl}`);
      gasResponse = await makeHttpsRequest(targetUrl, {
        method: "GET",
        headers: requestHeadersForGas,
      });
    } else if (event.httpMethod === "POST") {
      let requestDataForGas;
      let action;
      let payload;

      try {
        // Attempt to parse the incoming body as JSON. This is what apiService.ts sends.
        const parsedBody = JSON.parse(event.body || '{}');
        action = parsedBody.action;
        payload = parsedBody.payload;

        // Re-stringify it for GAS, which expects a plain text JSON string in e.postData.contents
        requestDataForGas = JSON.stringify({ action, payload });
        console.log("[DEBUG] Netlify to GAS - Parsed and Re-stringified Body for GAS:", requestDataForGas);

      } catch (e) {
        // If parsing fails, it might be a direct call (like from test script) that already has the correct format.
        // However, our apiService.ts sends a JSON object that needs action/payload extraction.
        // For now, let's assume the primary client (apiService.ts) sends a parsable JSON.
        // If it's already a string meant for GAS, this block might need adjustment.
        // For robustness, we could check if event.body is already a stringified JSON with 'action'.
        console.warn("[WARN] Failed to parse event.body as JSON, or action/payload missing. Treating body as is for GAS.", event.body);
        // Fallback: use the body as is, assuming it's already in the format GAS expects (e.g. from a direct test call)
        // This path is less likely for calls from Join.tsx via apiService.ts
        requestDataForGas = event.body || ""; 
      }

      console.log(`[DEBUG] POST Request to GAS: ${MASTER_CONFIG_GAS_API_URL}`);
      const finalHeadersForGas = {
        'Content-Type': 'text/plain', // GAS doPost expects text/plain for e.postData.contents
        'Content-Length': Buffer.byteLength(requestDataForGas),
      };
      console.log(
        "[DEBUG] Netlify to GAS - Request Headers:",
        JSON.stringify(finalHeadersForGas, null, 2)
      );
      console.log(
        "[DEBUG] Netlify to GAS - Final Request Body String:",
        requestDataForGas
      ); 

      gasResponse = await makeHttpsRequest(
        MASTER_CONFIG_GAS_API_URL,
        {
          method: "POST",
          headers: finalHeadersForGas,
        },
        requestDataForGas
      );
    } else {
      console.log(`[WARN] Method Not Allowed: ${event.httpMethod}`);
      const methodNotAllowedHeaders = {
        ...baseHeaders,
        "Access-Control-Allow-Origin": event.headers.origin || "*",
        "Content-Type": "application/json",
      };
      return {
        statusCode: 405,
        headers: methodNotAllowedHeaders,
        body: JSON.stringify({ error: "Method Not Allowed" }),
      };
    }

    console.log("[DEBUG] GAS Response Status Code:", gasResponse.statusCode);
    console.log(
      "[DEBUG] GAS Response Headers (Raw):",
      JSON.stringify(gasResponse.headers, null, 2)
    );

    // Construct response headers, prioritizing GAS headers for CORS if present
    const finalResponseHeaders = {
      ...baseHeaders,
      "Access-Control-Allow-Origin":
        gasResponse.headers &&
        gasResponse.headers["access-control-allow-origin"]
          ? gasResponse.headers["access-control-allow-origin"]
          : event.headers.origin || "*", // Fallback to request origin or wildcard
      "Content-Type":
        gasResponse.headers && gasResponse.headers["content-type"]
          ? gasResponse.headers["content-type"]
          : "application/json", // Default to application/json
      // Ensure other necessary CORS headers from GAS are passed through or added
      ...(gasResponse.headers &&
        gasResponse.headers["access-control-allow-credentials"] && {
          "Access-Control-Allow-Credentials":
            gasResponse.headers["access-control-allow-credentials"],
        }),
    };

    // Add other non-CORS headers from GAS if they exist and are not security sensitive
    if (gasResponse.headers) {
      for (const key in gasResponse.headers) {
        const lowerKey = key.toLowerCase();
        if (
          Object.prototype.hasOwnProperty.call(gasResponse.headers, key) &&
          !finalResponseHeaders[key] && // Avoid overwriting already set headers
          !lowerKey.startsWith("access-control-") && // Don't overwrite our carefully set CORS headers unless it's the origin
          ![
            "set-cookie",
            "server",
            "x-google- μεγάλο-μυστικό",
            "content-length",
            "connection",
            "transfer-encoding",
          ].includes(lowerKey)
        ) {
          // Blacklist
          finalResponseHeaders[key] = gasResponse.headers[key];
        }
      }
    }

    console.log(
      "[DEBUG] Final Response Headers to Client:",
      JSON.stringify(finalResponseHeaders, null, 2)
    );
    console.log(
      "[DEBUG] Final Response Body to Client Preview:",
      typeof gasResponse.data === "string"
        ? gasResponse.data.substring(0, 200)
        : JSON.stringify(gasResponse.data).substring(0, 200)
    );

    return {
      statusCode: gasResponse.statusCode,
      headers: finalResponseHeaders,
      body:
        typeof gasResponse.data === "string"
          ? gasResponse.data
          : JSON.stringify(gasResponse.data),
    };
  } catch (error) {
    console.error(
      "[ERROR] Netlify Function Handler Error:",
      error.message,
      error.stack,
      error
    );
    const errorResponseHeaders = {
      ...baseHeaders,
      "Access-Control-Allow-Origin": event.headers.origin || "*",
      "Content-Type": "application/json",
    };
    return {
      statusCode: error.statusCode || 500,
      headers: errorResponseHeaders,
      body: JSON.stringify({
        error: "Proxying error in Netlify Function",
        message: error.message,
        details: error.toString(),
        stack: error.stack, // Include stack for debugging if appropriate
      }),
    };
  }
};
