// JARVIS service worker: turns a push into a phone-call-style notification (works with the app closed).
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("push", (e) => {
  let d = {};
  try {
    d = e.data ? e.data.json() : {};
  } catch {}
  if (d.type !== "call") return;
  e.waitUntil(
    self.registration.showNotification("📞 JARVIS is calling", {
      body: d.text || "Tap to answer.",
      tag: "jarvis-call",
      renotify: true,
      requireInteraction: true,
      vibrate: [500, 250, 500, 250, 500, 250, 500, 250, 500],
      icon: "/pwa-icon?size=192",
      badge: "/pwa-icon?size=96",
      data: { url: `/jobai?call=${encodeURIComponent(d.id || "")}&topic=${encodeURIComponent(d.topic || "note")}#jarvis` },
      actions: [
        { action: "answer", title: "Answer" },
        { action: "decline", title: "Decline" },
      ],
    }),
  );
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  if (e.action === "decline") return;
  const url = (e.notification.data && e.notification.data.url) || "/jobai#jarvis";
  e.waitUntil(
    (async () => {
      const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const w of wins) {
        if (w.url.includes("/jobai")) {
          await w.focus();
          w.postMessage({ type: "answer-call", url });
          return;
        }
      }
      await self.clients.openWindow(url);
    })(),
  );
});
