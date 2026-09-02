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

const PORT = Number(process.env.PORT ?? 4000);
const db = openDb();

/* ────────────────────────────── query SQL ────────────────────────────── */

const q = {
  albums: db.prepare(`
    SELECT al.id, al.title, al.year, al.genre,
           ar.id AS artistId, ar.name AS artist,
           COUNT(t.id) AS trackCount,
           ROUND(SUM(t.duration)) AS duration,
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
           al.cover_path IS NOT NULL AS hasCover
    FROM albums al JOIN artists ar ON ar.id = al.artist_id
    WHERE al.id = ?
  `),
  albumsOfArtist: db.prepare(`
    SELECT al.id, al.title, al.year, al.genre,
           ar.id AS artistId, ar.name AS artist,
           COUNT(t.id) AS trackCount,
           ROUND(SUM(t.duration)) AS duration,
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
    SELECT t.id, t.title, t.track_no AS trackNo, t.disc_no AS discNo, t.duration,
           t.codec, t.bitrate, t.sample_rate AS sampleRate, t.channels, t.size,
           al.id AS albumId, al.title AS album, ar.id AS artistId, ar.name AS artist
    FROM tracks t
    JOIN albums al ON al.id = t.album_id
    JOIN artists ar ON ar.id = t.artist_id
    WHERE t.album_id = ?
    ORDER BY t.disc_no, t.track_no, t.title COLLATE NOCASE
  `),
  allTracks: db.prepare(`
    SELECT t.id, t.title, t.track_no AS trackNo, t.disc_no AS discNo, t.duration,
           t.codec, t.bitrate, t.sample_rate AS sampleRate, t.channels, t.size,
           al.id AS albumId, al.title AS album, ar.id AS artistId, ar.name AS artist
    FROM tracks t
    JOIN albums al ON al.id = t.album_id
    JOIN artists ar ON ar.id = t.artist_id
    ORDER BY ar.name COLLATE NOCASE, al.year, t.disc_no, t.track_no
  `),
  trackFile: db.prepare('SELECT path, mime, title FROM tracks WHERE id = ?'),
  coverFile: db.prepare('SELECT cover_path AS coverPath FROM albums WHERE id = ?'),
  searchTracks: db.prepare(`
    SELECT t.id, t.title, t.track_no AS trackNo, t.disc_no AS discNo, t.duration,
           t.codec, t.bitrate, t.sample_rate AS sampleRate, t.channels, t.size,
           al.id AS albumId, al.title AS album, ar.id AS artistId, ar.name AS artist
    FROM tracks t
    JOIN albums al ON al.id = t.album_id
    JOIN artists ar ON ar.id = t.artist_id
    WHERE t.title LIKE ? OR al.title LIKE ? OR ar.name LIKE ?
    ORDER BY t.title COLLATE NOCASE
    LIMIT 50
  `),
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
  // LIKE con i caratteri jolly di SQLite messi in escape, altrimenti un
  // titolo che contiene % o _ cambierebbe il senso della query.
  const like = `%${term.replace(/[%_]/g, (c) => `\\${c}`)}%`;
  json(res, 200, q.searchTracks.all(like, like, like));
});

// Copertina dell'album: file su disco, estratto dai tag durante lo scan.
get(/^\/api\/albums\/(\d+)\/cover$/, async (req, res, [id]) => {
  const row = q.coverFile.get(Number(id)) as { coverPath: string | null } | undefined;
  if (!row?.coverPath || !existsSync(row.coverPath)) {
    return json(res, 404, { error: 'Nessuna copertina' });
  }
  const stats = await stat(row.coverPath);
  sendFile(req, res, row.coverPath, stats, {
    contentType: 'image/jpeg',
    cacheControl: 'private, max-age=604800',
  });
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
      const file = existsSync(asset) && (await stat(asset)).isFile()
        ? asset
        : path.join(DIST, 'index.html');
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
});
