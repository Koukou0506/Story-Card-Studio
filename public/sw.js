const CACHE_VERSION = "story-card-shell-v2";
const SHELL_ASSETS = ["/", "/offline.html", "/manifest.webmanifest", "/icons/icon-192.svg", "/icons/icon-512.svg", "/icons/icon-maskable.svg"];

function extractShellAssets(html) {
  const assets = new Set();
  for (const match of html.matchAll(/(?:src|href)=["']([^"']+)["']/g)) {
    try {
      const url = new URL(match[1], self.location.origin);
      if (url.origin === self.location.origin && url.pathname.startsWith("/_next/static/")) assets.add(url.pathname);
    } catch { /* Ignore malformed or non-URL attributes. */ }
  }
  return [...assets];
}

async function cacheApplicationShell() {
  const cache = await caches.open(CACHE_VERSION);
  await cache.addAll(SHELL_ASSETS);
  const root = await cache.match("/");
  if (!root) return;
  const assets = extractShellAssets(await root.text());
  await Promise.allSettled(assets.map((asset) => cache.add(asset)));
}

self.addEventListener("install", (event) => {
  event.waitUntil(cacheApplicationShell());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_VERSION).map((key) => caches.delete(key)))).then(() => self.clients.claim()));
});

function isSensitiveRequest(request, url) {
  return request.method !== "GET" || url.pathname.startsWith("/api/") || request.headers.has("authorization") || request.headers.has("x-csrf-token");
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || isSensitiveRequest(request, url)) return;

  if (request.mode === "navigate") {
    event.respondWith(fetch(request).then((response) => response).catch(async () => (await caches.match("/")) || (await caches.match("/offline.html"))));
    return;
  }

  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")) {
    event.respondWith(caches.match(request).then((cached) => cached || fetch(request).then((response) => {
      if (response.ok) caches.open(CACHE_VERSION).then((cache) => cache.put(request, response.clone()));
      return response;
    })));
  }
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});
