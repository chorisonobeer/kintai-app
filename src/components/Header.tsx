/**
 * /src/components/Header.tsx
 * 2025-05-05T15:30+09:00
 * 変更概要: 新規追加 - 共通ヘッダーコンポーネント
 */
import React, { useState, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  getUserName,
  getVersionInfo,
  getClientVersion,
  checkVersionCompatibility,
  type VersionInfo,
} from "../utils/apiService";

interface HeaderProps {
  onLogout: () => void;
}

const Header: React.FC<HeaderProps> = ({ onLogout }) => {
  const location = useLocation();
  const userName = getUserName();
  const [versionInfo, setVersionInfo] = useState<VersionInfo | null>(null);
  const [showVersionModal, setShowVersionModal] = useState(false);
  const [versionCompatibility, setVersionCompatibility] = useState<{
    compatible: boolean;
    message?: string;
  }>({ compatible: true });
  const [longPressTimer, setLongPressTimer] = useState<NodeJS.Timeout | null>(
    null,
  );

  useEffect(() => {
    // バージョン情報を取得
    const fetchVersionInfo = async () => {
      try {
        const info = await getVersionInfo();
        setVersionInfo(info);

        // バージョン互換性をチェック
        const compatibility = checkVersionCompatibility();
        setVersionCompatibility(compatibility);
      } catch (error) {
        console.error("バージョン情報の取得に失敗:", error);
      }
    };

    fetchVersionInfo();
  }, []);

  // 長押し開始
  const handleLongPressStart = () => {
    const timer = setTimeout(() => {
      setShowVersionModal(true);
    }, 3000); // 3秒
    setLongPressTimer(timer);
  };

  // 長押し終了
  const handleLongPressEnd = () => {
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      setLongPressTimer(null);
    }
  };

  return (
    <div className="app-header">
      {/* バージョン互換性警告 */}
      {!versionCompatibility.compatible && (
        <div className="version-warning">⚠️ {versionCompatibility.message}</div>
      )}

      {/* 1行目：ユーザー名、タイトル、バージョン、ログアウト */}
      <div className="top-header">
        <div className="user-info">
          <span className="user-name">{userName}</span>
        </div>
        <h1
          onMouseDown={handleLongPressStart}
          onMouseUp={handleLongPressEnd}
          onMouseLeave={handleLongPressEnd}
          onTouchStart={handleLongPressStart}
          onTouchEnd={handleLongPressEnd}
          style={{ cursor: "default", userSelect: "none" }}
          title="3秒長押しでバージョン情報を表示"
        >
          勤怠管理
        </h1>
        <div className="header-right">
          <button className="logout-button" onClick={onLogout}>
            ログアウト
          </button>
        </div>
      </div>

      {/* 2行目：ナビゲーション */}
      <div className="nav-tabs">
        <Link
          to="/"
          className={`tab-button ${location.pathname === "/" ? "active" : ""}`}
        >
          日次入力
        </Link>
        <Link
          to="/monthly"
          className={`tab-button ${location.pathname === "/monthly" ? "active" : ""}`}
        >
          月次ビュー
        </Link>
      </div>

      {/* バージョン情報モーダル */}
      {showVersionModal && (
        <div
          className="modal-overlay"
          onClick={() => setShowVersionModal(false)}
        >
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>バージョン情報</h3>
              <button
                className="modal-close"
                onClick={() => setShowVersionModal(false)}
              >
                ×
              </button>
            </div>
            <div className="modal-body">
              <div className="version-info">
                <div className="version-item">
                  <strong>アプリバージョン:</strong> {getClientVersion()}
                </div>
                <div className="version-item">
                  <strong>サーバーバージョン:</strong>{" "}
                  {versionInfo?.version || "N/A"}
                </div>
                <div className="version-item">
                  <strong>最終更新:</strong>{" "}
                  {versionInfo?.timestamp
                    ? new Date(versionInfo.timestamp).toLocaleString("ja-JP")
                    : "N/A"}
                </div>
                <div className="version-item">
                  <strong>説明:</strong> {versionInfo?.description || "N/A"}
                </div>
                <div className="version-item">
                  <strong>互換性:</strong>{" "}
                  <span
                    style={{
                      color: versionCompatibility.compatible
                        ? "green"
                        : "red",
                    }}
                  >
                    {versionCompatibility.compatible
                      ? "✓ 互換性あり"
                      : "✗ 互換性なし"}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Header;
