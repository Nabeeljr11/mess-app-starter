/* Firebase Messaging SW - handles background push notifications */
importScripts('https://www.gstatic.com/firebasejs/10.12.4/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.4/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyCUsi5trZiXqkxIen_9wiiNaub7-9XKfBw",
  authDomain: "mess-app-dab87.firebaseapp.com",
  projectId: "mess-app-dab87",
  storageBucket: "mess-app-dab87.appspot.com",
  messagingSenderId: "866142996355",
  appId: "1:866142996355:web:324d96a7cb8dac404c58b6"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  // Customize notification here
  const notificationTitle = payload.notification?.title || 'MEA Mess';
  const notificationOptions = {
    body: payload.notification?.body || '',
    icon: '/logo3.png',
    badge: '/favicon.svg',
    data: payload.data || {}
  };
  self.registration.showNotification(notificationTitle, notificationOptions);
});
