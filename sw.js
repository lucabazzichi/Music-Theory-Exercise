/* Service worker — cache-first con aggiornamento in background.
   Cambia CACHE_VERSION ogni volta che pubblichi una nuova versione dei file. */
const CACHE_VERSION = 'v1';
const CACHE_NAME = 'teoria-musicale-' + CACHE_VERSION;
const PRECACHE = [
  './',
  './index.html',
  './fonts.css',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith('teoria-musicale-') && k !== CACHE_NAME).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.open(CACHE_NAME).then(async cache => {
      const cached = await cache.match(req, { ignoreSearch: true });
      const refresh = fetch(req).then(res => {
        if (res && res.ok) cache.put(req, res.clone());
        return res;
      }).catch(() => null);

      if (cached) { refresh; return cached; }          // offline o online: risponde subito dalla cache
      const fresh = await refresh;
      if (fresh) return fresh;
      if (req.mode === 'navigate') return cache.match('./index.html'); // ultima rete di sicurezza
      return new Response('', { status: 504, statusText: 'Offline' });
    })
  );
});
