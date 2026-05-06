import React, { useEffect, useState } from "react";

/**
 * 中央表示トースト。window.dispatchEvent(new CustomEvent('kintai:toast', { detail: 'message' }))
 * で表示。1.2 秒で自動消去。OK/閉じるボタン無し、操作非妨害。
 */
const Toast: React.FC = () => {
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const onToast = (e: Event) => {
      const ce = e as CustomEvent<string>;
      const msg = ce.detail;
      if (!msg) return;
      setMessage(msg);
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => setMessage(null), 1200);
    };
    window.addEventListener("kintai:toast", onToast);
    return () => {
      window.removeEventListener("kintai:toast", onToast);
      if (timer) clearTimeout(timer);
    };
  }, []);

  if (!message) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: "fixed",
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%)",
        background: "rgba(0, 0, 0, 0.88)",
        color: "#fff",
        padding: "28px 56px",
        borderRadius: 16,
        zIndex: 9999,
        fontSize: 28,
        fontWeight: 700,
        letterSpacing: "0.05em",
        pointerEvents: "none",
        boxShadow: "0 12px 36px rgba(0, 0, 0, 0.35)",
        animation: "kintai-toast-fade 1.2s ease-in-out",
        whiteSpace: "nowrap",
      }}
    >
      {message}
      <style>
        {`@keyframes kintai-toast-fade {
            0% { opacity: 0; transform: translate(-50%, calc(-50% + 12px)) scale(0.92); }
            12% { opacity: 1; transform: translate(-50%, -50%) scale(1); }
            88% { opacity: 1; transform: translate(-50%, -50%) scale(1); }
            100% { opacity: 0; transform: translate(-50%, calc(-50% - 12px)) scale(0.96); }
          }`}
      </style>
    </div>
  );
};

export default Toast;
