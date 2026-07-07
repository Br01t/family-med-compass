// FamilyMed Service Worker — cache app shell + Web Push
const CACHE_NAME = "familymed-v2";
const STATIC_CACHE = "familymed-static-v2";

const PAGES_TO_CACHE = [
  "/",
  "/caregiver",
  "/paziente",
  "/pazienti",
  "/terapie",
  "/scorte",
  "/storico-report",
  "/notifiche",
  "/impostazioni",
  "/guida",
  "/le-mie-terapie",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PAGES_TO_CACHE).catch(() => {}))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => k !== CACHE_NAME && k !== STATIC_CACHE).map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== "GET") return;
  if (
    url.origin !== self.location.origin &&
    !url.hostname.includes("fonts.googleapis.com") &&
    !url.hostname.includes("fonts.gstatic.com")
  ) {
    return;
  }
  const isStaticAsset =
    url.pathname.match(/\.(js|css|woff2?|ttf|otf|png|jpg|jpeg|svg|ico|webp)$/) ||
    url.hostname.includes("fonts.");
  if (isStaticAsset) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          if (!response || response.status !== 200) return response;
          const clone = response.clone();
          caches.open(STATIC_CACHE).then((c) => c.put(request, clone));
          return response;
        });
      }),
    );
    return;
  }
  if (request.mode === "navigate" || request.headers.get("accept")?.includes("text/html")) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((c) => c.put(request, clone));
          }
          return response;
        })
        .catch(() =>
          caches.match(request).then((cached) => cached || caches.match("/")),
        ),
    );
  }
});

// ============ Web Push ============
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "FamilyMed", body: event.data?.text() ?? "" };
  }
  const title = data.title || "FamilyMed";
  const options = {
    body: data.body || "",
    icon: data.icon || "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    image: data.image,
    tag: data.tag,
    data: { url: data.url || "/notifiche", isAlarm: !!data.isAlarm },
    requireInteraction: !!data.requireInteraction || !!data.isAlarm,
    vibrate: data.isAlarm ? [500, 200, 500, 200, 500, 200, 500] : [200, 100, 200],
    silent: false,
    renotify: true,
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/notifiche";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((wins) => {
      for (const win of wins) {
        if ("focus" in win) {
          win.focus();
          if ("navigate" in win) win.navigate(url);
          return;
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    }),
  );
});
