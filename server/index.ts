/**
 * index.ts — il server HTTP.
 *
 * Volutamente senza Express: con `node:http` nudo si vede esattamente cosa
 * succede a ogni richiesta, che è il punto di questo progetto.
 *
 * Due famiglie di endpoint:
 *   /api/...            JSON, il catalogo (album, artisti, brani, ricerca)
 *   /api/tracks/:id/stream   byte, il file audio servito a fette (vedi stream.ts)
 */
import { createServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { openDb } from './db.ts';
import { sendFile } from './stream.ts';
import { scanLibrary, LibraryMissingError } from './scanner.ts';
import { getLyrics } from './lyrics.ts';
import { searchTracks, rebuildSearchIndex, indexIsStale } from './search.ts';
import {
  COLONNE_TRACCIA, setFavorite, listFavorites, recordPlay, recentlyPlayed, mostPlayed,
} from './listening.ts';
import {
  listPlaylists, getPlaylist, createPlaylist, renamePlaylist, deletePlaylist,
  addTracks, removeAt, moveTrack, setCover, clearCover, coverFile,
} from './playlists.ts';

const PORT = Number(process.env.PORT ?? 4000);
// Ogni quanti minuti ripassare la libreria. 0 disattiva il ripasso automatico.
const SCAN_EVERY_MIN = Number(process.env.SCAN_INTERVAL_MIN ?? 5);
const db = openDb();

/* ────────────────────────────── query SQL ────────────────────────────── */

const q = {
  albums: db.prepare(`
    SELECT al.id, al.title, al.year, al.genre,
           ar.id AS artistId, ar.name AS artist,
           COUNT(t.id) AS trackCount,
           ROUND(SUM(t.duration)) AS duration,
           al.cover_key AS coverKey,
           al.cover_path IS NOT NULL AS hasCover
    FROM albums al
    JOIN artists ar ON ar.id = al.artist_id
    LEFT JOIN tracks t ON t.album_id = al.id
    GROUP BY al.id
    ORDER BY ar.name COLLATE NOCASE, al.year, al.title COLLATE NOCASE
  `),
  album: db.prepare(`
    SELECT al.id, al.title, al.year, al.genre,
           ar.id AS artistId, ar.name AS artist,
           al.cover_key AS coverKey,
           al.cover_path IS NOT NULL AS hasCover
    FROM albums al JOIN artists ar ON ar.id = al.artist_id
    WHERE al.id = ?
  `),
  albumsOfArtist: db.prepare(`
    SELECT al.id, al.title, al.year, al.genre,
           ar.id AS artistId, ar.name AS artist,
           COUNT(t.id) AS trackCount,
           ROUND(SUM(t.duration)) AS duration,
           al.cover_key AS coverKey,
           al.cover_path IS NOT NULL AS hasCover
    FROM albums al
    JOIN artists ar ON ar.id = al.artist_id
    LEFT JOIN tracks t ON t.album_id = al.id
    WHERE al.artist_id = ?
    GROUP BY al.id
    ORDER BY al.year DESC, al.title COLLATE NOCASE
  `),
  artists: db.prepare(`
    SELECT ar.id, ar.name,
           COUNT(DISTINCT al.id) AS albumCount,
           COUNT(t.id) AS trackCount
    FROM artists ar
    LEFT JOIN albums al ON al.artist_id = ar.id
    LEFT JOIN tracks t ON t.artist_id = ar.id
    GROUP BY ar.id
    ORDER BY ar.name COLLATE NOCASE
  `),
  artist: db.prepare('SELECT id, name FROM artists WHERE id = ?'),
  tracksOfAlbum: db.prepare(`
    SELECT ${COLONNE_TRACCIA}
    FROM tracks t
    JOIN albums al ON al.id = t.album_id
    JOIN artists ar ON ar.id = t.artist_id
    WHERE t.album_id = ?
    ORDER BY t.disc_no, t.track_no, t.title COLLATE NOCASE
  `),
  allTracks: db.prepare(`
    SELECT ${COLONNE_TRACCIA}
    FROM tracks t
    JOIN albums al ON al.id = t.album_id
    JOIN artists ar ON ar.id = t.artist_id
    ORDER BY ar.name COLLATE NOCASE, al.year, t.disc_no, t.track_no
  `),
  trackFile: db.prepare('SELECT path, mime, title FROM tracks WHERE id = ?'),
  coverFile: db.prepare('SELECT cover_path AS coverPath FROM albums WHERE id = ?'),
  stats: db.prepare(`
    SELECT (SELECT COUNT(*) FROM artists) AS artists,
           (SELECT COUNT(*) FROM albums)  AS albums,
           (SELECT COUNT(*) FROM tracks)  AS tracks,
           (SELECT ROUND(COALESCE(SUM(duration), 0)) FROM tracks) AS duration
  `),
};

/* ─────────────────────────────── helper ─────────────────────────────── */

function json(res: ServerResponse, status: number, body: unknown) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
    // Il catalogo cambia solo dopo uno scan: niente cache, il costo è nullo.
    'Cache-Control': 'no-store',
  });
  res.end(payload);
}

