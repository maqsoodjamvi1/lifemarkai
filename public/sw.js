// LifemarkAI Service Worker
// Caches the app shell for offline access and faster loads.

const CACHE_NAME = "lifemarkai-v4";
// NOTE: only public, non-redirecting URLs belong here. /dashboard is
// auth-gated (redirects to /login when signed out) — cache.addAll() rejects
// on redirects, which made the whole install throw on every page load.
const SHELL_URLS = [
  "/",
  "/manifest.json",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
];

// ── Install: pre-cache the shell (tolerant — one bad URL must not kill it) ───
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      Promise.allSettled(
        SHELL_URLS.map((url) =>
          fetch(url).then((res) => {
            if (res.ok && res.type === "basic") return cache.put(url, res);
          })
        )
      )
    )
  );
  self.skipWaiting();
});

// ── Activate: clean up old caches ────────────────────────────────────────────
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// ── Fetch: network-first for API/SSE, cache-first for static assets ──────────
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Editor is highly dynamic — bypass SW entirely so chunk recovery works.
  if (url.pathname.startsWith("/editor")) {
    return;
  }

  // Never intercept cross-origin or API/SSE/auth requests
  if (
    url.origin !== self.location.origin ||
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/auth/")
  ) {
    return;
  }

  // Never cache-first Next.js hashed chunks — after deploy old chunk URLs 404
  // and cache-first serves stale bundles that cause "Failed to load chunk".
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(fetch(request));
    return;
  }

  // Icons / fonts → cache-first
  if (
    url.pathname.startsWith("/icons/") ||
    url.pathname.match(/\.(png|jpg|jpeg|svg|webp|woff2?|ico)$/)
  ) {
    event.respondWith(
      caches.match(request).then(
        (cached) => cached ?? fetch(request).then((res) => {
          // Only cache good, same-origin responses — caching errors or
          // opaque redirects poisons the cache.
          if (res.ok && res.type === "basic") {
            const clone = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone)).catch(() => {});
          }
          return res;
        })
      )
    );
    return;
  }

  // Navigation requests → network-first, fall back to cached index.
  // (caches.match returns a Promise — the old `?? Response.error()` could
  // never fire; resolve the promise and apply the fallback to its VALUE.)
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() =>
        caches.match("/").then((cached) => cached ?? Response.error())
      )
    );
    return;
  }
});

// ── Push notifications ────────────────────────────────────────────────────────
self.addEventListener("push", (event) => {
  const data = event.data?.json() ?? {};
  event.waitUntil(
    self.registration.showNotification(data.title ?? "LifemarkAI", {
      body: data.body ?? "Your build is ready.",
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      tag: data.tag ?? "lifemarkai",
      data: { url: data.url ?? "/dashboard" },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: "window" }).then((windowClients) => {
      const target = event.notification.data?.url ?? "/dashboard";
      const existing = windowClients.find((c) => c.url.includes(target) && "focus" in c);
      if (existing) return existing.focus();
      return clients.openWindow(target);
    })
  );
});
