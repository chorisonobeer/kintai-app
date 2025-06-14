/**
 * /src/App.tsx
 * 2025-06-14T10:30+09:00
 * 変更概要: バージョン更新プログレスバー機能追加
 */
import React, { useEffect, useState } from "react";
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
  // バージョン更新プログレスバーの状態管理
  const [versionUpdateProgress, setVersionUpdateProgress] = useState(0);
  const [isVersionUpdating, setIsVersionUpdating] = useState(false);

  // アプリ起動時にlocalStorageの整合性をチェック
  useEffect(() => {
    // アプリ起動時チェック
    // 認証が必要なページで認証情報が不完全な場合は強制ログアウト
    if (window.location.pathname !== "/login" && !isAuthenticated()) {
      logout();
      window.location.href = "/login";
    }

    // Service Workerの登録とバックグラウンド同期の初期化
    initializeServiceWorker();
  }, []);

  // Service Worker初期化処理
  const initializeServiceWorker = async () => {
    if ("serviceWorker" in navigator) {
      try {
        const registration = await navigator.serviceWorker.register("/sw.js");

        // Service Workerからのメッセージを受信
        navigator.serviceWorker.addEventListener(
          "message",
          handleServiceWorkerMessage
        );

        // 認証済みユーザーの場合、バックグラウンド同期を開始
        if (isAuthenticated()) {
          await initializeBackgroundSync(registration);
        }
      } catch (error) {
        // Service Worker登録失敗
      }
    } else {
      // Service Workerがサポートされていません
    }
  };

  // バックグラウンド同期初期化
  const initializeBackgroundSync = async (
    registration: ServiceWorkerRegistration
  ) => {
    try {
      // BackgroundSyncManagerを開始
      await backgroundSyncManager.start();

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
    const { type } = event.data;

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

      case "VERSION_UPDATE_START":
        // バージョン更新開始
        setIsVersionUpdating(true);
        setVersionUpdateProgress(0);
        break;

      case "VERSION_UPDATE_PROGRESS":
        // バージョン更新進行状況
        const { progress } = event.data;
        setVersionUpdateProgress(progress || 0);
        break;

      case "NEW_VERSION_AVAILABLE":
        // 新バージョン検出時の自動リロード
        console.log("新バージョンが利用可能です。自動的にリロードします。");
        // プログレスバーを100%にしてから少し待ってリロード
        setVersionUpdateProgress(100);
        setTimeout(() => {
          window.location.reload();
        }, 500);
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
                      <Header 
                        onLogout={handleLogout} 
                        versionUpdateProgress={versionUpdateProgress}
                        isVersionUpdating={isVersionUpdating}
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
                      <Header 
                        onLogout={handleLogout} 
                        versionUpdateProgress={versionUpdateProgress}
                        isVersionUpdating={isVersionUpdating}
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
