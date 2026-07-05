// FamilyMed Service Worker — Cache-first for assets, Network-first for pages
const CACHE_NAME = "familymed-v1";
const STATIC_CACHE = "familymed-static-v1";

// Pages to pre-cache for offline access
const PAGES_TO_CACHE = [
  "/",
  "/caregiver",
  "/paziente",
  "/pazienti",
  "/terapie",
  "/storico",
  "/scorte",
  "/report",
  "/notifiche",
  "/impostazioni",
  "/guida",
];

// Install: pre-cache app shell pages
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => {
        return cache.addAll(PAGES_TO_CACHE).catch((err) => {
          console.warn("[SW] Some pages failed to pre-cache:", err);
        });
      })
      .then(() => self.skipWaiting()),
  );
});

// Activate: clean up old caches
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k !== CACHE_NAME && k !== STATIC_CACHE)
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

// Fetch strategy:
// - Static assets (JS, CSS, fonts, images): Cache First
// - HTML pages & API: Network First with cache fallback
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests and cross-origin requests (except Google Fonts)
  if (request.method !== "GET") return;
  if (
    url.origin !== self.location.origin &&
    !url.hostname.includes("fonts.googleapis.com") &&
    !url.hostname.includes("fonts.gstatic.com")
  ) {
    return;
  }

  // Cache First for static assets
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

  // Network First for HTML navigation (with offline fallback)
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
        .catch(() => {
          return caches.match(request).then((cached) => {
            if (cached) return cached;
            // Fallback: serve root (SPA shell)
            return caches.match("/");
          });
        }),
    );
    return;
  }
});
