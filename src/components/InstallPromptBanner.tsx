import React, { useEffect, useMemo, useRef, useState } from "react";

// インストール済み判定に使うキー（抑止用キーは廃止）
const INSTALLED_KEY = "pwaInstalled";

// iOS判定（Safari/ホーム画面追加ガイド用）
const isIOS = () => /iPhone|iPad|iPod/i.test(navigator.userAgent);

// スタンドアロン(PWA)判定
const isStandaloneDisplay = () => {
  const mq = window.matchMedia && window.matchMedia("(display-mode: standalone)").matches;
  const iosStandalone = (window.navigator as any).standalone === true; // iOS Safari
  return mq || iosStandalone;
};

// 前回の抑止から24時間経過したか（抑止廃止のため常にtrue）
const canShowAfterDismiss = () => {
  return true;
};

const getIconUrl = () => {
  // 既存のPWAアイコン。manifestにも定義済み
  // サイズは高さ48px程度で表示（モーダル内で制御）
  return "/icons/icon-192x192.png";
};

const InstallPromptBanner: React.FC = () => {
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);
  const [showIOSGuide, setShowIOSGuide] = useState(false);
  const onceRef = useRef(false);

  // 既にインストール済みなら一切表示しない
  const installed = useMemo(() => {
    try {
      const v = localStorage.getItem(INSTALLED_KEY);
      return v === "1" || isStandaloneDisplay();
    } catch {
      return isStandaloneDisplay();
    }
  }, []);

  useEffect(() => {
    // appinstalled: インストール完了時
    const handleInstalled = () => {
      try { localStorage.setItem(INSTALLED_KEY, "1"); } catch {}
      setVisible(false);
    };
    window.addEventListener("appinstalled", handleInstalled);
    return () => window.removeEventListener("appinstalled", handleInstalled);
  }, []);

  useEffect(() => {
    if (installed) return; // すでにPWAなら表示不要

    // iOS の場合は beforeinstallprompt が来ないため、独自ガイドを条件付き表示
    if (isIOS()) {
      if (canShowAfterDismiss()) {
        setShowIOSGuide(true);
        setVisible(true);
      }
    }

    // 先にグローバル捕捉済みイベント（index.htmlで保存）を参照
    try {
      const globalEvent = (window as any).__bipEvent as BeforeInstallPromptEvent | undefined;
      if (globalEvent && !onceRef.current) {
        setInstallEvent(globalEvent);
        setVisible(true);
        onceRef.current = true;
      }
    } catch {}

    const onBipCaptured = () => {
      try {
        const globalEvent = (window as any).__bipEvent as BeforeInstallPromptEvent | undefined;
        if (globalEvent && !onceRef.current) {
          setInstallEvent(globalEvent);
          setVisible(true);
          onceRef.current = true;
        }
      } catch {}
    };
    window.addEventListener("bip-captured", onBipCaptured);

    // Chromium系: beforeinstallprompt を捕捉（グローバル未設定時のフォールバック）
    const handler = (e: Event) => {
      const bip = e as BeforeInstallPromptEvent;
      bip.preventDefault();
      setInstallEvent(bip);
      if (!onceRef.current && canShowAfterDismiss()) {
        setVisible(true);
        onceRef.current = true;
      }
    };
    window.addEventListener("beforeinstallprompt", handler as EventListener);

    return () => {
      window.removeEventListener("bip-captured", onBipCaptured);
      window.removeEventListener("beforeinstallprompt", handler as EventListener);
    };
  }, [installed]);

  const handleInstall = async () => {
    // Chromium系: キャプチャ済みイベントからインストール
    if (installEvent) {
      try {
        const res = await installEvent.prompt();
        if ((res as any)?.outcome === "accepted") {
          setVisible(false);
        } else {
          setVisible(false);
        }
      } catch {
        setVisible(false);
      }
      return;
    }

    // iOSガイドを表示（Safariでホーム画面追加）
    if (isIOS()) {
      setShowIOSGuide(true);
      return;
    }

    // 対応外ブラウザ: 一旦非表示
    setVisible(false);
  };

  const handleLater = () => {
    // 今回のみ非表示（抑止なし）
    setVisible(false);
  };

  if (!visible) return null;

  // モーダルUI（全画面オーバーレイ）
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="アプリをインストール"
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(0,0,0,0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
        padding: "16px",
      }}
    >
      <div
        role="document"
        style={{
          width: "100%",
          maxWidth: 420,
          background: "#fff",
          borderRadius: 10,
          boxShadow: "0 10px 24px rgba(0,0,0,0.2)",
          padding: 16,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <img
            src={getIconUrl()}
            alt="App icon"
            style={{ width: 48, height: 48, borderRadius: 8 }}
          />
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <div style={{ fontSize: 16, fontWeight: 700 }}>アプリをホーム画面に追加できます</div>
            {showIOSGuide ? (
              <div style={{ fontSize: 13, color: "#444" }}>
                Safari右上の共有ボタンから「ホーム画面に追加」を選択してください。
              </div>
            ) : (
              <div style={{ fontSize: 13, color: "#444" }}>
                より便利にご利用いただけます。インストールしますか？
              </div>
            )}
          </div>
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
          {!showIOSGuide && (
            <button
              onClick={handleInstall}
              style={{
                fontSize: 13,
                padding: "10px 14px",
                borderRadius: 6,
                border: "1px solid #303f9f",
                background: "#303f9f",
                color: "#fff",
              }}
            >
              インストール
            </button>
          )}
          <button
            onClick={handleLater}
            style={{
              fontSize: 13,
              padding: "10px 14px",
              borderRadius: 6,
              border: "1px solid #ccc",
              background: "#fff",
              color: "#333",
            }}
          >
            後で
          </button>
        </div>
      </div>
    </div>
  );
};

// TypeScript で beforeinstallprompt を扱うための型補完
interface BeforeInstallPromptEvent extends Event {
  readonly platforms?: string[];
  readonly userChoice?: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
  prompt: () => Promise<{ outcome: "accepted" | "dismissed" }>;
}

export default InstallPromptBanner;