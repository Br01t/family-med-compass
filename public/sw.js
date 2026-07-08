// FamilyMed Service Worker — cache app shell + Web Push + azioni notifica
const CACHE_NAME = "familymed-v3";
const STATIC_CACHE = "familymed-static-v3";

const PAGES_TO_CACHE = [
  "/", "/caregiver", "/paziente", "/pazienti", "/terapie", "/scorte",
  "/storico-report", "/notifiche", "/impostazioni", "/guida", "/le-mie-terapie",
];

// Sostituisci con l'URL del tuo Supabase in fase di build/deploy se serve.
// Legge in fallback l'origine dalla registrazione: il SW può inferire lo host
// dalla subscription endpoint (fcm.googleapis.com). L'URL corretto viene
// però passato dentro il payload della push come `actionEndpoint`.
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((c) => c.addAll(PAGES_TO_CACHE).catch(() => {}))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== CACHE_NAME && k !== STATIC_CACHE).map((k) => caches.delete(k)),
      ),
    ).then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== "GET") return;
  if (url.origin !== self.location.origin &&
      !url.hostname.includes("fonts.googleapis.com") &&
      !url.hostname.includes("fonts.gstatic.com")) return;

  const isStaticAsset =
    url.pathname.match(/\.(js|css|woff2?|ttf|otf|png|jpg|jpeg|svg|ico|webp)$/) ||
    url.hostname.includes("fonts.");
  if (isStaticAsset) {
    event.respondWith(
      caches.match(request).then((cached) => cached || fetch(request).then((response) => {
        if (!response || response.status !== 200) return response;
        const clone = response.clone();
        caches.open(STATIC_CACHE).then((c) => c.put(request, clone));
        return response;
      })),
    );
    return;
  }
  if (request.mode === "navigate" || request.headers.get("accept")?.includes("text/html")) {
    event.respondWith(
      fetch(request).then((response) => {
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((c) => c.put(request, clone));
        }
        return response;
      }).catch(() => caches.match(request).then((cached) => cached || caches.match("/"))),
    );
  }
});

// ============ Web Push ============
self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; }
  catch { data = { title: "FamilyMed", body: event.data?.text() ?? "" }; }

  const title = data.title || "FamilyMed";
  const isAlarm = !!data.isAlarm;
  const actionsList = Array.isArray(data.actions) ? data.actions : [];
  const actions = [];
  if (actionsList.includes("confirm")) actions.push({ action: "confirm", title: "✓ Conferma" });
  if (actionsList.includes("snooze")) actions.push({ action: "snooze", title: "⏰ Rimanda" });

  const options = {
    body: data.body || "",
    icon: data.icon || "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    image: data.image,
    tag: data.tag,
    data: {
      url: data.url || "/notifiche",
      isAlarm,
      kind: data.kind,
      eventId: data.eventId,
      payload: data,
    },
    requireInteraction: !!data.requireInteraction || isAlarm,
    vibrate: isAlarm ? [500, 200, 500, 200, 500, 200, 500, 200, 800] : [300, 150, 300],
    silent: false,
    renotify: true,
    actions,
  };

  event.waitUntil((async () => {
    await self.registration.showNotification(title, options);
    // Fallback in-app: avverte i client per far partire l'AlarmRinger.
    const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const c of clients) {
      c.postMessage({ type: "familymed-push", isAlarm, title, body: options.body, url: options.data.url, kind: data.kind, eventId: data.eventId });
    }
  })());
});

// ============ Azioni dalla notifica ============
async function callDoseAction(action, eventId) {
  try {
    const reg = self.registration;
    const sub = await reg.pushManager.getSubscription();
    if (!sub) return false;
    // URL del backend Supabase memorizzato in cache all'installazione.
    // Il client scrive `familymed-config` con l'URL della function dose-action.
    const cache = await caches.open("familymed-config");
    const cfg = await cache.match("config.json");
    const conf = cfg ? await cfg.json() : {};
    const url = conf.doseActionUrl;
    if (!url) {
      console.warn("[sw] missing doseActionUrl in config");
      return false;
    }
    const headers = { "Content-Type": "application/json" };
    if (conf.anonKey) {
      headers["apikey"] = conf.anonKey;
      headers["Authorization"] = `Bearer ${conf.anonKey}`;
    }
    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({ endpoint: sub.endpoint, eventId, action }),
    });
    return res.ok;
  } catch (err) {
    console.warn("[sw] dose-action failed:", err);
    return false;
  }
}

self.addEventListener("notificationclick", (event) => {
  const action = event.action;
  const data = event.notification.data || {};
  event.notification.close();

  if ((action === "confirm" || action === "snooze") && data.eventId) {
    event.waitUntil((async () => {
      const ok = await callDoseAction(action, data.eventId);
      if (!ok) {
        // Fallback: apri l'app sulla pagina notifiche
        await openApp(data.url || "/notifiche");
      }
    })());
    return;
  }

  event.waitUntil(openApp(data.url || "/notifiche"));
});

async function openApp(url) {
  const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  for (const win of wins) {
    if ("focus" in win) {
      win.focus();
      if ("navigate" in win) try { win.navigate(url); } catch {}
      return;
    }
  }
  if (self.clients.openWindow) return self.clients.openWindow(url);
}

// Il client può inviare la config runtime (URL edge function + anon key)
self.addEventListener("message", (event) => {
  if (event.data?.type === "familymed-config") {
    const cfg = { doseActionUrl: event.data.doseActionUrl, anonKey: event.data.anonKey };
    event.waitUntil((async () => {
      const cache = await caches.open("familymed-config");
      await cache.put("config.json", new Response(JSON.stringify(cfg), { headers: { "Content-Type": "application/json" } }));
    })());
  }
});
