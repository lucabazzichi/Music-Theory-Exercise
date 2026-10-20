/* Service worker — offline per "Allenamento di Teoria Musicale".
   Strategia: risponde subito dalla cache e intanto aggiorna in background.
   Quando pubblichi una nuova versione dei file, cambia CACHE_VERSION (es. 'v4'). */
const CACHE_VERSION = 'v3';
const CACHE_PREFIX = 'teoria-musicale-';
const CACHE_NAME = CACHE_PREFIX + CACHE_VERSION;

const SCOPE = self.registration.scope;            // es. https://utente.github.io/nome-repo/
const abs = p => new URL(p, SCOPE).href;
const INDEX = abs('index.html');
/* L'app è tutta in index.html (font e logo inclusi): è l'unico file da salvare all'installazione.
   Manifest e icone vengono salvati al volo la prima volta che la pagina li richiede (vedi handle). */

/* Safari/Chrome rifiutano risposte "redirected" usate per una navigazione: le ricostruisco. */
async function clean(res) {
  if (!res.redirected) return res;
  return new Response(await res.blob(), { status: res.status, statusText: res.statusText, headers: res.headers });
}
const keyOf = url => { const u = new URL(url); return u.origin + u.pathname; };   // ignora ?query

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    const isUpdate = names.some(n => n.startsWith(CACHE_PREFIX) && n !== CACHE_NAME);
    /* Primo salvataggio: la pagina è appena stata scaricata, quindi la prendo dalla cache del browser
       (istantaneo, funziona anche se la connessione cade un attimo dopo). Aggiornamenti: sempre dalla rete. */
    const mode = isUpdate ? 'reload' : 'default';
    const cache = await caches.open(CACHE_NAME);

    const res = await fetch(new Request(INDEX, { cache: mode }));
    if (!res.ok) throw new Error('index.html -> ' + res.status);
    const page = await clean(res);
    await cache.put(keyOf(INDEX), page.clone());
    await cache.put(keyOf(abs('./')), page.clone());          // indirizzo senza nome file (…/nome-repo/)
    await self.skipWaiting();                                  // da qui l'app è già utilizzabile offline
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
