/* ============================================================
   service-worker.js — offline-first app shell caching.
   All paths are relative to this file, so it works on any
   GitHub Pages project subpath (user.github.io/omr-magic/).
   ============================================================ */

const CACHE_PREFIX = 'omr-magic-';
const CACHE_NAME = CACHE_PREFIX + 'v4';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './styles.css',
  './storage.js',
  './testManager.js',
  './gradingEngine.js',
  './studentManager.js',
  './resultManager.js',
  './answerKeyService.js',
  './aiVision.js',
  './omrGenerator.js',
  './imageProcessor.js',
  './omrScanner.js',
  './camera.js',
  './exportService.js',
  './batchScanner.js',
  './app.js',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    // Cache files one by one: a single missing file must NOT make the whole
    // install fail (cache.addAll is all-or-nothing, which would leave the app
    // with no working service worker and therefore not installable).
    await Promise.all(APP_SHELL.map((url) =>
      cache.add(url).catch((err) => console.warn('SW precache skipped', url, err))
    ));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    // Only delete OUR old caches — user.github.io is shared by every repo you own.
    const names = await caches.keys();
    await Promise.all(names
      .filter((n) => n.startsWith(CACHE_PREFIX) && n !== CACHE_NAME)
      .map((n) => caches.delete(n)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // fonts, API calls etc. go straight to network

  // Page navigations: network first (always fresh), cached shell when offline.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).catch(() => caches.match('./index.html').then((r) => r || caches.match('./')))
    );
    return;
  }

  // Everything else: stale-while-revalidate (instant from cache, refreshed in background).
  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const cached = await cache.match(req);
      const network = fetch(req).then((res) => {
        if (res && res.status === 200 && res.type === 'basic') cache.put(req, res.clone());
        return res;
      }).catch(() => cached);
      return cached || network;
    })
  );
});
