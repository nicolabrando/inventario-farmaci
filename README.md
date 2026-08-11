# Inventario Farmaci (PWA)

App per tenere il conto delle scorte di farmaci e sapere quando finiscono.
I dati restano **solo sul dispositivo** (localStorage): non vengono inviati da nessuna parte.

## Importante quando modifichi i file

Il service worker serve i file dalla cache. **A ogni modifica cambia
`CACHE_VERSION` in `sw.js`** (es. `2026-08-10-1`), altrimenti i dispositivi che
hanno gia' installato l'app continueranno a usare la versione vecchia.

## Struttura

- `index.html` – interfaccia
- `app.js` – logica (Vue 3)
- `sw.js` – service worker: cache versionata, stale-while-revalidate
- `manifest.json` – dati di installazione PWA
- `vendor/` – copie locali di Vue, PapaParse e del CSS Tailwind gia' compilato
- `icons/` – icone PNG (180 per iOS, 192/512 per Android, 512 maskable)

Nessuna dipendenza da CDN esterni: l'app funziona anche completamente offline.

## Backup

L'app ricorda di esportare i dati ogni 7 giorni. L'export produce un CSV con
colonne `id,name,posology,stock,last_updated`, reimportabile dallo stesso pulsante.
