/**
 * scanner.ts — indicizza media/library/ dentro data/library.db.
 *
 * Flusso per ogni file audio trovato:
 *   1. stat()   → dimensione e data di modifica
 *   2. se path+size+mtime coincidono con quanto già in DB → salta (idempotenza)
 *   3. ffprobe  → durata, codec, bitrate e tag (titolo/artista/album/traccia)
 *   4. upsert   → artista, album, traccia
 *   5. copertina → estratta dai tag una sola volta per album
 * Alla fine rimuove dal DB le tracce i cui file non esistono più.
 *
 * I tag valgono più del percorso: le cartelle sono solo un ripiego quando
 * il file è privo di metadati.
 */
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readdir as readDir, unlink } from 'node:fs/promises';
import { mkdir, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { openDb, DATA_DIR } from './db.ts';

const run = promisify(execFile);

const LIBRARY = path.resolve('media/library');
const COVERS = path.join(DATA_DIR, 'covers');

const AUDIO_MIME: Record<string, string> = {
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
  '.m4b': 'audio/mp4',
  '.aac': 'audio/aac',
  '.flac': 'audio/flac',
  '.ogg': 'audio/ogg',
  '.oga': 'audio/ogg',
  '.opus': 'audio/ogg',
  '.wav': 'audio/wav',
  '.aiff': 'audio/aiff',
  '.aif': 'audio/aiff',
};

type Probe = {
  format?: { duration?: string; bit_rate?: string; tags?: Record<string, string> };
  streams?: Array<{
    codec_type?: string;
    codec_name?: string;
    sample_rate?: string;
    channels?: number;
    tags?: Record<string, string>;
  }>;
};

/** Percorre la libreria in profondità e restituisce i file audio riconosciuti. */
async function* walk(dir: string): AsyncGenerator<string> {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walk(full);
    } else if (AUDIO_MIME[path.extname(entry.name).toLowerCase()]) {
      yield full;
    }
  }
}

async function probe(file: string): Promise<Probe> {
  const { stdout } = await run('ffprobe', [
    '-v', 'error',
    '-print_format', 'json',
    '-show_format',
    '-show_streams',
    file,
  ], { maxBuffer: 8 * 1024 * 1024 });
  return JSON.parse(stdout) as Probe;
}

/** I tag hanno maiuscole incoerenti tra formati (ID3 vs MP4 vs Vorbis). */
function tag(tags: Record<string, string> | undefined, ...names: string[]): string | undefined {
  if (!tags) return undefined;
  const lower: Record<string, string> = {};
  for (const [k, v] of Object.entries(tags)) lower[k.toLowerCase()] = v;
  for (const name of names) {
    const value = lower[name.toLowerCase()];
    if (value && value.trim()) return value.trim();
  }
  return undefined;
}

