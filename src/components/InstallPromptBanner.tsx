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
      setInstallEvent(null);
      setShowIOSGuide(false);
    };
    window.addEventListener("appinstalled", handleInstalled);
    return () => window.removeEventListener("appinstalled", handleInstalled);
  }, []);

  useEffect(() => {
    if (installed) return; // すでにPWAなら表示不要

    // iOS の場合は beforeinstallprompt が来ないため、ボタンのみ表示
    if (isIOS()) {
      if (canShowAfterDismiss()) {
        setShowIOSGuide(false);
      }
    }

    // グローバル捕捉済みイベント（index.htmlで保存）
    try {
      const globalEvent = (window as any).__bipEvent as BeforeInstallPromptEvent | undefined;
      if (globalEvent && !onceRef.current) {
        setInstallEvent(globalEvent);
        onceRef.current = true;
      }
    } catch {}

    const onBipCaptured = () => {
      try {
        const globalEvent = (window as any).__bipEvent as BeforeInstallPromptEvent | undefined;
        if (globalEvent && !onceRef.current) {
          setInstallEvent(globalEvent);
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
        onceRef.current = true;
      }
    };
    window.addEventListener("beforeinstallprompt", handler as EventListener);

    return () => {
      window.removeEventListener("bip-captured", onBipCaptured);
      window.removeEventListener("beforeinstallprompt", handler as EventListener);
    };
  }, [installed]);

  const shouldShowButton = useMemo(() => {
    return !installed && (isIOS() || !!installEvent);
  }, [installed, installEvent]);

  const handleInstall = async () => {
    // Chromium系: キャプチャ済みイベントからインストール
    if (installEvent) {
      try {
        const res = await installEvent.prompt();
        if ((res as any)?.outcome === "accepted") {
          setInstallEvent(null);
          setShowIOSGuide(false);
        } else {
          setInstallEvent(null);
          setShowIOSGuide(false);
        }
      } catch {
        setInstallEvent(null);
        setShowIOSGuide(false);
      }
      return;
    }

    // iOSガイドを表示（Safariでホーム画面追加）
    if (isIOS()) {
      setShowIOSGuide(true);
      return;
    }
  };

  const handleLater = () => {
    // iOSガイドを閉じる（ボタンは残す）
    setShowIOSGuide(false);
  };

  if (!shouldShowButton && !showIOSGuide) return null;

  // ボタン＋iOSガイド（必要時のみモーダル表示）
  return (
    <>
      {showIOSGuide && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="インストール手順"
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
                <div style={{ fontSize: 16, fontWeight: 700 }}>ホーム画面に追加</div>
                <div style={{ fontSize: 13, color: "#444" }}>
                  Safariの共有ボタンから「ホーム画面に追加」を選択してください。
                </div>
              </div>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
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
                閉じる
              </button>
            </div>
          </div>
        </div>
      )}

      {shouldShowButton && (
        <button
          onClick={handleInstall}
          aria-label="ホーム画面に追加"
          style={{
            position: "fixed",
            right: 16,
            bottom: 16,
            zIndex: 999,
            background: "#303f9f",
            color: "#fff",
            border: "1px solid #303f9f",
            borderRadius: 24,
            padding: "10px 16px",
            boxShadow: "0 4px 12px rgba(0,0,0,0.2)",
            fontSize: 13,
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
          title={installEvent ? "インストール" : "手順を表示"}
        >
          <span style={{ display: "inline-block", width: 18, height: 18, borderRadius: 4, background: "#fff", color: "#303f9f", fontWeight: 700, textAlign: "center", lineHeight: "18px" }}>+</span>
          ホーム画面に追加
        </button>
      )}
    </>
  );
};

// TypeScript で beforeinstallprompt を扱うための型補完
interface BeforeInstallPromptEvent extends Event {
  readonly platforms?: string[];
  readonly userChoice?: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
  prompt: () => Promise<{ outcome: "accepted" | "dismissed" }>;
}

export default InstallPromptBanner;