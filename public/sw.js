// Service worker de Melena.
// Estrategia:
// - Assets inmutables de Next (`/_next/static`) → stale-while-revalidate.
// - Navegaciones → red primero; sin red, la página offline cacheada.
//   Las páginas del admin son dinámicas y pueden contener datos sensibles
//   del turno: no se cachean — solo el shell offline.
// - Todo lo demás (APIs, server actions, queries) → directo a red.

const CACHE_VERSION = "melena-v1";
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const SHELL_CACHE = `${CACHE_VERSION}-shell`;
// Prefijos históricos: purga también las cachés de la etapa "beauty-pos".
const CACHE_PREFIXES = ["melena", "beauty-pos"];
const OFFLINE_URL = "/offline";
const OFFLINE_VENTA_URL = "/offline/venta";
const PRECACHE_URLS = [OFFLINE_URL, OFFLINE_VENTA_URL];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.addAll(PRECACHE_URLS)).then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => CACHE_PREFIXES.some((prefix) => key.startsWith(prefix)) && key !== STATIC_CACHE && key !== SHELL_CACHE)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Assets versionados de Next: inmutables, seguros para SWR.
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icon") || url.pathname.startsWith("/apple-icon")) {
    event.respondWith(
      caches.open(STATIC_CACHE).then(async (cache) => {
        const cached = await cache.match(request);
        const fetched = fetch(request)
          .then((response) => {
            if (response.ok) cache.put(request, response.clone());
            return response;
          })
          .catch(() => cached);
        return cached ?? fetched;
      }),
    );
    return;
  }

  // Navegación: red primero; sin red, el ticket offline para /offline/venta
  // (página estática sin datos sensibles) y el shell offline para el resto.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(async () => {
        const cache = await caches.open(SHELL_CACHE);
        const fallback = url.pathname.startsWith("/offline/venta") ? OFFLINE_VENTA_URL : OFFLINE_URL;
        return (await cache.match(fallback)) ?? Response.error();
      }),
    );
  }
});
