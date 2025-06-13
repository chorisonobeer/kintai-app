/**
 * /src/components/DeployInfoModal.tsx
 * 2025-01-20T10:00+09:00
 * 変更概要: 新規追加 - デプロイ情報表示モーダル（デバッグ用）
 */
import React from 'react';

interface DeployInfoModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const DeployInfoModal: React.FC<DeployInfoModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  // デプロイ情報の取得（ビルド時に環境変数から設定される想定）
  const buildTime = import.meta.env.VITE_BUILD_TIME || new Date().toISOString();
  const gitCommit = import.meta.env.VITE_GIT_COMMIT || 'unknown';
  const gitBranch = import.meta.env.VITE_GIT_BRANCH || 'unknown';
  const deployUrl = import.meta.env.VITE_DEPLOY_URL || 'unknown';
  // const deployPrimeUrl = import.meta.env.VITE_DEPLOY_PRIME_URL || 'unknown';
  const context = import.meta.env.VITE_CONTEXT || 'unknown';
  const appVersion = import.meta.env.VITE_APP_VERSION || 'v0.1.0';
  
  // 現在時刻
  const currentTime = new Date().toISOString();
  
  // ビルドからの経過時間を計算
  const buildDate = new Date(buildTime);
  const now = new Date();
  const diffMs = now.getTime() - buildDate.getTime();
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffMinutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

  return (
    <div
      className="modal-overlay"
      onClick={onClose}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
    >
      <div
        className="modal-content"
        onClick={(e) => e.stopPropagation()}
        style={{
          backgroundColor: 'white',
          borderRadius: '8px',
          padding: '24px',
          maxWidth: '500px',
          width: '90%',
          maxHeight: '80vh',
          overflow: 'auto',
          boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
        }}
      >
        <div className="modal-header" style={{ marginBottom: '16px' }}>
          <h3 style={{ margin: 0, color: '#333', fontSize: '18px' }}>
            🚀 デプロイ情報（デバッグ用）
          </h3>
          <button
            className="modal-close"
            onClick={onClose}
            style={{
              position: 'absolute',
              top: '16px',
              right: '16px',
              background: 'none',
              border: 'none',
              fontSize: '24px',
              cursor: 'pointer',
              color: '#666',
            }}
          >
            ×
          </button>
        </div>
        
        <div className="modal-body">
          <div className="deploy-info" style={{ fontSize: '14px', lineHeight: '1.6' }}>
            <div className="info-item" style={{ marginBottom: '12px' }}>
              <strong style={{ color: '#2563eb' }}>デプロイコンテキスト:</strong>
              <br />
              <span style={{ fontFamily: 'monospace', fontSize: '13px' }}>
                {context}
              </span>
            </div>
            
            <div className="info-item" style={{ marginBottom: '12px' }}>
              <strong style={{ color: '#2563eb' }}>ビルド日時:</strong>
              <br />
              <span style={{ fontFamily: 'monospace', fontSize: '13px' }}>
                {new Date(buildTime).toLocaleString('ja-JP', {
                  year: 'numeric',
                  month: '2-digit',
                  day: '2-digit',
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit',
                  timeZone: 'Asia/Tokyo',
                })}
              </span>
            </div>
            
            <div className="info-item" style={{ marginBottom: '12px' }}>
              <strong style={{ color: '#2563eb' }}>現在時刻:</strong>
              <br />
              <span style={{ fontFamily: 'monospace', fontSize: '13px' }}>
                {new Date(currentTime).toLocaleString('ja-JP', {
                  year: 'numeric',
                  month: '2-digit',
                  day: '2-digit',
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit',
                  timeZone: 'Asia/Tokyo',
                })}
              </span>
            </div>
            
            <div className="info-item" style={{ marginBottom: '12px' }}>
              <strong style={{ color: '#2563eb' }}>ビルドからの経過時間:</strong>
              <br />
              <span style={{ color: '#059669' }}>
                {diffHours > 0 ? `${diffHours}時間 ` : ''}{diffMinutes}分
              </span>
            </div>
            
            <div className="info-item" style={{ marginBottom: '12px' }}>
              <strong style={{ color: '#2563eb' }}>デプロイURL:</strong>
              <br />
              <span style={{ fontFamily: 'monospace', fontSize: '13px', color: '#6b7280' }}>
                {deployUrl !== 'unknown' ? deployUrl : 'ローカル開発環境'}
              </span>
            </div>
            
            <div className="info-item" style={{ marginBottom: '12px' }}>
              <strong style={{ color: '#2563eb' }}>Git コミット:</strong>
              <br />
              <span style={{ fontFamily: 'monospace', fontSize: '13px', color: '#6b7280' }}>
                {gitCommit.substring(0, 8)}
              </span>
            </div>
            
            <div className="info-item" style={{ marginBottom: '12px' }}>
              <strong style={{ color: '#2563eb' }}>Git ブランチ:</strong>
              <br />
              <span style={{ fontFamily: 'monospace', fontSize: '13px', color: '#6b7280' }}>
                {gitBranch}
              </span>
            </div>
            
            <div className="info-item" style={{ marginBottom: '12px' }}>
              <strong style={{ color: '#2563eb' }}>アプリバージョン:</strong>
              <br />
              <span style={{ fontFamily: 'monospace', fontSize: '13px' }}>
                {appVersion}
              </span>
            </div>
            
            <div 
              style={{ 
                marginTop: '16px', 
                padding: '8px', 
                backgroundColor: '#fef3c7', 
                borderRadius: '4px',
                fontSize: '12px',
                color: '#92400e'
              }}
            >
              ⚠️ このモーダルはデバッグ用です。本番環境では削除してください。
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DeployInfoModal;