/** SQLite non ha il tipo booleano: 0/1 → false/true per i campi "hasCover". */
function withBool(row: Record<string, unknown>): Record<string, unknown> {
  return { ...row, hasCover: Boolean(row.hasCover) };
}

type Handler = (req: IncomingMessage, res: ServerResponse, params: string[], url: URL) => void | Promise<void>;

const routes: Array<{ method: string; pattern: RegExp; handler: Handler }> = [];
const get = (pattern: RegExp, handler: Handler) => {
  routes.push({ method: 'GET', pattern, handler });
  routes.push({ method: 'HEAD', pattern, handler });
};
const post = (pattern: RegExp, handler: Handler) => {
  routes.push({ method: 'POST', pattern, handler });
};
const patch = (pattern: RegExp, handler: Handler) => {
  routes.push({ method: 'PATCH', pattern, handler });
};
const del = (pattern: RegExp, handler: Handler) => {
  routes.push({ method: 'DELETE', pattern, handler });
};

/**
 * Legge il corpo JSON di una richiesta.
 *
 * Il limite non è pignoleria: senza, una richiesta malevola (o solo sbagliata)
 * può far crescere il buffer finché il processo non finisce la memoria.
 */
async function readJson(req: IncomingMessage, maxBytes = 256 * 1024): Promise<unknown> {
  const pezzi: Buffer[] = [];
  let totale = 0;
  for await (const pezzo of req) {
    totale += (pezzo as Buffer).length;
    if (totale > maxBytes) throw new Error('Corpo della richiesta troppo grande');
    pezzi.push(pezzo as Buffer);
  }
  if (totale === 0) return {};
  return JSON.parse(Buffer.concat(pezzi).toString('utf8'));
}

/**
 * Legge il corpo grezzo di una richiesta (l'immagine di una copertina).
 *
 * Si carica il file da solo nel corpo, senza multipart: non c'è niente altro
 * da mandare, e evita di scrivere un parser per una sola richiesta.
 */
async function readBinary(req: IncomingMessage, maxBytes = 10 * 1024 * 1024): Promise<Buffer> {
  const pezzi: Buffer[] = [];
  let totale = 0;
  for await (const pezzo of req) {
    totale += (pezzo as Buffer).length;
    if (totale > maxBytes) throw new Error('Immagine troppo grande');
    pezzi.push(pezzo as Buffer);
  }
  return Buffer.concat(pezzi);
}

/** Nome di playlist accettabile: non vuoto e non spropositato. */
function nomeValido(valore: unknown): string | null {
  if (typeof valore !== 'string') return null;
  const pulito = valore.trim().replace(/\s+/g, ' ');
  return pulito.length > 0 && pulito.length <= 120 ? pulito : null;
}

/* ────────────────────── ripasso della libreria ────────────────────── */

// Un solo scan per volta: due in parallelo scriverebbero sulle stesse righe.
let scanning = false;

async function runScan(reason: string) {
  if (scanning) return null;
  scanning = true;
  try {
    const result = await scanLibrary({
      maxRemovalRatio: process.env.SCAN_MAX_REMOVAL ? Number(process.env.SCAN_MAX_REMOVAL) : undefined,
    });
    if (result.refused > 0) {
      console.warn(`scan (${reason}): RIFIUTATE ${result.refused} cancellazioni — la libreria è raggiungibile?`);
    }
    const changed = result.added + result.updated + result.removed + result.moved;
    if (changed > 0) {
      console.log(
        `scan (${reason}): +${result.added} ↻${result.updated} →${result.moved} -${result.removed}` +
        ` → ${result.total} tracce in ${(result.ms / 1000).toFixed(1)}s`,
      );
    }
    return result;
  } catch (err) {
    if (err instanceof LibraryMissingError) console.warn(`scan: ${err.message}`);
    else console.error('scan fallito:', err);
    return null;
  } finally {
    scanning = false;
  }
}

