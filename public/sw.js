// Firebase Messaging (background push) integration
// Use compat imports to work within SW context
importScripts('https://www.gstatic.com/firebasejs/10.12.4/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.4/firebase-messaging-compat.js');

try {
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
    const title = payload.notification?.title || 'MEA Mess';
    const options = {
      body: payload.notification?.body || '',
      icon: '/logo3.png',
      badge: '/favicon.svg',
      data: payload.data || {}
    };
    self.registration.showNotification(title, options);
  });
} catch (e) {
  // Ignore if Messaging can't initialize (e.g., offline or blocked)
}

/* Simple PWA service worker for offline caching */
const CACHE_NAME = 'mea-mess-cache-v1';
const ASSETS = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/logo.png',
  '/logo3.png',
  '/favicon.svg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.map((k) => (k === CACHE_NAME ? null : caches.delete(k))))
    )
  );
  self.clients.claim();
});

// Allow page to request immediate activation
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  // Network-first for navigation, cache-first for others
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => caches.match('/index.html'))
    );
  } else {
    event.respondWith(
      caches.match(request).then((cached) =>
        cached || fetch(request).then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          return response;
        })
      )
    );
  }
});
