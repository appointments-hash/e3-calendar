// E³ Calendar Manager - Service Worker (Push Notifications)
// Minimal by design: no offline caching.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch(e) {}
  const title = data.title || "E³ Calendar Reminder";
  const options = {
    body: data.body || "You have an upcoming appointment.",
    icon: data.icon || "/icons/e3-icon-192.png",
    badge: data.badge || "/icons/e3-badge-72.png",
    data: { url: data.url || "/" }
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) ? event.notification.data.url : "/";
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const client of all) {
      if ("focus" in client) {
        await client.focus();
        if ("navigate" in client) client.navigate(url);
        return;
      }
    }
    await self.clients.openWindow(url);
  })());
});
