import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import InstallPrompt from "./InstallPrompt.jsx";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <>
      <App />
      <InstallPrompt />
    </>
  </React.StrictMode>
);

// Register service worker for PWA (installable app)
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js")
      .then((registration) => {
        // Listen for updates to the SW
        registration.onupdatefound = () => {
          const installing = registration.installing;
          if (!installing) return;
          installing.onstatechange = () => {
            if (installing.state === "installed") {
              if (navigator.serviceWorker.controller) {
                // New update ready: tell SW to skip waiting then reload when it activates
                registration.waiting?.postMessage({ type: "SKIP_WAITING" });
              }
            }
          };
        };

        // When the new SW activates, reload once
        let refreshing = false;
        navigator.serviceWorker.addEventListener("controllerchange", () => {
          if (refreshing) return;
          refreshing = true;
          window.location.reload();
        });
      })
      .catch(() => {
        // ignore registration failures
      });
  });
}
