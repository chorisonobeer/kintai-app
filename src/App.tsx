/**
 * /src/App.tsx
 * 2025-05-05T15:30+09:00
 * 変更概要: 更新 - 共通ヘッダーコンポーネントの追加、レイアウト統一
 */
import React, { useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import KintaiForm from "./components/KintaiForm";
import Login from "./components/Login";
import MonthlyView from "./components/MonthlyView";
import Header from "./components/Header";
import { isAuthenticated, logout } from "./utils/apiService";
import { KintaiProvider } from "./contexts/KintaiContext";
import { backgroundSyncManager } from "./utils/backgroundSync";

// 認証保護ルート用のラッパーコンポーネント
const ProtectedRoute: React.FC<{ element: React.ReactNode }> = ({ element }) =>
  isAuthenticated() ? <>{element}</> : <Navigate to="/login" replace />;

const App: React.FC = () => {
  // アプリ起動時にlocalStorageの整合性をチェック
  useEffect(() => {
    console.log("=== アプリ起動時チェック ===");
    console.log("現在のURL:", window.location.href);
    console.log("認証状態:", isAuthenticated());

    // 認証が必要なページで認証情報が不完全な場合は強制ログアウト
    if (window.location.pathname !== "/login" && !isAuthenticated()) {
      console.log("認証情報が不完全です。ログアウト処理を実行します。");
      logout();
      window.location.href = "/login";
    }
    console.log("=============================");

    // Service Workerの登録とバックグラウンド同期の初期化
    initializeServiceWorker();
  }, []);

  // Service Worker初期化処理
  const initializeServiceWorker = async () => {
    if ("serviceWorker" in navigator) {
      try {
        console.log("Service Worker登録開始...");
        const registration = await navigator.serviceWorker.register("/sw.js");
        console.log("Service Worker登録成功:", registration);

        // Service Workerからのメッセージを受信
        navigator.serviceWorker.addEventListener(
          "message",
          handleServiceWorkerMessage,
        );

        // 認証済みユーザーの場合、バックグラウンド同期を開始
        if (isAuthenticated()) {
          await initializeBackgroundSync(registration);
        }
      } catch (error) {
        console.error("Service Worker登録失敗:", error);
      }
    } else {
      console.warn("Service Workerがサポートされていません");
    }
  };

  // バックグラウンド同期初期化
  const initializeBackgroundSync = async (
    registration: ServiceWorkerRegistration,
  ) => {
    try {
      console.log("バックグラウンド同期初期化開始...");

      // BackgroundSyncManagerを開始
      await backgroundSyncManager.start();

      // Service Workerに同期登録を要求
      if (registration.active) {
        registration.active.postMessage({ type: "REGISTER_SYNC" });
      }

      console.log("バックグラウンド同期初期化完了");
    } catch (error) {
      console.error("バックグラウンド同期初期化失敗:", error);
    }
  };

  // Service Workerからのメッセージ処理
  const handleServiceWorkerMessage = async (event: MessageEvent) => {
    const { type, timestamp } = event.data;

    switch (type) {
      case "BACKGROUND_SYNC_REQUEST":
      case "PERFORM_SYNC":
        console.log("Service Workerから同期要求受信:", type, timestamp);

        // 認証済みの場合のみ同期実行
        if (isAuthenticated()) {
          try {
            // 現在の年月と空のデータ配列で同期を実行（実際のデータは内部で取得）
            const currentYearMonth = new Date().toISOString().substring(0, 7);
            await backgroundSyncManager.manualSync(currentYearMonth, []);
            console.log("バックグラウンド同期完了");
          } catch (error) {
            console.error("バックグラウンド同期エラー:", error);
          }
        }
        break;

      default:
        console.log("未知のService Workerメッセージ:", type);
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
