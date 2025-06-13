import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.tsx";
import "./styles.css";
import "./styles_monthly.css"; // 月次ビュー用のスタイルを明示的にインポート

// Service Worker登録とバージョン管理
if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    try {
      const registration = await navigator.serviceWorker.register('/sw.js');
      console.log('Service Worker registered:', registration);
      
      // Service Workerからのメッセージを監視
      navigator.serviceWorker.addEventListener('message', (event) => {
        const { type, version } = event.data;
        
        if (type === 'NEW_VERSION_AVAILABLE') {
          console.log('New version available:', version);
          
          // ユーザーに更新を通知
          if (confirm('新しいバージョンが利用可能です。ページを更新しますか？')) {
            window.location.reload();
          }
        }
      });
      
      // バックグラウンド同期を登録
      if (registration.active) {
        registration.active.postMessage({
          type: 'REGISTER_SYNC'
        });
      }
      
    } catch (error) {
      console.error('Service Worker registration failed:', error);
    }
  });
}

// ページの可視性変更時にバージョンチェックを実行
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && 'serviceWorker' in navigator) {
    // ページがアクティブになった時にバージョンチェックを強制実行
    fetch('/version.json?t=' + Date.now(), {
      cache: 'no-cache',
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache'
      }
    }).catch(() => {
      // エラーは無視（オフライン時など）
    });
  }
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
