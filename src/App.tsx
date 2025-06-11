/**
 * /src/App.tsx
 * 2025-05-05T15:30+09:00
 * 変更概要: 更新 - 共通ヘッダーコンポーネントの追加、レイアウト統一
 */
import React, { useEffect } from "react";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
} from "react-router-dom";
import Join from "./components/Join";
import Login from "./components/Login";
import KintaiForm from "./components/KintaiForm";
import MonthlyView from "./components/MonthlyView";

import Header from "./components/Header";
import { KintaiProvider } from "./contexts/KintaiContext";
import { isAuthenticated, logout, CustomerInfo } from "./utils/apiService";
import { backgroundSyncManager } from "./utils/backgroundSync";

import "./styles.css";

const App: React.FC = () => {
  // 認証保護ルート用のラッパーコンポーネント
  const ProtectedRoute: React.FC<{
    element: React.ReactNode;
  }> = ({ element }) => {
    if (!isAuthenticated()) {
      return <Navigate to="/join" replace />;
    }

    return <>{element}</>;
  };

  // Join成功時の処理
  const handleJoinSuccess = (customerInfo: CustomerInfo) => {
    // サーバー情報をローカルストレージに保存
    localStorage.setItem("kintai_server_info", JSON.stringify(customerInfo));
    // Login画面に遷移
    window.location.href = "/login";
  };

  // アプリ起動時にlocalStorageの整合性をチェック
  useEffect(() => {
    // アプリ起動時チェック
    // 認証が必要なページで認証情報が不完全な場合は強制ログアウト
    if (
      window.location.pathname !== "/login" &&
      window.location.pathname !== "/join" &&
      !isAuthenticated()
    ) {
      logout();
      window.location.href = "/join";
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
          handleServiceWorkerMessage,
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
    registration: ServiceWorkerRegistration,
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

      default:
      // 未知のService Workerメッセージ
    }
  };

  // ログアウト処理を一元管理
  const handleLogout = () => {
    logout();
    // サーバー情報もクリア
    localStorage.removeItem("kintai_server_info");
    window.location.href = "/join";
  };

  return (
    <div className="container">
      <Router>
        <KintaiProvider>
          <Routes>
            {/* Join画面（サーバー選択） - ヘッダーなし */}
            <Route
              path="/join"
              element={<Join onJoinSuccess={handleJoinSuccess} />}
            />

            {/* ログイン画面 - ヘッダーなし */}
            <Route
              path="/login"
              element={
                <Login
                  onLoginSuccess={() => {
                    // ログイン成功後の処理
                    window.location.href = "/";
                  }}
                />
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
            <Route path="*" element={<Navigate to="/join" replace />} />
          </Routes>
        </KintaiProvider>
      </Router>
    </div>
  );
};

export default App;