/* ─────────────────────────────── rotte ─────────────────────────────── */

get(/^\/api\/stats$/, (_req, res) => json(res, 200, q.stats.get()));

get(/^\/api\/albums$/, (_req, res) =>
  json(res, 200, (q.albums.all() as Array<{ hasCover: number }>).map(withBool)));

get(/^\/api\/albums\/(\d+)$/, (_req, res, [id]) => {
  const album = q.album.get(Number(id)) as { hasCover: number } | undefined;
  if (!album) return json(res, 404, { error: 'Album non trovato' });
  json(res, 200, { ...withBool(album), tracks: q.tracksOfAlbum.all(Number(id)) });
});

get(/^\/api\/artists$/, (_req, res) => json(res, 200, q.artists.all()));

get(/^\/api\/artists\/(\d+)$/, (_req, res, [id]) => {
  const artist = q.artist.get(Number(id));
  if (!artist) return json(res, 404, { error: 'Artista non trovato' });
  json(res, 200, {
    ...artist,
    albums: (q.albumsOfArtist.all(Number(id)) as Array<{ hasCover: number }>).map(withBool),
  });
});

get(/^\/api\/tracks$/, (_req, res) => json(res, 200, q.allTracks.all()));

get(/^\/api\/search$/, (_req, res, _params, url) => {
  const term = (url.searchParams.get('q') ?? '').trim();
  if (term.length < 2) return json(res, 200, []);
  json(res, 200, searchTracks(db, term));
});

// Ripasso su richiesta, dal pulsante "Aggiorna" nell'interfaccia.
post(/^\/api\/scan$/, async (_req, res) => {
  if (scanning) return json(res, 409, { error: 'Scan già in corso' });
  const result = await runScan('richiesto');
  if (!result) return json(res, 500, { error: 'Scan fallito: controlla i log del server' });
  json(res, 200, result);
});

/* ──────────────────── preferiti e ascolti ──────────────────── */

get(/^\/api\/favorites$/, (_req, res) => json(res, 200, listFavorites(db)));

post(/^\/api\/tracks\/(\d+)\/favorite$/, async (req, res, [id]) => {
  const corpo = await readJson(req) as { favorite?: unknown };
  const preferito = corpo.favorite !== false;
  if (!setFavorite(db, Number(id), preferito)) {
    return json(res, 404, { error: 'Traccia non trovata' });
  }
  json(res, 200, { id: Number(id), favorite: preferito });
});

// Registrato dal client quando il brano è stato davvero ascoltato (metà, o
// quattro minuti): la soglia sta nel player, qui si prende solo nota.
post(/^\/api\/tracks\/(\d+)\/play$/, (_req, res, [id]) => {
  const conteggio = recordPlay(db, Number(id));
  if (conteggio === null) return json(res, 404, { error: 'Traccia non trovata' });
  json(res, 200, { id: Number(id), playCount: conteggio });
});

get(/^\/api\/recent$/, (_req, res) => json(res, 200, recentlyPlayed(db)));

get(/^\/api\/top$/, (_req, res, _params, url) => {
  const giorni = Number(url.searchParams.get('days'));
  json(res, 200, mostPlayed(db, 60, Number.isFinite(giorni) && giorni > 0 ? giorni : undefined));
});

/* ─────────────────────────── playlist ─────────────────────────── */

get(/^\/api\/playlists$/, (_req, res) => json(res, 200, listPlaylists(db)));

get(/^\/api\/playlists\/(\d+)$/, (_req, res, [id]) => {
  const playlist = getPlaylist(db, Number(id));
  if (!playlist) return json(res, 404, { error: 'Playlist non trovata' });
  json(res, 200, playlist);
});

post(/^\/api\/playlists$/, async (req, res) => {
  const corpo = await readJson(req) as { name?: unknown };
  const name = nomeValido(corpo.name);
  if (!name) return json(res, 400, { error: 'Serve un nome' });
  json(res, 201, createPlaylist(db, name));
});

patch(/^\/api\/playlists\/(\d+)$/, async (req, res, [id]) => {
  const corpo = await readJson(req) as { name?: unknown };
  const name = nomeValido(corpo.name);
  if (!name) return json(res, 400, { error: 'Serve un nome' });
  if (!renamePlaylist(db, Number(id), name)) return json(res, 404, { error: 'Playlist non trovata' });
  json(res, 200, { id: Number(id), name });
});

