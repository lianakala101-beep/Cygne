// Cygne service worker
//
// Strategy:
//   - Navigations: network-first, falling back to the cached app shell so the
//     app still opens offline. Lets fresh deploys roll out immediately when
//     the network is reachable.
//   - Same-origin static assets (built JS/CSS chunks, icons, fonts, logo):
//     stale-while-revalidate. Instant from cache, refreshed in the background.
//   - Everything else (Supabase, Anthropic, Google fonts CDN, etc.): pass
//     through to the network untouched. Never cache auth-bearing requests.

const VERSION = "cygne-v1";
const RUNTIME = `${VERSION}-runtime`;
const SHELL_URL = "/";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(VERSION).then((cache) => cache.add(SHELL_URL)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== VERSION && k !== RUNTIME)
          .map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  const sameOrigin = url.origin === self.location.origin;

  // Navigations → network-first, fall back to cached shell.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put(SHELL_URL, copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match(SHELL_URL).then((r) => r || Response.error()))
    );
    return;
  }

  // Skip cross-origin and any URL that looks API-ish — we never want to
  // intercept Supabase, edge functions, or Anthropic calls.
  if (!sameOrigin) return;
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/functions/")) return;

  // Stale-while-revalidate for same-origin static GETs.
  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((res) => {
          if (res && res.status === 200 && res.type === "basic") {
            const copy = res.clone();
            caches.open(RUNTIME).then((c) => c.put(request, copy)).catch(() => {});
          }
          return res;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
