importScripts(
  "https://www.gstatic.com/firebasejs/9.22.0/firebase-app-compat.js",
);
importScripts(
  "https://www.gstatic.com/firebasejs/9.22.0/firebase-messaging-compat.js",
);

firebase.initializeApp({
  apiKey: "AIzaSyBAFE26kDmBhZaF9nFP1h8RtKVzXq-7E8s",
  authDomain: "kikimikianniversary.firebaseapp.com",
  projectId: "kikimikianniversary",
  storageBucket: "kikimikianniversary.firebasestorage.app",
  messagingSenderId: "841345372926",
  appId: "1:841345372926:web:3a41d189f65a7dc14b8baf",
});

const messaging = firebase.messaging();
const NOTIFICATION_ICON = "/sliki/icons/mk.png";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) =>
  event.waitUntil(self.clients.claim()),
);

// Handles notifications requested by chat.js while the page is open but hidden.
self.addEventListener("message", (event) => {
  if (!event.data || event.data.type !== "NOTIFY") return;

  const { title, body, icon, tag, url } = event.data;
  event.waitUntil(
    self.registration.showNotification(title || "💌 New message", {
      body: body || "",
      icon: icon || NOTIFICATION_ICON,
      badge: NOTIFICATION_ICON,
      tag: tag || "chat-message",
      renotify: true,
      data: { url: url || "/chat.html" },
    }),
  );
});

messaging.onBackgroundMessage((payload) => {
  const title = payload.notification?.title || "💌 New message";
  const body = payload.notification?.body || "You have a new message";

  return self.registration.showNotification(title, {
    body,
    icon: NOTIFICATION_ICON,
    badge: NOTIFICATION_ICON,
    tag: "chat-message",
    renotify: true,
    data: { url: payload.fcmOptions?.link || "/chat.html" },
  });
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || "/chat.html";

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((list) => {
        for (const client of list) {
          if (client.url.includes("chat.html") && "focus" in client) {
            return client.focus();
          }
        }
        return self.clients.openWindow(targetUrl);
      }),
  );
});
