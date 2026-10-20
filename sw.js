/* Service worker — offline per "Allenamento di Teoria Musicale".
   Strategia: l'app è una sola pagina (index.html). Ogni apertura dell'app mostra subito la copia salvata
   e intanto la aggiorna in background (la nuova versione compare alla riapertura successiva).
   Quando pubblichi una nuova versione dei file, cambia CACHE_VERSION (es. 'v5'). */
const CACHE_VERSION = 'v4';
const CACHE_PREFIX = 'teoria-musicale-';
const CACHE_NAME = CACHE_PREFIX + CACHE_VERSION;

const SCOPE = self.registration.scope;            // es. https://utente.github.io/nome-repo/
const abs = p => new URL(p, SCOPE).href;
const INDEX = abs('index.html');
const keyOf = url => { const u = new URL(url); return u.origin + u.pathname; };   // ignora ?query e #hash
const INDEX_KEY = keyOf(INDEX), ROOT_KEY = keyOf(abs('./'));
const MATCH = { ignoreVary: true };               // Safari confronta "Vary: Accept-Encoding" di GitHub in modo diverso da Chrome

/* Copia "pulita": solo corpo + Content-Type. Elimina Content-Encoding, Vary, ETag, flag "redirected" ecc.,
   che in Safari possono far rifiutare una risposta data da un service worker a una navigazione. */
async function sanitize(res) {
  const body = await res.arrayBuffer();
  return new Response(body, { status: 200, headers: { 'Content-Type': res.headers.get('Content-Type') || 'application/octet-stream' } });
}
async function savePage(cache, res) {
  const page = await sanitize(res);
  await cache.put(INDEX_KEY, page.clone());
  await cache.put(ROOT_KEY, page.clone());        // indirizzo senza nome file (…/nome-repo/)
}

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    const isUpdate = names.some(n => n.startsWith(CACHE_PREFIX) && n !== CACHE_NAME);
    /* Primo salvataggio: la pagina è appena stata scaricata, la prendo dalla cache del browser
       (istantaneo, funziona anche se la connessione cade un attimo dopo). Aggiornamenti: sempre dalla rete. */
    const res = await fetch(new Request(INDEX, { cache: isUpdate ? 'reload' : 'default' }));
    if (!res.ok) throw new Error('index.html -> ' + res.status);
    await savePage(await caches.open(CACHE_NAME), res);
    await self.skipWaiting();                      // da qui l'app è già utilizzabile offline
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
  if (url.origin !== self.location.origin || !req.url.startsWith(SCOPE)) return;
  event.respondWith(req.mode === 'navigate' ? handleNavigation(event) : handleAsset(event));
});

/* Qualsiasi apertura dell'app (icona in Home, link, con o senza nome file) → pagina salvata. */
async function handleNavigation(event) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(INDEX_KEY, MATCH) || await cache.match(ROOT_KEY, MATCH);
  if (cached) {
    event.waitUntil((async () => {                 // aggiorna in background; se sei offline non succede nulla
      try {
        const res = await fetch(new Request(INDEX, { cache: 'no-cache' }));
        if (res.ok) await savePage(cache, res);
      } catch (e) { /* offline */ }
    })());
    return cached;
  }
  try { return await fetch(event.request); }
  catch (e) { return new Response('Offline: apri l\'app una volta con internet.', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } }); }
}

/* Manifest, icone, ecc.: dalla cache se ci sono, altrimenti rete (e li salvo per dopo). */
async function handleAsset(event) {
  const cache = await caches.open(CACHE_NAME);
  const key = keyOf(event.request.url);
  const cached = await cache.match(key, MATCH);
  const network = fetch(event.request).then(async res => {
    if (res && res.ok && res.type === 'basic') await cache.put(key, await sanitize(res.clone()));
    return res;
  }).catch(() => null);
  if (cached) { event.waitUntil(network); return cached; }
  const fresh = await network;
  return fresh || new Response('', { status: 504 });
}