del(/^\/api\/playlists\/(\d+)$/, (_req, res, [id]) => {
  if (!deletePlaylist(db, Number(id))) return json(res, 404, { error: 'Playlist non trovata' });
  json(res, 200, { ok: true });
});

// Accetta un brano solo o una lista: aggiungere un album intero è una sola richiesta.
post(/^\/api\/playlists\/(\d+)\/tracks$/, async (req, res, [id]) => {
  const corpo = await readJson(req) as { trackIds?: unknown; trackId?: unknown };
  const grezzi = Array.isArray(corpo.trackIds) ? corpo.trackIds
    : corpo.trackId !== undefined ? [corpo.trackId] : [];
  const trackIds = grezzi.map(Number).filter((n) => Number.isInteger(n) && n > 0);
  if (trackIds.length === 0) return json(res, 400, { error: 'Nessun brano indicato' });

  const aggiunti = addTracks(db, Number(id), trackIds);
  if (aggiunti < 0) return json(res, 404, { error: 'Playlist non trovata' });
  json(res, 200, { added: aggiunti });
});

del(/^\/api\/playlists\/(\d+)\/tracks\/(\d+)$/, (_req, res, [id, position]) => {
  if (!removeAt(db, Number(id), Number(position))) {
    return json(res, 404, { error: 'Posizione non valida' });
  }
  json(res, 200, { ok: true });
});

patch(/^\/api\/playlists\/(\d+)\/tracks$/, async (req, res, [id]) => {
  const corpo = await readJson(req) as { from?: unknown; to?: unknown };
  const from = Number(corpo.from);
  const to = Number(corpo.to);
  if (!Number.isInteger(from) || !Number.isInteger(to)) {
    return json(res, 400, { error: 'Servono "from" e "to"' });
  }
  if (!moveTrack(db, Number(id), from, to)) return json(res, 404, { error: 'Posizione non valida' });
  json(res, 200, { ok: true });
});

// Copertina della playlist: come quella degli album, l'URL porta ?v=<impronta>
// del contenuto, quindi può restare in cache per sempre senza rischi.
get(/^\/api\/playlists\/(\d+)\/cover$/, async (req, res, [id]) => {
  const file = coverFile(db, Number(id));
  if (!file) return json(res, 404, { error: 'Nessuna copertina' });
  sendFile(req, res, file, await stat(file), {
    contentType: 'image/jpeg',
    cacheControl: 'private, max-age=31536000, immutable',
  });
});

post(/^\/api\/playlists\/(\d+)\/cover$/, async (req, res, [id]) => {
  let dati: Buffer;
  try {
    dati = await readBinary(req);
  } catch (err) {
    return json(res, 413, { error: (err as Error).message });
  }
  if (dati.length === 0) return json(res, 400, { error: 'Nessuna immagine ricevuta' });

  const key = await setCover(db, Number(id), dati);
  if (key === null) {
    // setCover torna null sia se la playlist non c'è sia se ffmpeg non è
    // riuscito a leggere il file: si distingue guardando la playlist.
    const esiste = getPlaylist(db, Number(id));
    return esiste
      ? json(res, 400, { error: "Il file non sembra un'immagine leggibile" })
      : json(res, 404, { error: 'Playlist non trovata' });
  }
  json(res, 200, { coverKey: key });
});

del(/^\/api\/playlists\/(\d+)\/cover$/, (_req, res, [id]) => {
  if (!clearCover(db, Number(id))) return json(res, 404, { error: 'Playlist non trovata' });
  json(res, 200, { ok: true });
});

// Copertina dell'album: file su disco, estratto dai tag durante lo scan.
get(/^\/api\/albums\/(\d+)\/cover$/, async (req, res, [id]) => {
  const row = q.coverFile.get(Number(id)) as { coverPath: string | null } | undefined;
  if (!row?.coverPath || !existsSync(row.coverPath)) {
    return json(res, 404, { error: 'Nessuna copertina' });
  }
  const stats = await stat(row.coverPath);
  // L'URL porta ?v=<impronta del contenuto>: se la copertina cambia cambia
  // anche l'URL, quindi tenerla in cache per sempre è corretto.
  sendFile(req, res, row.coverPath, stats, {
    contentType: 'image/jpeg',
    cacheControl: 'private, max-age=31536000, immutable',
  });
});

// Testi: risolti al volo alla prima richiesta, poi serviti dalla cache in DB.
get(/^\/api\/tracks\/(\d+)\/lyrics$/, async (_req, res, [id]) => {
  const result = await getLyrics(db, Number(id));
  if (!result) return json(res, 404, { error: 'Traccia non trovata' });
  json(res, 200, result);
});

