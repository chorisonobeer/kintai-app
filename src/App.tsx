/**
 * /src/App.tsx
 * 2025-11-07T12:42+09:00
 * 変更概要: 起動時のバージョン確認モーダルを撤去し、更新あり時のみ最小表示
 */
import React, { useEffect, useRef, useState } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import KintaiForm from "./components/KintaiForm";
import Login from "./components/Login";
import MonthlyView from "./components/MonthlyView";
import Header from "./components/Header";
import InstallPromptBanner from "./components/InstallPromptBanner";
import LoadingModal from "./components/LoadingModal";
import Toast from "./components/Toast";
import {
  isAuthenticated,
  logout,
  initPendingSaveQueue,
} from "./utils/apiService";
import { KintaiProvider } from "./contexts/KintaiContext";
import { backgroundSyncManager } from "./utils/backgroundSync";

// 認証保護ルート用のラッパーコンポーネント
const ProtectedRoute: React.FC<{ element: React.ReactNode }> = ({ element }) =>
  isAuthenticated() ? <>{element}</> : <Navigate to="/login" replace />;

const App: React.FC = () => {
  // バージョン更新プログレスバーの状態管理
  // 旧更新プログレス関連の状態は廃止（Headerには未指定で渡す）
  // 更新適用時のみモーダルを表示（最小表示）
  const [showVersionCheckModal, setShowVersionCheckModal] = useState(false);
  const [versionModalMessage, setVersionModalMessage] = useState<string>("");
  const swRegistrationRef = useRef<ServiceWorkerRegistration | null>(null);

  // アプリ起動時にlocalStorageの整合性をチェック
  useEffect(() => {
    // アプリ起動時チェック
    // 認証が必要なページで認証情報が不完全な場合は強制ログアウト
    if (window.location.pathname !== "/login" && !isAuthenticated()) {
      logout();
      window.location.href = "/login";
    }

    // 前回の APPLY_UPDATE で埋めたフラグをチェック → 24h以内なら軽量通知
    try {
      const updatedAt = localStorage.getItem("kintai_updated_at");
      if (updatedAt) {
        const elapsed = Date.now() - parseInt(updatedAt, 10);
        if (elapsed > 0 && elapsed < 24 * 60 * 60 * 1000) {
          // eslint-disable-next-line no-console
          console.info("[kintai] 新しいバージョンに更新されました");
        }
        localStorage.removeItem("kintai_updated_at");
      }
    } catch {
      // localStorage エラーは無視
    }

    // 起動時の強制バージョン同期: HTML 埋め込みの build-time と
    // サーバー最新 version.json の buildTime を比較し、ずれていれば
    // SW キャッシュ全削除 + リロード（PWA は常に最新で起動）。
    // 一致時は何もしない（無限リロード防止）。
    forceLatestOnLaunch();

    // Service Workerの登録とバックグラウンド同期の初期化
    initializeServiceWorker();

    // v12 楽観的更新: 起動時に pending queue を flush + online listener 登録
    initPendingSaveQueue();
  }, []);

  // 起動時バージョン同期: HTML meta build-time と server version.json を突合。
  // 不一致 = 古い HTML/JS で起動している → キャッシュ全削除 + reload。
  // 一致 = 既に最新 → 何もせず通常起動。
  const forceLatestOnLaunch = async () => {
    try {
      const meta = document.querySelector('meta[name="build-time"]');
      const htmlBuildTime = meta?.getAttribute("content") || "";
      const res = await fetch("/version.json?t=" + Date.now(), {
        cache: "no-store",
        headers: {
          "Cache-Control": "no-cache, no-store, must-revalidate",
          Pragma: "no-cache",
        },
      });
      if (!res.ok) return;
      const data = (await res.json()) as { buildTime?: string };
      const serverBuildTime = data?.buildTime || "";
      if (!htmlBuildTime || !serverBuildTime) return;
      if (htmlBuildTime === serverBuildTime) return;

      // 不一致: 古い HTML/JS が動いている。SW キャッシュ全削除 + 強制リロード。
      try {
        if ("caches" in window) {
          const names = await caches.keys();
          await Promise.all(
            names
              .filter((n) => n.startsWith("kintai-app-"))
              .map((n) => caches.delete(n)),
          );
        }
      } catch {
        // キャッシュ削除失敗は無視（reload で次回再取得される）
      }
      if (!window.__kintaiReloading) {
        window.__kintaiReloading = true;
        window.location.reload();
      }
    } catch {
      // ネットワーク失敗時は通常起動
    }
  };

  // Service Worker初期化処理
  const initializeServiceWorker = async () => {
    if ("serviceWorker" in navigator) {
      try {
        performance.mark("PWA:sw-register-start");
        // updateViaCache: 'none' = SW スクリプト自体を毎回ネットワーク fetch。
        // iOS Safari PWA で /sw.js が HTTP キャッシュから返って更新が保留される
        // 事故を防ぐ。
        const registration = await navigator.serviceWorker.register("/sw.js", {
          updateViaCache: "none",
        });
        performance.mark("PWA:sw-registered");

        // 起動時に SW の更新チェックを明示要求（iOS PWA 24h 遅延対策）
        try {
          await registration.update();
        } catch {
          // update 失敗は無視（既に最新の場合や一時的なネットワーク失敗）
        }

        // 新 SW が controlling に切り替わったら自動 reload。
        // ハッシュ付き bundle が古いまま動き続けるのを防ぐ最後の砦。
        navigator.serviceWorker.addEventListener("controllerchange", () => {
          if (window.__kintaiReloading) return;
          window.__kintaiReloading = true;
          window.location.reload();
        });

        // メッセージ受信リスナー
        navigator.serviceWorker.addEventListener(
          "message",
          handleServiceWorkerMessage,
        );

        // 認証済みユーザーの場合、バックグラウンド同期を開始
        if (isAuthenticated()) {
          await initializeBackgroundSync(registration);
        }

        // SW が制御状態になるのを待ってからメッセージ送信
        const readyRegistration = await navigator.serviceWorker.ready;
        swRegistrationRef.current = readyRegistration;
        performance.mark("PWA:check-for-updates");
        readyRegistration.active?.postMessage({ type: "CHECK_FOR_UPDATES" });
      } catch (error) {
        // Service Worker登録失敗時は通常起動
        setShowVersionCheckModal(false);
      }
    } else {
      // Service Workerがサポートされていません
    }
  };

  // バックグラウンド同期初期化
  const initializeBackgroundSync = async (
    registration: ServiceWorkerRegistration,
  ) => {
    try {
      // BackgroundSyncManagerを開始
      backgroundSyncManager.start();

      // Service Workerに同期登録を要求
      if (registration.active) {
        registration.active.postMessage({ type: "REGISTER_SYNC" });
      }
    } catch (error) {
      // バックグラウンド同期初期化失敗
    }
  };

  // Service Workerからのメッセージ処理
  const handleServiceWorkerMessage = async (event: MessageEvent) => {
    const { type, result } = event.data;

    switch (type) {
      case "BACKGROUND_SYNC_REQUEST":
      case "PERFORM_SYNC":
        // Service Workerから同期要求受信

        // 認証済みの場合のみ同期実行
        if (isAuthenticated()) {
          try {
            // 現在の年月と空のデータ配列で同期を実行（実際のデータは内部で取得）
            const currentYearMonth = new Date().toISOString().substring(0, 7);
            await backgroundSyncManager.manualSync(currentYearMonth, []);
            // バックグラウンド同期完了
          } catch (error) {
            // バックグラウンド同期エラー
          }
        }
        break;

      case "VERSION_CHECK_RESULT": {
        if (!result || result.status === "error") {
          // エラー時はモーダルを閉じて続行
          setShowVersionCheckModal(false);
          break;
        }
        if (result.status === "latest") {
          // 最新 → 起動時モーダルは表示しないため何もしない
        } else if (result.status === "update_available") {
          // 更新あり → ブロック表示に切替し適用要求を送信
          setVersionModalMessage("アップデートを実行します");
          setShowVersionCheckModal(true);
          swRegistrationRef.current?.active?.postMessage({
            type: "APPLY_UPDATE",
          });
        }
        break;
      }

      case "UPDATE_APPLIED":
        // 更新適用完了: 起動時に必ず最新版で動かすため即時リロード。
        // CHECK_FOR_UPDATES は initializeServiceWorker から起動時に1回だけ送信されるため、
        // この時点では作業データはまだ無く、リロードによる作業中断リスクはない。
        try {
          localStorage.setItem("kintai_updated_at", String(Date.now()));
        } catch {
          // localStorage 書き込み失敗は無視
        }
        // モーダルは reload で消える。reload を二重発火させない最小ガード。
        if (!window.__kintaiReloading) {
          window.__kintaiReloading = true;
          // 念のため SW に切替指示が伝わってから reload するため microtask 1 つ挟む
          Promise.resolve().then(() => {
            window.location.reload();
          });
        }
        break;

      case "UPDATE_FAILED":
        // 更新適用失敗 → モーダルを閉じて通常起動（ログのみ）
        setShowVersionCheckModal(false);
        break;

      default:
      // 未知のService Workerメッセージ
    }
  };

  // ログアウト処理を一元管理
  const handleLogout = () => {
    logout();
    window.location.href = "/login";
  };

  return (
    <div className="container">
      <BrowserRouter>
        <KintaiProvider>
          {/* PWAインストール促しバナーを全ルートで常時マウント */}
          <InstallPromptBanner />
          {/* v12 楽観的更新フィードバック用トースト（全ルート共通） */}
          <Toast />
          <Routes>
            {/* ログイン画面 - ヘッダーなし */}
            <Route
              path="/login"
              element={
                <Login onLoginSuccess={() => (window.location.href = "/")} />
              }
            />

            {/* 認証保護されたルート - ヘッダーあり */}
            <Route
              path="/"
              element={
                <ProtectedRoute
                  element={
                    <>
                      <Header onLogout={handleLogout} />
                      <LoadingModal
                        isOpen={showVersionCheckModal}
                        message={versionModalMessage}
                        isLoading={true}
                        showHeader={false}
                        showFooter={false}
                      />
                      <KintaiForm />
                    </>
                  }
                />
              }
            />
            <Route
              path="/monthly"
              element={
                <ProtectedRoute
                  element={
                    <>
                      <Header onLogout={handleLogout} />
                      <LoadingModal
                        isOpen={showVersionCheckModal}
                        message={versionModalMessage}
                        isLoading={true}
                        showHeader={false}
                        showFooter={false}
                      />
                      <MonthlyView />
                    </>
                  }
                />
              }
            />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </KintaiProvider>
      </BrowserRouter>
    </div>
  );
};

export default App;
