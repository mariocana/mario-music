/**
 * sw.js — il service worker: un proxy HTTP che gira dentro al browser.
 *
 * Si mette in mezzo tra la pagina e la rete e decide, richiesta per richiesta,
 * se rispondere dalla cache o andare al server. È ciò che permette all'app di
 * aprirsi e suonare con il server spento.
 *
 * IL PUNTO DIFFICILE — Range e cache non vanno d'accordo.
 * La Cache API sa memorizzare solo risposte intere (200 con tutto il corpo).
 * Ma <audio> chiede fette: `Range: bytes=200000-`. Se gli restituissimo il
 * file intero con status 200, Chrome se la caverebbe ma Safari no: pretende
 * un 206 e senza quello il seek smette di funzionare.
 * Quindi qui sotto ricostruiamo il 206 a mano, affettando il blob in cache.
 * È la stessa logica di server/stream.ts, questa volta lato client.
 */

const VERSION = 'v3';
const SHELL = `shell-${VERSION}`;   // index.html, js, css: l'app in sé
const API = `api-${VERSION}`;       // catalogo JSON e copertine

// ATTENZIONE: la cache dei brani NON porta il numero di versione.
// Contiene roba dell'utente, non nostra: legarla alla versione del codice
// vorrebbe dire cancellargli i download a ogni aggiornamento dell'app.
const MEDIA = 'media';

const CACHES = [SHELL, API, MEDIA];

/**
 * Mette in cache l'app appena il worker viene installato.
 *
 * Serve perché alla PRIMA visita il service worker non è ancora al comando
 * quando il browser chiede la pagina: quella richiesta non passa da qui, e
 * aspettare la visita successiva significherebbe una schermata bianca al
 * primo tentativo offline.
 *
 * I file in /assets/ hanno un hash nel nome che cambia a ogni build, quindi
 * non possiamo scriverli qui a mano: li ricaviamo leggendo l'index.html.
 */
async function precacheShell() {
  const cache = await caches.open(SHELL);
  // 'reload' salta la cache HTTP del browser: vogliamo l'index.html vero,
  // non una copia vecchia.
  const response = await fetch('/', { cache: 'reload' });
  if (!response.ok) return;

  const html = await response.clone().text();
  await cache.put('/', response);

  const assets = [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map((m) => m[1]);
  // Icone e manifest: servono anche offline, alla scheda del browser e alla
  // schermata Home quando l'app è installata.
  await cache.addAll([...assets, '/favicon.svg', '/favicon-32.png', '/apple-touch-icon.png', '/manifest.webmanifest']);
}

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    await precacheShell();
    // Non aspettiamo che tutte le schede aperte si chiudano: la nuova
    // versione entra in servizio subito.
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    // Via le cache delle versioni precedenti, altrimenti si accumulano.
    const names = await caches.keys();
    await Promise.all(names.filter((n) => !CACHES.includes(n)).map((n) => caches.delete(n)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data === 'skip-waiting') void self.skipWaiting();
});

/* ─────────────────────────── Range, lato client ─────────────────────────── */

/** Identica a quella del server: bytes=0-1023 | bytes=1024- | bytes=-500 */
function parseRange(header, size) {
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match) return null;
  const [, rawStart, rawEnd] = match;
  let start;
  let end;
  if (rawStart === '') {
    if (rawEnd === '') return null;
    const suffix = Number(rawEnd);
    if (suffix === 0) return 'unsatisfiable';
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(rawStart);
    end = rawEnd === '' ? size - 1 : Number(rawEnd);
  }
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  if (start > end || start >= size) return 'unsatisfiable';
  return { start, end: Math.min(end, size - 1) };
}

/**
 * Serve un brano scaricato, rispettando l'header Range della richiesta.
 * Se il brano non è stato scaricato si passa la mano alla rete.
 */
async function serveTrack(request) {
  const cache = await caches.open(MEDIA);
  // Si cerca per URL: l'header Range non deve influenzare la ricerca in cache,
  // altrimenti ogni fetta cercherebbe una voce diversa.
  const cached = await cache.match(new URL(request.url).pathname);
  if (!cached) {
    // Non scaricato: se c'è rete si va al server, altrimenti fallisce e il
    // player mostra il suo errore.
    return fetch(request);
  }

  // blob() è pigro: non carica i 40 MB in memoria, e slice() nemmeno.
  const blob = await cached.blob();
  const type = cached.headers.get('Content-Type') || 'audio/mpeg';
  const size = blob.size;

  const rangeHeader = request.headers.get('range');
  if (!rangeHeader) {
    return new Response(blob, {
      status: 200,
      headers: {
        'Content-Type': type,
        'Content-Length': String(size),
        'Accept-Ranges': 'bytes',
      },
    });
  }

  const range = parseRange(rangeHeader, size);
  if (range === 'unsatisfiable') {
    return new Response(null, {
      status: 416,
      headers: { 'Content-Range': `bytes */${size}` },
    });
  }
  if (range === null) {
    return new Response(blob, { status: 200, headers: { 'Content-Type': type, 'Accept-Ranges': 'bytes' } });
  }

  const { start, end } = range;
  return new Response(blob.slice(start, end + 1, type), {
    status: 206,
    headers: {
      'Content-Type': type,
      'Content-Length': String(end - start + 1),
      'Content-Range': `bytes ${start}-${end}/${size}`,
      'Accept-Ranges': 'bytes',
    },
  });
}

/* ───────────────────────────── strategie ───────────────────────────── */

/** Prima la rete, la cache come rete di sicurezza. Per dati che cambiano. */
async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch (err) {
    const cached = await cache.match(request);
    if (cached) return cached;
    throw err;
  }
}

/** Prima la cache. Per roba immutabile: asset con hash nel nome, copertine. */
async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) cache.put(request, response.clone());
  return response;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // I brani: cache-only con Range ricostruito (vedi sopra).
  if (/^\/api\/tracks\/\d+\/stream$/.test(url.pathname)) {
    event.respondWith(serveTrack(request));
    return;
  }

  // Copertine di album e playlist: l'URL porta l'impronta del contenuto,
  // quindi una copertina cambiata è un indirizzo diverso e tenere la vecchia
  // in cache per sempre non fa danni.
  if (/^\/api\/(albums|playlists)\/\d+\/cover$/.test(url.pathname)) {
    event.respondWith(cacheFirst(request, API));
    return;
  }

  // Catalogo JSON: aggiornato se c'è rete, altrimenti l'ultima copia vista.
  // È questo che rende navigabile la libreria offline.
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(networkFirst(request, API));
    return;
  }

  // L'app compilata: i file in /assets/ hanno l'hash nel nome, quindi una
  // volta in cache non cambiano mai.
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(cacheFirst(request, SHELL));
    return;
  }

  // Apertura della pagina: si prova la rete e si tiene da parte l'HTML;
  // offline si riapre quello salvato.
  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      const cache = await caches.open(SHELL);
      try {
        const response = await fetch(request);
        if (response.ok) cache.put('/', response.clone());
        return response;
      } catch (err) {
        const cached = await cache.match('/');
        if (cached) return cached;
        throw err;
      }
    })());
  }
});
