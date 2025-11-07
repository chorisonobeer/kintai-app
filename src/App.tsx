/**
 * /src/App.tsx
 * 2025-11-07T10:45+09:00
 * 変更概要: SW準備待ち＆タイムアウト導入でバージョンチェック停止を回避
 */
import React, { useEffect, useRef, useState } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import KintaiForm from "./components/KintaiForm";
import Login from "./components/Login";
import MonthlyView from "./components/MonthlyView";
import Header from "./components/Header";
import InstallPromptBanner from "./components/InstallPromptBanner";
import LoadingModal from "./components/LoadingModal";
import { isAuthenticated, logout } from "./utils/apiService";
import { KintaiProvider } from "./contexts/KintaiContext";
import { backgroundSyncManager } from "./utils/backgroundSync";

// 認証保護ルート用のラッパーコンポーネント
const ProtectedRoute: React.FC<{ element: React.ReactNode }> = ({ element }) =>
  isAuthenticated() ? <>{element}</> : <Navigate to="/login" replace />;

const App: React.FC = () => {
  // バージョン更新プログレスバーの状態管理
  // 旧更新プログレス関連の状態は廃止（Headerには未指定で渡す）
  // 起動時のバージョン確認モーダル
  const [showVersionCheckModal, setShowVersionCheckModal] = useState(false);
  const [versionModalMessage, setVersionModalMessage] = useState<string>(
    "Checking for new version...",
  );
  const [versionModalSubMessage, setVersionModalSubMessage] = useState<
    string | undefined
  >(undefined);
  const swRegistrationRef = useRef<ServiceWorkerRegistration | null>(null);
  const versionCheckTimeoutRef = useRef<number | null>(null);

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
        // SW 登録
        const registration = await navigator.serviceWorker.register("/sw.js");

        // メッセージ受信リスナー
        navigator.serviceWorker.addEventListener(
          "message",
          handleServiceWorkerMessage,
        );

        // 認証済みユーザーの場合、バックグラウンド同期を開始
        if (isAuthenticated()) {
          await initializeBackgroundSync(registration);
        }

        // 起動時のみバージョンチェックを実行（SW準備を待つ）
        setShowVersionCheckModal(true);
        setVersionModalMessage("Checking for new version...");

        // タイムアウト（10秒）でモーダルを自動クローズ
        if (versionCheckTimeoutRef.current) {
          window.clearTimeout(versionCheckTimeoutRef.current);
        }
        versionCheckTimeoutRef.current = window.setTimeout(() => {
          setVersionModalSubMessage(undefined);
          setShowVersionCheckModal(false);
        }, 10000);

        // SW が制御状態になるのを待ってからメッセージ送信
        const readyRegistration = await navigator.serviceWorker.ready;
        swRegistrationRef.current = readyRegistration;
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
        // タイムアウト解除
        if (versionCheckTimeoutRef.current) {
          window.clearTimeout(versionCheckTimeoutRef.current);
          versionCheckTimeoutRef.current = null;
        }
        if (!result || result.status === "error") {
          // エラー時はモーダルを閉じて続行
          setShowVersionCheckModal(false);
          break;
        }
        if (result.status === "latest") {
          // 最新 → モーダルを閉じる
          setShowVersionCheckModal(false);
        } else if (result.status === "update_available") {
          // 更新あり → ブロック表示に切替し適用要求を送信
          setVersionModalMessage("アップデートを実行します");
          setVersionModalSubMessage(undefined);
          swRegistrationRef.current?.active?.postMessage({
            type: "APPLY_UPDATE",
          });
        }
        break;
      }

      case "UPDATE_APPLIED":
        // 更新適用完了 → 安全に再起動
        setShowVersionCheckModal(false);
        window.location.reload();
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
                        subMessage={versionModalSubMessage}
                        isLoading={true}
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
                        subMessage={versionModalSubMessage}
                        isLoading={true}
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
