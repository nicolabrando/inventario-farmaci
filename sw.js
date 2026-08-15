/* Service worker - Inventario Farmaci
 *
 * Cambia CACHE_VERSION a ogni modifica dei file: le cache vecchie vengono
 * cancellate automaticamente all'attivazione.
 */
const CACHE_VERSION = '2026-08-03-2';
const CACHE_NAME = `farmaci-${CACHE_VERSION}`;

const CORE_ASSETS = [
    './',
    './index.html',
    './app.js',
    './manifest.json',
    './vendor/app.css',
    './vendor/vue.global.prod.js',
    './vendor/papaparse.min.js',
    './icons/icon-180.png',
    './icons/icon-192.png',
    './icons/icon-512.png',
    './icons/icon-maskable-512.png'
];

self.addEventListener('install', (event) => {
    event.waitUntil((async () => {
        const cache = await caches.open(CACHE_NAME);
        // NB: cache.addAll() e' atomico - se un solo file fallisce, l'intera
        // installazione viene annullata e il service worker non si attiva mai.
        // Qui ogni file e' indipendente: quello che si scarica viene salvato.
        const results = await Promise.allSettled(
            CORE_ASSETS.map((url) => cache.add(new Request(url, { cache: 'reload' })))
        );
        const falliti = results.filter((r) => r.status === 'rejected').length;
        if (falliti > 0) {
            console.warn(`[sw] ${falliti} file non messi in cache, l'app resta comunque installata`);
        }
        await self.skipWaiting();
    })());
});

self.addEventListener('activate', (event) => {
    event.waitUntil((async () => {
        const nomi = await caches.keys();
        await Promise.all(
            nomi.filter((n) => n.startsWith('farmaci-') && n !== CACHE_NAME)
                .map((n) => caches.delete(n))
        );
        await self.clients.claim();
    })());
});

/* Strategia: stale-while-revalidate.
 * Serve subito la copia in cache (app istantanea e funzionante offline) e in
 * parallelo riscarica il file aggiornandolo in cache: l'aggiornamento pubblicato
 * su GitHub Pages arriva al massimo all'apertura successiva. */
self.addEventListener('fetch', (event) => {
    const req = event.request;
    if (req.method !== 'GET') return;

    const url = new URL(req.url);
    if (url.origin !== self.location.origin) return;

    event.respondWith((async () => {
        const cache = await caches.open(CACHE_NAME);
        const cached = await cache.match(req, { ignoreSearch: true });

        const rete = fetch(req).then((res) => {
            if (res && res.status === 200 && res.type === 'basic') {
                cache.put(req, res.clone()).catch(() => {});
            }
            return res;
        }).catch(() => null);

        if (cached) return cached;

        const res = await rete;
        if (res) return res;

        // Offline e file non in cache: per una navigazione mostriamo la pagina
        if (req.mode === 'navigate') {
            const fallback = await cache.match('./index.html');
            if (fallback) return fallback;
        }
        return new Response('Contenuto non disponibile offline', {
            status: 503,
            headers: { 'Content-Type': 'text/plain; charset=utf-8' }
        });
    })());
});
