import React, { useEffect, useState } from "react";

function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const handler = (e) => {
      // Prevent the mini-infobar on mobile
      e.preventDefault();
      setDeferredPrompt(e);
      setVisible(true);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  if (!visible || !deferredPrompt) return null;

  const doInstall = async () => {
    try {
      deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      if (choice.outcome === "accepted") {
        // Installed
      }
    } catch {}
    setVisible(false);
    setDeferredPrompt(null);
  };

  return (
    <div style={{
      position: "fixed",
      bottom: 72,
      left: 12,
      right: 12,
      zIndex: 2000,
      background: "#696969",
      color: "#fff",
      border: "1px solid #4b5563",
      borderRadius: 12,
      padding: 12,
      boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 12
    }}>
      <div style={{fontWeight: 600}}>Install MEA Mess app?</div>
      <div style={{display: "flex", gap: 8}}>
        <button
          onClick={() => setVisible(false)}
          style={{
            background: "transparent",
            color: "#fff",
            border: "1px solid #4b5563",
            borderRadius: 8,
            padding: "8px 12px",
            cursor: "pointer"
          }}
        >
          Not now
        </button>
        <button
          onClick={doInstall}
          style={{
            background: "linear-gradient(135deg, rgb(66 148 200 / 72%), rgb(66 148 200 / 72%))",
            color: "#fff",
            border: "none",
            borderRadius: 8,
            padding: "8px 12px",
            cursor: "pointer",
            fontWeight: 600
          }}
        >
          Install
        </button>
      </div>
    </div>
  );
}

export default InstallPrompt;
