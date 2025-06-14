/**
 * /src/components/Header.tsx
 * 2025-05-05T15:30+09:00
 * 変更概要: 新規追加 - 共通ヘッダーコンポーネント
 * 2025-01-20T10:00+09:00
 * 変更概要: デプロイ情報モーダル機能追加（デバッグ用）
 */
import React, { useState, useEffect, useRef } from "react";
import { Link, useLocation } from "react-router-dom";
import { getUserName } from "../utils/apiService";
import DeployInfoModal from "./DeployInfoModal";

interface HeaderProps {
  onLogout: () => void;
}

const Header: React.FC<HeaderProps> = ({ onLogout }) => {
  const location = useLocation();
  const userName = getUserName();
  // const [versionInfo, setVersionInfo] = useState<VersionInfo | null>(null);
  const [showVersionModal, setShowVersionModal] = useState(false);
  const [showDeployInfoModal, setShowDeployInfoModal] = useState(false);
  // const [versionCompatibility, setVersionCompatibility] = useState<{
  //   compatible: boolean;
  //   message?: string;
  // }>({ compatible: true });
  const [longPressTimer, setLongPressTimer] = useState<NodeJS.Timeout | null>(
    null
  );
  const [longPressProgress, setLongPressProgress] = useState(0);
  const [isLongPressing, setIsLongPressing] = useState(false);
  const longPressIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // useEffect(() => {
  //   // バージョン情報を取得
  //   const fetchVersionInfo = async () => {
  //     console.log("=== Header: バージョン情報取得開始 ===");
  //     try {
  //       console.log("getVersionInfo() を呼び出し中...");
  //       const info = await getVersionInfo();
  //       console.log("取得したバージョン情報:", info);
  //       setVersionInfo(info);

  //       // バージョン互換性をチェック
  //       console.log("バージョン互換性チェック中...");
  //       const compatibility = checkVersionCompatibility();
  //       console.log("互換性チェック結果:", compatibility);
  //       setVersionCompatibility(compatibility);

  //       console.log("=== Header: バージョン情報取得完了 ===");
  //     } catch (error) {
  //       console.error("=== Header: バージョン情報の取得に失敗 ===", error);
  //       console.error("エラーの詳細:", {
  //         message: (error as Error).message,
  //         stack: (error as Error).stack,
  //       });
  //     }
  //   };

  //   fetchVersionInfo();
  // }, []);

  // 長押し開始
  const handleLongPressStart = () => {
    const timer = setTimeout(() => {
      setShowVersionModal(true);
    }, 3000); // 3秒
    setLongPressTimer(timer);
    setIsLongPressing(true);
    setLongPressProgress(0);

    // プログレスバーのアニメーション
    const startTime = Date.now();
    const duration = 3000; // 3秒

    const updateProgress = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min((elapsed / duration) * 100, 100);
      setLongPressProgress(progress);

      if (progress < 100 && longPressTimer) {
        longPressIntervalRef.current = setTimeout(updateProgress, 16); // 60fps
      }
    };

    updateProgress();
  };

  // 長押し終了
  const handleLongPressEnd = () => {
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      setLongPressTimer(null);
    }
    setIsLongPressing(false);
    setLongPressProgress(0);

    if (longPressIntervalRef.current) {
      clearTimeout(longPressIntervalRef.current);
      longPressIntervalRef.current = null;
    }
  };

  // コンポーネントのクリーンアップ
  useEffect(() => {
    return () => {
      if (longPressIntervalRef.current) {
        clearTimeout(longPressIntervalRef.current);
      }
    };
  }, []);

  return (
    <div className="app-header">
      {/* バージョン互換性警告 */}
      {/* {!versionCompatibility.compatible && (
        <div className="version-warning">⚠️ {versionCompatibility.message}</div>
      )} */}

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
          onClick={() => setShowDeployInfoModal(true)}
          style={{
            cursor: "pointer",
            userSelect: "none",
            position: "relative",
            overflow: "hidden",
            backgroundColor: isLongPressing
              ? `rgba(255, 255, 255, ${0.1 + (longPressProgress / 100) * 0.2})`
              : "transparent",
            borderRadius: "4px",
            padding: "4px 8px",
            transition: isLongPressing ? "none" : "background-color 0.2s ease",
          }}
          title="タップでデプロイ情報を表示 / 3秒長押しでバージョン情報を表示"
        >
          {/* プログレスバー */}
          {isLongPressing && (
            <div
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                height: "100%",
                width: `${longPressProgress}%`,
                background:
                  "linear-gradient(90deg, rgba(255,255,255,0.2) 0%, rgba(255,255,255,0.4) 100%)",
                transition: "none",
                pointerEvents: "none",
                zIndex: 1,
              }}
            />
          )}
          <span style={{ position: "relative", zIndex: 2 }}>勤怠管理</span>
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
                  <strong>
                    バージョン情報機能は一時的に無効化されています
                  </strong>
                </div>
                {/* <div className="version-item">
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
                      color: versionCompatibility.compatible ? "green" : "red",
                    }}
                  >
                    {versionCompatibility.compatible
                      ? "✓ 互換性あり"
                      : "✗ 互換性なし"}
                  </span>
                </div> */}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* デプロイ情報モーダル（デバッグ用） */}
      <DeployInfoModal
        isOpen={showDeployInfoModal}
        onClose={() => setShowDeployInfoModal(false)}
      />
    </div>
  );
};

export default Header;
