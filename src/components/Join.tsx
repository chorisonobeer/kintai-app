import React, { useState } from "react";
import { findCustomerByCode } from "../utils/apiService";

interface JoinProps {
  onJoinSuccess: (customerInfo: CustomerInfo) => void;
}

interface CustomerInfo {
  customerCode: string;
  serverName: string;
  spreadsheetId: string;
}

const Join: React.FC<JoinProps> = ({ onJoinSuccess }) => {
  const [serverName, setServerName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [debugInfo, setDebugInfo] = useState<any>(null);
  const [showDebug, setShowDebug] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!serverName.trim()) {
      setError("サーバー名を入力してください");
      return;
    }

    setIsLoading(true);
    setError(null);
    setDebugInfo(null);

    const startTime = Date.now();
    const debugData: any = {
      timestamp: new Date().toISOString(),
      input: { serverName: serverName.trim() },
      environment: {
        isDev: import.meta.env.DEV,
        mode: import.meta.env.MODE,
        baseUrl: import.meta.env.BASE_URL,
      },
    };

    try {
      // デバッグモードの場合のみログ出力
      const isDebugMode = localStorage.getItem("kintai_debug_mode") === "true";
      if (isDebugMode) {
        console.log("🔍 サーバー検索開始:", debugData);
      }

      const result = await findCustomerByCode(serverName.trim());

      const endTime = Date.now();
      debugData.duration = `${endTime - startTime}ms`;
      debugData.result = {
        success: result.success,
        data: result.success && "data" in result ? result.data || null : null,
        error:
          !result.success && "error" in result ? result.error || null : null,
      };

      setDebugInfo(debugData);

      if (isDebugMode) {
        console.log("🔍 サーバー検索結果:", debugData);
      }

      if (result.success && result.data) {
        if (isDebugMode) {
          console.log("✅ サーバー検索成功 - onJoinSuccess()を呼び出します");
        }

        // サーバー情報をローカルストレージに保存
        localStorage.setItem("kintai_server_info", JSON.stringify(result.data));

        onJoinSuccess(result.data);
      } else {
        if (isDebugMode) {
          console.log(
            "❌ サーバー検索失敗:",
            !result.success && "error" in result
              ? result.error
              : "Unknown error",
          );
        }
        setError(
          !result.success && "error" in result
            ? result.error || "サーバーが見つかりませんでした"
            : "サーバーが見つかりませんでした",
        );
      }
    } catch (err) {
      const endTime = Date.now();
      debugData.duration = `${endTime - startTime}ms`;
      debugData.error = {
        message: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined,
        type: err instanceof Error ? err.constructor.name : typeof err,
      };

      setDebugInfo(debugData);

      const isDebugMode = localStorage.getItem("kintai_debug_mode") === "true";
      if (isDebugMode) {
        console.error("🚨 サーバー検索エラー:", debugData);
      }
      setError("通信エラーが発生しました");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="kintai-form">
      <h2 className="join-title">サーバー選択</h2>
      <p className="join-description">
        勤怠管理を行うサーバー名を入力してください
      </p>

      {error && <div className="error-message">{error}</div>}

      {/* デバッグモード切り替え */}
      <div className="debug-controls">
        <label className="debug-mode-toggle">
          <input
            type="checkbox"
            checked={localStorage.getItem("kintai_debug_mode") === "true"}
            onChange={(e) => {
              localStorage.setItem(
                "kintai_debug_mode",
                e.target.checked ? "true" : "false",
              );
              if (!e.target.checked) {
                setDebugInfo(null);
                setShowDebug(false);
              }
            }}
          />
          デバッグモード
        </label>
      </div>

      {/* デバッグ情報表示エリア */}
      {debugInfo && localStorage.getItem("kintai_debug_mode") === "true" && (
        <div className="debug-section">
          <button
            type="button"
            onClick={() => setShowDebug(!showDebug)}
            className="debug-toggle"
          >
            {showDebug ? "デバッグ情報を隠す" : "デバッグ情報を表示"}
          </button>

          {showDebug && (
            <div className="debug-info">
              <h3>🔍 サーバー検索デバッグ情報</h3>
              <pre>{JSON.stringify(debugInfo, null, 2)}</pre>
            </div>
          )}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label htmlFor="serverName">サーバー名</label>
          <div className="input-wrapper">
            <input
              type="text"
              id="serverName"
              value={serverName}
              onChange={(e) => setServerName(e.target.value)}
              disabled={isLoading}
              placeholder="例: company-server-01"
              className="join-input"
              autoComplete="off"
            />
          </div>
        </div>

        <div className="button-container">
          <button
            type="submit"
            className="btn btn-primary"
            disabled={isLoading}
          >
            {isLoading ? "検索中..." : "サーバーを検索"}
          </button>
        </div>
      </form>

      <div className="join-help">
        <h3>サーバー名について</h3>
        <ul>
          <li>管理者から提供されたサーバー名を正確に入力してください</li>
          <li>大文字・小文字は区別されません</li>
          <li>サーバー名が見つからない場合は、管理者にお問い合わせください</li>
        </ul>
      </div>
    </div>
  );
};

export default Join;

// Join画面用スタイル
const joinStyles = `
.join-title {
  text-align: center;
  color: #333;
  margin-bottom: 8px;
  font-size: 24px;
}

.join-description {
  text-align: center;
  color: #666;
  margin-bottom: 24px;
  font-size: 14px;
}

.join-input {
  width: 100%;
  padding: 12px;
  border: 2px solid #ddd;
  border-radius: 6px;
  font-size: 16px;
  transition: border-color 0.3s ease;
}

.join-input:focus {
  outline: none;
  border-color: #007bff;
  box-shadow: 0 0 0 3px rgba(0, 123, 255, 0.1);
}

.btn-primary {
  background: #007bff;
  color: white;
  border: none;
  padding: 12px 24px;
  border-radius: 6px;
  font-size: 16px;
  cursor: pointer;
  transition: background-color 0.3s ease;
  width: 100%;
}

.btn-primary:hover:not(:disabled) {
  background: #0056b3;
}

.btn-primary:disabled {
  background: #6c757d;
  cursor: not-allowed;
}

.join-help {
  margin-top: 32px;
  padding: 16px;
  background: #f8f9fa;
  border-radius: 6px;
  border: 1px solid #e9ecef;
}

.join-help h3 {
  margin: 0 0 12px 0;
  color: #495057;
  font-size: 16px;
}

.join-help ul {
  margin: 0;
  padding-left: 20px;
}

.join-help li {
  margin-bottom: 8px;
  color: #6c757d;
  font-size: 14px;
  line-height: 1.4;
}

.debug-controls {
  margin: 10px 0;
  padding: 10px;
  background: #f8f9fa;
  border-radius: 4px;
  border: 1px solid #e9ecef;
}

.debug-mode-toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  cursor: pointer;
}

.debug-mode-toggle input[type="checkbox"] {
  margin: 0;
}

.debug-section {
  margin: 15px 0;
  padding: 10px;
  background: #f8f9fa;
  border-radius: 4px;
  border: 1px solid #e9ecef;
}

.debug-toggle {
  background: #6c757d;
  color: white;
  border: none;
  padding: 8px 12px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
}

.debug-toggle:hover {
  background: #5a6268;
}

.debug-info {
  margin-top: 10px;
  padding: 15px;
  background: #ffffff;
  border: 1px solid #dee2e6;
  border-radius: 4px;
  max-height: 400px;
  overflow: auto;
}

.debug-info h3 {
  margin: 0 0 10px 0;
  color: #495057;
  font-size: 14px;
}

.debug-info pre {
  margin: 0;
  font-size: 11px;
  font-family: 'Courier New', monospace;
  white-space: pre-wrap;
  word-wrap: break-word;
}
`;

// スタイルを動的に追加
if (typeof document !== "undefined") {
  const styleElement = document.createElement("style");
  styleElement.textContent = joinStyles;
  document.head.appendChild(styleElement);
}
