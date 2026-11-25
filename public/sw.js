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
      .then(async (cache) => {
        const noCacheAssets = new Set(['./', './index.html', './pwa.html', './manifest.webmanifest']);
        await Promise.all(
          PRECACHE_ASSETS.map(async (asset) => {
            const req = noCacheAssets.has(asset)
              ? new Request(asset, { cache: 'reload' })
              : asset;
            const res = await fetch(req);
            if (res && res.ok) {
              await cache.put(asset, res);
            }
          })
        );
      })
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

  const isNavigationOrManifest =
    event.request.mode === 'navigate' ||
    url.pathname.endsWith('/') ||
    url.pathname.endsWith('/index.html') ||
    url.pathname.endsWith('/pwa.html') ||
    url.pathname.endsWith('/manifest.webmanifest');

  if (isNavigationOrManifest) {
    event.respondWith(
      (async () => {
        try {
          const networkReq =
            event.request.mode === 'navigate'
              ? new Request(event.request.url, { cache: 'no-cache' })
              : new Request(event.request, { cache: 'no-cache' });
          const response = await fetch(networkReq);
          if (response && response.status === 200 && response.type === 'basic') {
            const cache = await caches.open(CACHE_NAME);
            cache.put(event.request, response.clone()).catch(() => {});
          }
          return response;
        } catch {
          const cached = await matchFromCache(event.request);
          if (cached) return cached;
          return new Response('Offline', { status: 503, statusText: 'Service Unavailable' });
        }
      })()
    );
    return;
  }

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
        return new Response('Offline', { status: 503, statusText: 'Service Unavailable' });
      }
    })()
  );
});