/** "3/12" → 3, "07" → 7, "" → undefined */
function num(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const n = Number.parseInt(value.split('/')[0], 10);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * Nome del file di copertina, derivato da artista + album.
 *
 * NON si usa l'id dell'album: gli id vengono riciclati da SQLite quando le
 * righe si cancellano, e durante un import la stessa libreria può essere
 * ricreata più volte. Con `album-<id>.jpg` un album nuovo ereditava la
 * copertina di quello che aveva avuto quell'id prima: copertine sbagliate
 * sui brani sbagliati. Un nome derivato dal contenuto non ha questo problema.
 */
function coverKeyFor(artist: string, album: string): string {
  return createHash('sha1').update(`${artist}\u0000${album}`).digest('hex').slice(0, 16);
}

function coverFileFor(artist: string, album: string): string {
  return path.join(COVERS, `${coverKeyFor(artist, album)}.jpg`);
}

/** Estrae la copertina incorporata nel file; se non c'è, cerca cover.* accanto. */
async function extractCover(file: string, dest: string): Promise<string | null> {
  await mkdir(COVERS, { recursive: true });

  try {
    await run('ffmpeg', [
      '-y', '-loglevel', 'error',
      '-i', file,
      '-map', '0:v:0', '-frames:v', '1',
      '-vf', 'scale=640:-1',
      '-c:v', 'mjpeg', '-q:v', '3',
      dest,
    ]);
    return dest;
  } catch {
    /* niente copertina incorporata utilizzabile: si prova il fallback */
  }

  for (const name of ['cover.jpg', 'cover.png', 'folder.jpg', 'front.jpg']) {
    const candidate = path.join(path.dirname(file), name);
    if (existsSync(candidate)) {
      try {
        await run('ffmpeg', ['-y', '-loglevel', 'error', '-i', candidate,
          '-vf', 'scale=640:-1', '-c:v', 'mjpeg', '-q:v', '3', dest]);
        return dest;
      } catch { /* immagine illeggibile: si prova il candidato successivo */ }
    }
  }
  return null;
}

export type ScanResult = {
  added: number;
  updated: number;
  skipped: number;
  removed: number;
  total: number;
  /** millisecondi impiegati: utile per capire se lo scan periodico pesa */
  ms: number;
};

export class LibraryMissingError extends Error {
  // Campo dichiarato e assegnato a mano: Node strippa i tipi ma non
  // trasforma le "parameter properties" di TypeScript (constructor(public x)).
  readonly dir: string;

  constructor(dir: string) {
    super(`Nessuna libreria in ${dir}`);
    this.dir = dir;
  }
}

/**
 * Indicizza la libreria. Idempotente: rilegge solo i file il cui percorso,
 * dimensione o data di modifica sono cambiati.
 *
 * `onFile` riceve una riga di resoconto per ogni file toccato: la CLI la
 * stampa, il server la ignora.
 */
export async function scanLibrary(onFile?: (line: string) => void): Promise<ScanResult> {
  if (!existsSync(LIBRARY)) throw new LibraryMissingError(LIBRARY);

  const startedAt = Date.now();
  const db = openDb();

  const findArtist = db.prepare('SELECT id FROM artists WHERE name = ?');
  const insArtist = db.prepare('INSERT INTO artists (name) VALUES (?)');
  const findAlbum = db.prepare('SELECT id, cover_path FROM albums WHERE artist_id = ? AND title = ?');
  const insAlbum = db.prepare('INSERT INTO albums (artist_id, title, year, genre) VALUES (?, ?, ?, ?)');
  const setCover = db.prepare('UPDATE albums SET cover_path = ?, cover_key = ? WHERE id = ?');
  const findTrack = db.prepare('SELECT id, size, mtime FROM tracks WHERE path = ?');
  const upsertTrack = db.prepare(`
    INSERT INTO tracks (album_id, artist_id, title, track_no, disc_no, duration,
                        path, size, mtime, codec, mime, bitrate, sample_rate, channels)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(path) DO UPDATE SET
      album_id = excluded.album_id, artist_id = excluded.artist_id,
      title = excluded.title, track_no = excluded.track_no, disc_no = excluded.disc_no,
      duration = excluded.duration, size = excluded.size, mtime = excluded.mtime,
      codec = excluded.codec, mime = excluded.mime, bitrate = excluded.bitrate,
      sample_rate = excluded.sample_rate, channels = excluded.channels
  `);

  function artistId(name: string): number {
    const row = findArtist.get(name) as { id: number } | undefined;
    if (row) return row.id;
    return Number(insArtist.run(name).lastInsertRowid);
  }

  function albumId(artist: number, title: string, year?: number, genre?: string) {
    const row = findAlbum.get(artist, title) as { id: number; cover_path: string | null } | undefined;
    if (row) return row;
    const id = Number(insAlbum.run(artist, title, year ?? null, genre ?? null).lastInsertRowid);
    return { id, cover_path: null };
  }

  const seen = new Set<string>();
  let added = 0, updated = 0, skipped = 0;

  for await (const file of walk(LIBRARY)) {
    seen.add(file);
    const st = await stat(file);
    const mtime = Math.floor(st.mtimeMs);

    const existing = findTrack.get(file) as { id: number; size: number; mtime: number } | undefined;
    if (existing && existing.size === st.size && existing.mtime === mtime) {
      skipped++;
      continue;
    }

    const info = await probe(file);
    const tags = info.format?.tags;
    const audio = info.streams?.find((s) => s.codec_type === 'audio');

    // Nomi delle cartelle come ripiego: <libreria>/<artista>/<album>/<file>
    const dir = path.dirname(file);
    const folderAlbum = path.basename(dir).replace(/\s*\(\d{4}\)\s*$/, '');
    const folderArtist = path.basename(path.dirname(dir));

    const artistName = tag(tags, 'album_artist', 'albumartist', 'artist') ?? folderArtist ?? 'Artista sconosciuto';
    const albumTitle = tag(tags, 'album') ?? folderAlbum ?? 'Album sconosciuto';
    const title = tag(tags, 'title') ?? path.basename(file, path.extname(file));
    const year = num(tag(tags, 'date', 'year', 'originalyear'));
    const genre = tag(tags, 'genre');

    const aId = artistId(artistName);
    const alb = albumId(aId, albumTitle, year, genre);

    upsertTrack.run(
      alb.id,
      aId,
      title,
      num(tag(tags, 'track', 'tracknumber')) ?? null,
      num(tag(tags, 'disc', 'discnumber')) ?? 1,
      Number(info.format?.duration ?? 0),
      file,
      st.size,
      mtime,
      audio?.codec_name ?? null,
      AUDIO_MIME[path.extname(file).toLowerCase()],
      Number(info.format?.bit_rate ?? 0) || null,
      Number(audio?.sample_rate ?? 0) || null,
      audio?.channels ?? null,
    );

    if (existing) updated++; else added++;
    onFile?.(`  ${existing ? '↻' : '+'} ${artistName} — ${albumTitle} — ${title}`);
  }

  // Pulizia: via le tracce i cui file sono spariti, poi album e artisti rimasti vuoti.
  const all = db.prepare('SELECT id, path FROM tracks').all() as Array<{ id: number; path: string }>;
  const gone = all.filter((t) => !seen.has(t.path));
  const del = db.prepare('DELETE FROM tracks WHERE id = ?');
  for (const t of gone) del.run(t.id);
  db.exec('DELETE FROM albums  WHERE id NOT IN (SELECT DISTINCT album_id  FROM tracks)');
  db.exec('DELETE FROM artists WHERE id NOT IN (SELECT DISTINCT artist_id FROM tracks)');

  // ── copertine ──
  // Fuori dal ciclo sui file, apposta: i file già indicizzati vengono saltati,
  // quindi qui dentro le copertine non verrebbero mai riviste. Con una fase a
  // parte, un album a cui manca la copertina la recupera al primo scan utile.
  const albumsToCover = db.prepare(`
    SELECT al.id, al.title, al.cover_path AS coverPath, al.cover_key AS coverKey, ar.name AS artist,
           (SELECT t.path FROM tracks t WHERE t.album_id = al.id
            ORDER BY t.disc_no, t.track_no LIMIT 1) AS sample
    FROM albums al JOIN artists ar ON ar.id = al.artist_id
  `).all() as Array<{
    id: number; title: string; coverPath: string | null; coverKey: string | null;
    artist: string; sample: string | null;
  }>;

  const wanted = new Set<string>();
  for (const album of albumsToCover) {
    if (!album.sample) continue;
    const key = coverKeyFor(album.artist, album.title);
    const dest = path.join(COVERS, `${key}.jpg`);
    wanted.add(`${key}.jpg`);

    // Si rifà se manca il file, se la riga punta ancora al vecchio schema di
    // nomi basato sull'id, o se manca l'impronta che finisce nell'URL.
    if (album.coverPath === dest && album.coverKey === key && existsSync(dest)) continue;

    const cover = existsSync(dest) ? dest : await extractCover(album.sample, dest);
    setCover.run(cover, cover ? key : null, album.id);
  }

  // Via i file di copertina che non appartengono più a nessun album.
  try {
    for (const name of await readDir(COVERS)) {
      if (!wanted.has(name)) await unlink(path.join(COVERS, name));
    }
  } catch { /* la cartella può non esistere ancora */ }

  const total = (db.prepare('SELECT COUNT(*) AS n FROM tracks').get() as { n: number }).n;
  db.close();

  return { added, updated, skipped, removed: gone.length, total, ms: Date.now() - startedAt };
}
