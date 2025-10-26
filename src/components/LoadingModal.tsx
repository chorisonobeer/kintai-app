import React from "react";

interface LoadingModalProps {
  isOpen: boolean;
  message?: string;
  subMessage?: string;
  /** 読み込み時(true) / 書き込み時(false) でアイコンなどを出し分け可能 */
  isLoading?: boolean;
}

const LoadingModal: React.FC<LoadingModalProps> = ({
  isOpen,
  message = "処理中... / Processing...",
  subMessage,
  isLoading = true,
}) => {
  if (!isOpen) return null;

  return (
    <div className="modal-overlay" style={{ zIndex: 3000 }}>
      <div className="modal-content" style={{ maxWidth: 420 }}>
        <div className="modal-header">
          <h3>{isLoading ? "読み込み中 / Loading" : "書き込み中 / Writing"}</h3>
          {/* モーダルはブロッキング用途のため閉じるボタンは非表示 */}
          <button className="modal-close" style={{ visibility: "hidden" }}>×</button>
        </div>
        <div className="modal-body" style={{ textAlign: "center" }}>
          <div className="loading-spinner" style={{ margin: "12px auto" }} />
          <div style={{ fontSize: "1rem", marginTop: 8 }}>{message}</div>
          {subMessage && (
            <div style={{ color: "#6b7280", fontSize: "0.9rem", marginTop: 6 }}>
              {subMessage}
            </div>
          )}
          <div style={{ marginTop: 14, fontSize: "0.85rem", color: "#9ca3af" }}>
            画面を閉じずにお待ちください / Please wait without leaving this page
          </div>
        </div>
      </div>
    </div>
  );
};

export default LoadingModal;