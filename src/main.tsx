import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.tsx";
import "./styles.css";
import "./styles_monthly.css"; // 月次ビュー用のスタイルを明示的にインポート

// VisualViewport fallback: expose dynamic viewport height as CSS var (--vvh)
const applyViewportHeightVar = () => {
  const h = window.visualViewport?.height ?? window.innerHeight;
  document.documentElement.style.setProperty("--vvh", `${Math.round(h)}px`);
};
// initialize and bind updates
applyViewportHeightVar();
window.visualViewport?.addEventListener("resize", applyViewportHeightVar);
window.visualViewport?.addEventListener("scroll", applyViewportHeightVar);
window.addEventListener("resize", applyViewportHeightVar);

// Service Workerの詳細な登録・更新フローはApp側で管理します

// ページの可視性変更時にバージョンチェックを実行
document.addEventListener("visibilitychange", () => {
  if (!document.hidden && "serviceWorker" in navigator) {
    // ページがアクティブになった時にバージョンチェックを強制実行
    fetch("/version.json?t=" + Date.now(), {
      cache: "no-cache",
      headers: {
        "Cache-Control": "no-cache, no-store, must-revalidate",
        Pragma: "no-cache",
      },
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
