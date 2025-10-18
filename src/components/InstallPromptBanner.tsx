import React, { useEffect, useMemo, useRef, useState } from "react";

// 表示抑止（24時間）に使うキー
const DISMISS_KEY = "pwaPromptDismissedAt";
const INSTALLED_KEY = "pwaInstalled";

// iOS判定（Safari/ホーム画面追加ガイド用）
const isIOS = () => /iPhone|iPad|iPod/i.test(navigator.userAgent);

// スタンドアロン(PWA)判定
const isStandaloneDisplay = () => {
  const mq = window.matchMedia && window.matchMedia("(display-mode: standalone)").matches;
  const iosStandalone = (window.navigator as any).standalone === true; // iOS Safari
  return mq || iosStandalone;
};

// 前回の抑止から24時間経過したか
const canShowAfterDismiss = () => {
  try {
    const ts = localStorage.getItem(DISMISS_KEY);
    if (!ts) return true;
    const last = Number(ts);
    if (Number.isNaN(last)) return true;
    const diffMs = Date.now() - last;
    return diffMs >= 24 * 60 * 60 * 1000; // 24h
  } catch {
    return true;
  }
};

const getIconUrl = () => {
  // 既存のPWAアイコン。manifestにも定義済み
  // サイズは高さ24px程度で表示（CSSで制御）
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

    // Chromium系: beforeinstallprompt を捕捉
    const handler = (e: Event) => {
      // 型を合わせる
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
      window.removeEventListener("beforeinstallprompt", handler as EventListener);
    };
  }, [installed]);

  const handleInstall = async () => {
    // Chromium系: キャプチャ済みイベントからインストール
    if (installEvent) {
      try {
        const res = await installEvent.prompt();
        // ユーザー選択の結果を確認
        if ((res as any)?.outcome === "accepted") {
          // 成功時は非表示（appinstalledでも非表示になる）
          setVisible(false);
        } else {
          // キャンセル時は24時間抑止
          try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch {}
          setVisible(false);
        }
      } catch {
        // 失敗時も24時間抑止
        try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch {}
        setVisible(false);
      }
      return;
    }

    // iOSガイドを表示（Safariでホーム画面追加）
    if (isIOS()) {
      setShowIOSGuide(true);
      return;
    }

    // 対応外ブラウザ: 一旦抑止
    try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch {}
    setVisible(false);
  };

  const handleLater = () => {
    try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch {}
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div className="install-banner" role="dialog" aria-label="アプリをインストール">
      <div className="install-banner__content">
        <img src={getIconUrl()} alt="App icon" className="install-banner__icon" />
        <div className="install-banner__text">
          <div className="install-banner__title">アプリをホーム画面に追加できます</div>
          {showIOSGuide ? (
            <div className="install-banner__desc">
              Safari右上の共有ボタンから「ホーム画面に追加」を選択してください。
            </div>
          ) : (
            <div className="install-banner__desc">より便利にご利用いただけます。インストールしますか？</div>
          )}
        </div>
        <div className="install-banner__actions">
          {!showIOSGuide && (
            <button className="install-banner__btn install-banner__btn-primary" onClick={handleInstall}>
              インストール
            </button>
          )}
          <button className="install-banner__btn" onClick={handleLater}>後で</button>
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