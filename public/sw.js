const CACHE_NAME = 'glimmerdeep-pwa-dev';
const IS_DEV_SW = CACHE_NAME === 'glimmerdeep-pwa-dev';
const PRECACHE_ASSETS = [
  './',
  './index.html',
  './pwa.html',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  if (IS_DEV_SW) {
    event.waitUntil(
      caches.delete(CACHE_NAME).then(() => self.skipWaiting())
    );
    return;
  }
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => IS_DEV_SW || k !== CACHE_NAME)
            .map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  );
});

async function matchFromCache(request) {
  const cache = await caches.open(CACHE_NAME);
  const exact = await cache.match(request);
  if (exact) return exact;

  if (request.mode === 'navigate') {
    const withoutSearch = await cache.match(request, { ignoreSearch: true });
    if (withoutSearch) return withoutSearch;

    const indexMatch = (await cache.match('./index.html')) || (await cache.match('./'));
    if (indexMatch) return indexMatch;
  }

  return undefined;
}

self.addEventListener('fetch', (event) => {
  if (IS_DEV_SW) return;
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    (async () => {
      const cached = await matchFromCache(event.request);
      if (cached) {
        return cached;
      }

      try {
        const response = await fetch(event.request);
        if (response && response.status === 200 && response.type === 'basic') {
          const cache = await caches.open(CACHE_NAME);
          cache.put(event.request, response.clone()).catch(() => {});
        }
        return response;
      } catch {
        if (event.request.mode === 'navigate') {
          const fallback = await matchFromCache(event.request);
          if (fallback) return fallback;
        }
        return new Response('Offline', { status: 503, statusText: 'Service Unavailable' });
      }
    })()
  );
});
