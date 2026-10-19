/* Service worker — offline per "Allenamento di Teoria Musicale".
   Strategia: risponde subito dalla cache e intanto aggiorna in background.
   Quando pubblichi una nuova versione dei file, cambia CACHE_VERSION (es. 'v3'). */
const CACHE_VERSION = 'v2';
const CACHE_PREFIX = 'teoria-musicale-';
const CACHE_NAME = CACHE_PREFIX + CACHE_VERSION;

const SCOPE = self.registration.scope;            // es. https://utente.github.io/nome-repo/
const abs = p => new URL(p, SCOPE).href;
const INDEX = abs('index.html');
const CRITICAL = [abs('index.html')];                      // senza questo l'app non funziona offline
const OPTIONAL = [abs('./'), abs('fonts.css'), abs('manifest.webmanifest'),
                  abs('icons/icon-192.png'), abs('icons/icon-512.png'), abs('icons/apple-touch-icon.png')];

/* Safari/Chrome rifiutano risposte "redirected" usate per una navigazione: le ricostruisco. */
async function clean(res) {
  if (!res.redirected) return res;
  return new Response(await res.blob(), { status: res.status, statusText: res.statusText, headers: res.headers });
}
const keyOf = url => { const u = new URL(url); return u.origin + u.pathname; };   // ignora ?query

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    const add = async url => {
      const res = await fetch(new Request(url, { cache: 'reload' }));   // salta la cache HTTP del browser
      if (!res.ok) throw new Error(url + ' -> ' + res.status);
      await cache.put(keyOf(url), await clean(res));
    };
    const critical = await Promise.allSettled(CRITICAL.map(add));
    await Promise.allSettled(OPTIONAL.map(add));                          // i file opzionali non bloccano l'installazione
    if (critical.some(r => r.status === 'rejected')) {
      throw new Error('File essenziale non raggiungibile: ' + critical.filter(r => r.status === 'rejected').map(r => r.reason.message).join('; '));
    }
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter(n => n.startsWith(CACHE_PREFIX) && n !== CACHE_NAME).map(n => caches.delete(n)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (!req.url.startsWith(SCOPE)) return;
  event.respondWith(handle(event));
});

async function handle(event) {
  const req = event.request;
  const cache = await caches.open(CACHE_NAME);
  const key = keyOf(req.url);
  const cached = await cache.match(key);

  const network = fetch(req).then(async res => {
    if (res && res.ok && res.type === 'basic') await cache.put(key, await clean(res.clone()));
    return res;
  }).catch(() => null);

  if (cached) { event.waitUntil(network); return cached; }   // online o offline: risposta immediata

  const fresh = await network;
  if (fresh) return fresh;
  if (req.mode === 'navigate') {                              // ultima rete di sicurezza: apre comunque l'app
    const fallback = await cache.match(keyOf(INDEX));
    if (fallback) return fallback;
  }
  return new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
}
