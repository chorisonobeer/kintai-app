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
  versionUpdateProgress?: number;
  isVersionUpdating?: boolean;
}

const Header: React.FC<HeaderProps> = ({ onLogout, versionUpdateProgress = 0, isVersionUpdating = false }) => {
  const location = useLocation();
  const userName = getUserName();
  const [showVersionModal, setShowVersionModal] = useState(false);
  const [showDeployInfoModal, setShowDeployInfoModal] = useState(false);
  const [longPressTimer, setLongPressTimer] = useState<NodeJS.Timeout | null>(
    null
  );
  const [longPressProgress, setLongPressProgress] = useState(0);
  const [isLongPressing, setIsLongPressing] = useState(false);
  const longPressIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const [longPressTriggered, setLongPressTriggered] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // 長押し開始（3秒でデプロイ情報モーダル）
  const handleLongPressStart = () => {
    const timer = setTimeout(() => {
      setShowDeployInfoModal(true);
      setLongPressTriggered(true);
    }, 3000); // 3秒
    setLongPressTimer(timer);
    setIsLongPressing(true);
    setLongPressProgress(0);

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

  // タイトルクリック（短押し）で手動更新チェック
  const manualUpdateCheck = async () => {
    if (location.pathname !== "/") return; // 日次画面のみ
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      try { await reg?.update(); } catch {}
      if (reg?.active) {
        reg.active.postMessage({ type: "CHECK_FOR_UPDATES" });
      }
      // フォールバック: version.json とクライアントのビルド時刻を比較
      const resp = await fetch(`/version.json?t=${Date.now()}`, {
        cache: "no-cache",
        headers: { "Cache-Control": "no-cache, no-store, must-revalidate" },
      });
      if (resp.ok) {
        const server = await resp.json();
        const clientBuildTime = import.meta.env.VITE_BUILD_TIME as string | undefined;
        if (clientBuildTime && server?.buildTime && server.buildTime !== clientBuildTime) {
          window.location.reload();
          return;
        }
      }
      setToastMessage("最新です");
      setTimeout(() => setToastMessage(null), 2000);
    } catch (error) {
      setToastMessage("更新確認に失敗しました");
      setTimeout(() => setToastMessage(null), 2500);
    }
  };

  const handleTitleClick = () => {
    if (longPressTriggered) {
      // 長押し後のクリックは無視（ダブルトリガ防止）
      setLongPressTriggered(false);
      return;
    }
    manualUpdateCheck();
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
      {isVersionUpdating && (
        <div className="version-update-progress-bar">
          <div 
            className="version-update-progress-fill"
            style={{ width: `${versionUpdateProgress}%` }}
          />
        </div>
      )}

      {/* 簡易トースト */}
      {toastMessage && (
        <div
          style={{
            position: "fixed",
            top: 8,
            left: "50%",
            transform: "translateX(-50%)",
            backgroundColor: "rgba(0,0,0,0.8)",
            color: "#fff",
            padding: "6px 12px",
            borderRadius: 12,
            fontSize: 12,
            zIndex: 1000,
          }}
        >
          {toastMessage}
        </div>
      )}

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
          onClick={handleTitleClick}
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
          title="タップで更新確認 / 3秒長押しでデプロイ情報表示"
        >
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
            Logout
          </button>
        </div>
      </div>

      <div className="nav-tabs">
        <Link
          to="/"
          className={`tab-button ${location.pathname === "/" ? "active" : ""}`}
        >
          日次入力 / Daily
        </Link>
        <Link
          to="/monthly"
          className={`tab-button ${location.pathname === "/monthly" ? "active" : ""}`}
        >
          月次ビュー / Monthly
        </Link>
      </div>

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
              </div>
            </div>
          </div>
        </div>
      )}

      <DeployInfoModal
        isOpen={showDeployInfoModal}
        onClose={() => setShowDeployInfoModal(false)}
      />
    </div>
  );
};

export default Header;
