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

    // Service Workerの登録とバックグラウンド同期の初期化
    initializeServiceWorker();

    // v12 楽観的更新: 起動時に pending queue を flush + online listener 登録
    initPendingSaveQueue();
  }, []);

  // Service Worker 初期化処理（最小限）
  // - デフォルト挙動で SW 登録のみ。自動 reload や controllerchange ハンドラは持たない。
  // - 新バージョン検出はクライアントが UPDATE_APPLIED を受けても reload せず、
  //   次回起動時に自然適用させる（I4 不変条件）。
  const initializeServiceWorker = async () => {
    if (!("serviceWorker" in navigator)) return;
    try {
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

      // SW が制御状態になるのを待ってからメッセージ送信
      const readyRegistration = await navigator.serviceWorker.ready;
      swRegistrationRef.current = readyRegistration;
      readyRegistration.active?.postMessage({ type: "CHECK_FOR_UPDATES" });
    } catch {
      // Service Worker 登録失敗時は通常起動
      setShowVersionCheckModal(false);
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
        // 更新適用完了: 自動 reload は廃止 (I4 不変条件)。
        // 新バージョンは次回起動時に自然適用される（HTML はネットワーク優先 + no-cache）。
        // 作業中断リスクをユーザーに押し付けない設計。
        setShowVersionCheckModal(false);
        try {
          localStorage.setItem("kintai_updated_at", String(Date.now()));
        } catch {
          // localStorage 書き込み失敗は無視
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
