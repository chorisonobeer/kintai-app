import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.tsx";
import "./styles.css";
import "./styles_monthly.css"; // 月次ビュー用のスタイルを明示的にインポート

// ─── 起動計装（Performance Mark） ───
// 起動時の各段階を performance.mark で記録し、DevTools Performance タブまたは
// 下部の自動ダンプで内訳を確認できる
performance.mark("PWA:boot");
window.addEventListener("load", () => performance.mark("PWA:window-load"));
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.ready
    .then(() => performance.mark("PWA:sw-ready"))
    .catch(() => {});
}
// ─── Core Web Vitals 軽量計装（PerformanceObserver native, 依存ゼロ） ───
// LCP / FCP / INP を performance.mark に記録し、下部の自動ダンプで一緒に出力する
try {
  // LCP（Largest Contentful Paint）
  if ("PerformanceObserver" in window) {
    const lcpObserver = new PerformanceObserver((list) => {
      const entries = list.getEntries();
      const last = entries[entries.length - 1] as PerformanceEntry & {
        renderTime?: number;
        loadTime?: number;
      };
      if (last) {
        const t = last.renderTime || last.loadTime || last.startTime;
        performance.mark("PWA:LCP", { startTime: t });
      }
    });
    lcpObserver.observe({ type: "largest-contentful-paint", buffered: true });

    // FCP（First Contentful Paint）
    const fcpObserver = new PerformanceObserver((list) => {
      list.getEntries().forEach((entry) => {
        if (entry.name === "first-contentful-paint") {
          performance.mark("PWA:FCP", { startTime: entry.startTime });
        }
      });
    });
    fcpObserver.observe({ type: "paint", buffered: true });

    // INP（Interaction to Next Paint）— event timing から最大値を記録
    let maxInp = 0;
    const inpObserver = new PerformanceObserver((list) => {
      list.getEntries().forEach((entry) => {
        const e = entry as PerformanceEventTiming;
        const dur = e.duration;
        if (dur > maxInp) {
          maxInp = dur;
          performance.mark("PWA:INP-max", { startTime: dur });
        }
      });
    });
    try {
      inpObserver.observe({ type: "event", buffered: true, durationThreshold: 40 } as PerformanceObserverInit);
    } catch {
      // event timing 非対応ブラウザは無視
    }
  }
} catch {
  // Observer 未対応ブラウザは無視
}

// 20秒後にタイムラインをコンソールへダンプ（デバッグ用、PRODでも軽量）
setTimeout(() => {
  try {
    const marks = performance
      .getEntriesByType("mark")
      .filter((m) => m.name.startsWith("PWA:") || m.name.startsWith("kintai:"));
    if (marks.length) {
      // eslint-disable-next-line no-console
      console.table(
        marks.map((m) => ({ name: m.name, elapsed_ms: Math.round(m.startTime) })),
      );
    }
    const resources = performance
      .getEntriesByType("resource")
      .filter(
        (r) =>
          r.name.includes("kintai-api") ||
          r.name.includes("version.json") ||
          r.name.includes("pub?gid"),
      )
      .map((r) => ({
        name: r.name.slice(-60),
        duration_ms: Math.round(r.duration),
        transferSize: (r as PerformanceResourceTiming).transferSize,
      }));
    if (resources.length) {
      // eslint-disable-next-line no-console
      console.table(resources);
    }
  } catch {
    // 計装エラーは無視
  }
}, 20_000);

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
