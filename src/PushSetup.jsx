import React, { useEffect, useState } from "react";
import { db } from "./firebase";
import { doc, setDoc } from "firebase/firestore";
import { getMessaging, getToken, onMessage, isSupported } from "firebase/messaging";

// IMPORTANT: You must provide your Web Push certificate key (VAPID key)
// Create one in Firebase Console > Cloud Messaging > Web configuration.
// Then set it here or via an env var injected at build time.
const VAPID_KEY = import.meta.env.VITE_FIREBASE_VAPID_KEY || ""; // <-- set this in your .env

function PushSetup({ currentUser }) {
  const [status, setStatus] = useState("idle");

  useEffect(() => {
    let unsubscribeOnMessage = null;
    (async () => {
      if (!currentUser) return;
      try {
        const supported = await isSupported();
        if (!supported) {
          setStatus("unsupported");
          return;
        }
        if (!VAPID_KEY) {
          console.warn("VAPID key missing. Set VITE_FIREBASE_VAPID_KEY to enable push notifications.");
          setStatus("no-vapid");
          return;
        }
        const permission = await Notification.requestPermission();
        if (permission !== "granted") {
          setStatus("denied");
          return;
        }
        const messaging = getMessaging();
        const token = await getToken(messaging, { vapidKey: VAPID_KEY, serviceWorkerRegistration: await navigator.serviceWorker.getRegistration() });
        if (token) {
          await setDoc(doc(db, "users", currentUser.uid), { fcmToken: token }, { merge: true });
          setStatus("ok");
        } else {
          setStatus("no-token");
        }
        unsubscribeOnMessage = onMessage(messaging, (payload) => {
          // Optional: foreground message handling
          if (payload?.notification) {
            const { title, body } = payload.notification;
            try {
              new Notification(title || "MEA Mess", { body: body || "", icon: "/logo3.png" });
            } catch (_) {
              // Some browsers block programmatic notifications; ignore
            }
          }
        });
      } catch (e) {
        console.error("Push setup error", e);
        setStatus("error");
      }
    })();

    return () => {
      if (unsubscribeOnMessage) unsubscribeOnMessage();
    };
  }, [currentUser]);

  return null; // Silent component
}

export default PushSetup;