// Lo streaming vero e proprio.
get(/^\/api\/tracks\/(\d+)\/stream$/, async (req, res, [id]) => {
  const row = q.trackFile.get(Number(id)) as { path: string; mime: string; title: string } | undefined;
  if (!row) return json(res, 404, { error: 'Traccia non trovata' });
  try {
    const stats = await stat(row.path);
    sendFile(req, res, row.path, stats, {
      contentType: row.mime,
      cacheControl: 'private, max-age=86400',
    });
  } catch {
    // La riga esiste nel DB ma il file è sparito: serve un nuovo scan.
    json(res, 410, { error: 'File non più presente sul disco. Rilancia: npm run scan' });
  }
});

/* ───────────────────────────── il server ───────────────────────────── */

const DIST = path.resolve('dist');

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
  const started = process.hrtime.bigint();

  res.on('finish', () => {
    const ms = Number(process.hrtime.bigint() - started) / 1e6;
    const range = req.headers.range ? ` range=${req.headers.range}` : '';
    console.log(`${req.method} ${url.pathname} → ${res.statusCode} ${ms.toFixed(1)}ms${range}`);
  });

  try {
    for (const route of routes) {
      if (route.method !== req.method) continue;
      const match = route.pattern.exec(url.pathname);
      if (match) return await route.handler(req, res, match.slice(1), url);
    }

    // In sviluppo il frontend lo serve Vite (porta 5173) e ci arriva solo /api.
    // Dopo `npm run build` questo server serve anche dist/, da solo.
    if (!url.pathname.startsWith('/api/') && existsSync(DIST)) {
      const asset = path.join(DIST, url.pathname);
      const exists = existsSync(asset) && (await stat(asset)).isFile();

      // Solo i percorsi senza estensione sono rotte dell'app e ricadono
      // sull'index.html. Un /favicon.ico mancante deve dare 404, non HTML:
      // altrimenti un asset sbagliato sembra funzionare e rompe più in là.
      if (!exists && path.extname(url.pathname)) return json(res, 404, { error: 'Non trovato' });

      const file = exists ? asset : path.join(DIST, 'index.html');
      if (existsSync(file)) {
        const ext = path.extname(file);
        const types: Record<string, string> = {
          '.html': 'text/html; charset=utf-8',
          '.js': 'text/javascript; charset=utf-8',
          '.css': 'text/css; charset=utf-8',
          '.svg': 'image/svg+xml',
          '.png': 'image/png',
          '.jpg': 'image/jpeg',
          '.ico': 'image/x-icon',
          '.webmanifest': 'application/manifest+json',
        };
        // I file in /assets/ hanno l'hash nel nome: si possono tenere per
        // sempre. L'HTML e il service worker no — un sw.js in cache eterna
        // non si aggiornerebbe mai più, ed è un errore da cui non si torna
        // indietro senza svuotare la cache a mano.
        const immutable = url.pathname.startsWith('/assets/');
        return sendFile(req, res, file, await stat(file), {
          contentType: types[ext] ?? 'application/octet-stream',
          cacheControl: immutable ? 'public, max-age=31536000, immutable' : 'no-cache',
        });
      }
    }

    json(res, 404, { error: 'Non trovato' });
  } catch (err) {
    console.error(err);
    if (!res.headersSent) json(res, 500, { error: 'Errore interno' });
    else res.destroy();
  }
});

server.listen(PORT, () => {
  const s = q.stats.get() as { artists: number; albums: number; tracks: number };
  console.log(`mario-music su http://localhost:${PORT}`);
  console.log(`Libreria: ${s.tracks} brani, ${s.albums} album, ${s.artists} artisti`);
  if (s.tracks === 0) console.log('Libreria vuota → npm run seed && npm run scan');

  // Database creato prima che esistesse l'indice, o mai scansionato da allora:
  // senza questo la ricerca risponderebbe sempre a vuoto, in silenzio.
  if (indexIsStale(db)) {
    const n = rebuildSearchIndex(db);
    console.log(`Indice di ricerca ricostruito: ${n} tracce`);
  }

  if (SCAN_EVERY_MIN > 0) {
    console.log(`Ripasso automatico della libreria ogni ${SCAN_EVERY_MIN} minuti`);
    const timer = setInterval(() => void runScan('automatico'), SCAN_EVERY_MIN * 60_000);
    // unref: il timer non deve tenere in vita il processo se il server chiude.
    timer.unref();
  }
});
