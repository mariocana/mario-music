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
import { open as openFile } from 'node:fs/promises';
import type { DatabaseSync } from 'node:sqlite';
import { existsSync, readdirSync } from 'node:fs';
import { readdir as readDir, unlink } from 'node:fs/promises';
import { mkdir, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { openDb, DATA_DIR } from './db.ts';
import { rebuildSearchIndex } from './search.ts';

const run = promisify(execFile);

const LIBRARY = path.resolve('media/library');

/**
 * Impronta del contenuto di un file: dimensione + primi e ultimi 512 KB.
 *
 * Serve a riconoscere un file SPOSTATO: il percorso cambia, l'impronta no.
 * Non si legge tutto il file (6,9 GB di libreria sarebbero minuti), ma
 * nemmeno solo l'inizio: negli MP3 l'inizio è spesso la copertina incorporata,
 * identica per tutte le tracce di un album. La coda invece è audio, e cambia.
 */
export async function fingerprintFile(file: string, size: number): Promise<string> {
  const PEZZO = 512 * 1024;
  const hash = createHash('sha1').update(String(size));
  const fh = await openFile(file, 'r');
  try {
    const testa = Buffer.alloc(Math.min(PEZZO, size));
    await fh.read(testa, 0, testa.length, 0);
    hash.update(testa);
    if (size > PEZZO) {
      const coda = Buffer.alloc(Math.min(PEZZO, size - PEZZO));
      await fh.read(coda, 0, coda.length, size - coda.length);
      hash.update(coda);
    }
  } finally {
    await fh.close();
  }
  return hash.digest('hex');
}
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

/** Cartelle tipo "CD1", "Disc 2", "Disco 03": non sono album, sono dischi. */
const DISC_FOLDER = /^(?:cd|disc|disco|disk)\s*[-_]?\s*(\d{1,2})$/i;

/**
 * Ricava album, artista e numero di disco dalla posizione del file.
 *
 * Serve solo come ripiego, quando i tag non dicono niente: i tag vincono
 * sempre. La disposizione supportata è quella reale della libreria —
 * file sciolti nella radice, oppure una cartella per album:
 *
 *   library/canzone.mp3                  → nessun album: "Singoli"
 *   library/Album/01 brano.mp3           → album = "Album"
 *   library/Album/CD2/01 brano.mp3       → album = "Album", disco 2
 *   library/Artista/Album/01 brano.mp3   → anche questa, se la usi
 *
 * La versione precedente dava per scontato `Artista/Album/file` e risaliva
 * sempre di due livelli: sui file sciolti finiva per chiamare l'album
 * "library" e l'artista "media", cioè pezzi del percorso del progetto.
 */
export function fromPath(
  file: string,
  /** dice se una cartella contiene altre cartelle: serve a capire cos'è */
  haSottocartelle: (dir: string) => boolean,
  libraryDir: string = LIBRARY,
): { album: string; artist?: string; disc?: number } {
  const relative = path.relative(libraryDir, path.dirname(file));
  const parts = relative === '' || relative === '.' ? [] : relative.split(path.sep);

  let disc: number | undefined;
  const last = parts.at(-1);
  const match = last ? DISC_FOLDER.exec(last) : null;
  if (match) {
    disc = Number(match[1]);
    parts.pop();
  }

  // Direttamente nella radice: un singolo che non appartiene a nessun album.
  if (parts.length === 0) return { album: 'Singoli', disc };

  /** "Nome album (2014)" → "Nome album" */
  const pulisci = (nome: string) => nome.replace(/\s*[([]\d{4}[)\]]\s*$/, '').trim();

  if (parts.length === 1) {
    // Una cartella sola è ambigua: può essere un album, oppure la cartella
    // di un artista con dentro i suoi singoli. Le si distingue guardando se
    // contiene altre cartelle — un artista ha dentro gli album, un album no.
    //
    // Tranne quando abbiamo appena scartato una cartella di disco: allora
    // le sottocartelle sono i CD, e questa è un album per definizione.
    // Senza questa eccezione un cofanetto diventerebbe un artista.
    const dir = path.join(libraryDir, ...parts);
    if (disc === undefined && haSottocartelle(dir)) {
      return { album: 'Singoli', artist: parts[0], disc };
    }
    return { album: pulisci(parts[0]) || 'Singoli', disc };
  }

  // Due o più livelli: .../Artista/Album/brano
  return { album: pulisci(parts.at(-1)!) || 'Singoli', artist: parts.at(-2), disc };
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

/** Estrae la copertina incorporata nel file; se non c'è, cerca cover.* accanto. */
async function extractCover(file: string, dest: string): Promise<string | null> {
  await mkdir(path.dirname(dest), { recursive: true });

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
  /** file saltati perché illeggibili o spariti durante lo scan */
  failed: number;
  /** file ritrovati altrove grazie all'impronta: stessa traccia, percorso nuovo */
  moved: number;
  removed: number;
  /**
   * Cancellazioni NON eseguite perché sarebbero state troppe in un colpo solo
   * (disco esterno non montato, cartella rinominata a metà copia…). Zero in
   * condizioni normali.
   */
  refused: number;
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
export type ScanOptions = {
  onFile?: (line: string) => void;
  /** radice della libreria; i test ne usano una temporanea */
  libraryDir?: string;
  /** database già aperto; i test ne usano uno in memoria */
  db?: DatabaseSync;
  /**
   * Dove stanno le copertine estratte. Va passata nei test: a fine scan i
   * file orfani vengono cancellati, e un test sulla cartella vera svuoterebbe
   * le copertine della libreria.
   */
  coversDir?: string;
  /**
   * Quota massima di tracce che uno scan può cancellare in un colpo solo,
   * fra 0 e 1. Oltre, si rifiuta: quasi certamente non è la libreria a
   * essere cambiata, ma il disco a non essere montato.
   */
  maxRemovalRatio?: number;
};

export async function scanLibrary(opts: ScanOptions = {}): Promise<ScanResult> {
  const { onFile, libraryDir = LIBRARY, coversDir = COVERS, maxRemovalRatio = 0.5 } = opts;
  if (!existsSync(libraryDir)) throw new LibraryMissingError(libraryDir);

  const startedAt = Date.now();
  const db = opts.db ?? openDb();
  const chiudiDb = !opts.db;

  const findArtist = db.prepare('SELECT id FROM artists WHERE name = ?');
  const insArtist = db.prepare('INSERT INTO artists (name) VALUES (?)');
  const findAlbum = db.prepare('SELECT id, cover_path FROM albums WHERE artist_id = ? AND title = ?');
  const insAlbum = db.prepare('INSERT INTO albums (artist_id, title, year, genre) VALUES (?, ?, ?, ?)');
  const setCover = db.prepare('UPDATE albums SET cover_path = ?, cover_key = ? WHERE id = ?');
  const findTrack = db.prepare('SELECT id, size, mtime, fingerprint FROM tracks WHERE path = ?');
  const setFingerprint = db.prepare('UPDATE tracks SET fingerprint = ? WHERE id = ?');
  // Stessa impronta, percorso diverso: candidato a "spostato".
  const findByFingerprint = db.prepare('SELECT id, path FROM tracks WHERE fingerprint = ? AND path != ?');
  const movePath = db.prepare('UPDATE tracks SET path = ? WHERE id = ?');
  const upsertTrack = db.prepare(`
    INSERT INTO tracks (album_id, artist_id, title, track_no, disc_no, duration,
                        path, size, mtime, codec, mime, bitrate, sample_rate, channels,
                        embedded_lyrics, fingerprint)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(path) DO UPDATE SET
      album_id = excluded.album_id, artist_id = excluded.artist_id,
      title = excluded.title, track_no = excluded.track_no, disc_no = excluded.disc_no,
      duration = excluded.duration, size = excluded.size, mtime = excluded.mtime,
      codec = excluded.codec, mime = excluded.mime, bitrate = excluded.bitrate,
      sample_rate = excluded.sample_rate, channels = excluded.channels,
      embedded_lyrics = excluded.embedded_lyrics, fingerprint = excluded.fingerprint
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

  // Una readdir per cartella, non per file: la libreria ne ha un centinaio.
  const cacheSottocartelle = new Map<string, boolean>();
  const haSottocartelle = (dir: string): boolean => {
    let risposta = cacheSottocartelle.get(dir);
    if (risposta === undefined) {
      try {
        risposta = readdirSync(dir, { withFileTypes: true })
          .some((e) => e.isDirectory() && !e.name.startsWith('.'));
      } catch {
        risposta = false;
      }
      cacheSottocartelle.set(dir, risposta);
    }
    return risposta;
  };

  const seen = new Set<string>();
  let added = 0, updated = 0, skipped = 0, failed = 0, moved = 0;

  for await (const file of walk(libraryDir)) {
    seen.add(file);

    let st;
    try {
      st = await stat(file);
    } catch {
      // Sparito fra l'elenco della cartella e adesso: capita di continuo
      // mentre si riordina la libreria. Si toglie da `seen` così la pulizia
      // finale lo rimuove anche dal database, e si va avanti.
      seen.delete(file);
      failed++;
      continue;
    }
    const mtime = Math.floor(st.mtimeMs);

    const existing = findTrack.get(file) as
      { id: number; size: number; mtime: number; fingerprint: string | null } | undefined;
    if (existing && existing.size === st.size && existing.mtime === mtime) {
      // Righe di prima che esistesse l'impronta: si calcola una volta sola,
      // altrimenti al primo spostamento non ci sarebbe niente da confrontare.
      if (!existing.fingerprint) {
        try { setFingerprint.run(await fingerprintFile(file, st.size), existing.id); } catch { /* si riprova al prossimo giro */ }
      }
      skipped++;
      continue;
    }

    // Percorso nuovo: prima di creare una traccia, si controlla se è un file
    // già noto che ha solo cambiato posto. Se sì si sposta la riga esistente,
    // così tiene id, playlist, preferiti e ascolti.
    let impronta: string | null = null;
    let spostato = false;
    if (!existing) {
      try {
        impronta = await fingerprintFile(file, st.size);
        const gemello = findByFingerprint.get(impronta, file) as { id: number; path: string } | undefined;
        if (gemello && !existsSync(gemello.path)) {
          movePath.run(file, gemello.id);
          spostato = true;
        }
      } catch { /* impronta non calcolabile: si procede come file nuovo */ }
    }

    let info: Probe;
    try {
      info = await probe(file);
    } catch (err) {
      // File illeggibile o scomparso: si salta quello, non l'intera libreria.
      // Se esiste ancora resta in `seen`, così una riga valida non viene
      // cancellata per un errore momentaneo di lettura.
      if (!existsSync(file)) seen.delete(file);
      failed++;
      onFile?.(`  ! ${path.basename(file)}: ${(err as Error).message.split('\n')[0]}`);
      continue;
    }
    const tags = info.format?.tags;
    const audio = info.streams?.find((s) => s.codec_type === 'audio');

    // I tag vincono; il percorso è solo il ripiego per i file senza metadati.
    const fromFolder = fromPath(file, haSottocartelle, libraryDir);

    const artistName = tag(tags, 'album_artist', 'albumartist', 'artist')
      ?? fromFolder.artist ?? 'Artista sconosciuto';
    const albumTitle = tag(tags, 'album') ?? fromFolder.album;
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
      num(tag(tags, 'disc', 'discnumber')) ?? fromFolder.disc ?? 1,
      Number(info.format?.duration ?? 0),
      file,
      st.size,
      mtime,
      audio?.codec_name ?? null,
      AUDIO_MIME[path.extname(file).toLowerCase()],
      Number(info.format?.bit_rate ?? 0) || null,
      Number(audio?.sample_rate ?? 0) || null,
      audio?.channels ?? null,
      // I testi nei tag si chiamano in mille modi diversi ("lyrics-XXX",
      // "unsyncedlyrics", "USLT"): si prende il primo campo che contiene
      // "lyric" nel nome. Non sono sincronizzati, servono da ripiego.
      (() => {
        const chiave = Object.keys(tags ?? {}).find((k) => /lyric/i.test(k));
        const testo = chiave ? tags![chiave] : undefined;
        return testo?.trim() || null;
      })(),
      impronta ?? existing?.fingerprint ?? null,
    );

    if (spostato) moved++; else if (existing) updated++; else added++;
    onFile?.(`  ${spostato ? '→' : existing ? '↻' : '+'} ${artistName} — ${albumTitle} — ${title}`);
  }

  // Pulizia: via le tracce i cui file sono spariti, poi album e artisti rimasti vuoti.
  const all = db.prepare('SELECT id, path FROM tracks').all() as Array<{ id: number; path: string }>;
  const gone = all.filter((t) => !seen.has(t.path));

  // Freno: se sparirebbe più della quota consentita, non è la libreria a
  // essere cambiata — è il disco a non essere montato, o la cartella a essere
  // a metà di una copia. Cancellare qui porterebbe via a cascata playlist,
  // preferiti e ascolti, che non tornano rimontando il disco.
  let refused = 0;
  const troppe = all.length >= 10 && gone.length / all.length > maxRemovalRatio;
  if (troppe) {
    refused = gone.length;
    onFile?.(`  ⚠ ${gone.length} tracce su ${all.length} risultano sparite: cancellazione RIFIUTATA. ` +
      'Se è voluto, rilancia con SCAN_MAX_REMOVAL=1');
  } else {
    const del = db.prepare('DELETE FROM tracks WHERE id = ?');
    for (const t of gone) del.run(t.id);
  }
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
    const dest = path.join(coversDir, `${key}.jpg`);
    wanted.add(`${key}.jpg`);

    // Si rifà se manca il file, se la riga punta ancora al vecchio schema di
    // nomi basato sull'id, o se manca l'impronta che finisce nell'URL.
    if (album.coverPath === dest && album.coverKey === key && existsSync(dest)) continue;

    const cover = existsSync(dest) ? dest : await extractCover(album.sample, dest);
    setCover.run(cover, cover ? key : null, album.id);
  }

  // Via i file di copertina che non appartengono più a nessun album.
  try {
    for (const name of await readDir(coversDir)) {
      if (!wanted.has(name)) await unlink(path.join(coversDir, name));
    }
  } catch { /* la cartella può non esistere ancora */ }

  // L'indice di ricerca si rifà da zero: lo scanner è l'unico che tocca le
  // tracce, e un rebuild completo non può andare fuori sincrono come farebbero
  // dei trigger tenuti allineati a mano.
  rebuildSearchIndex(db);

  const total = (db.prepare('SELECT COUNT(*) AS n FROM tracks').get() as { n: number }).n;
  if (chiudiDb) db.close();

  return {
    added, updated, skipped, failed, moved,
    removed: troppe ? 0 : gone.length,
    refused,
    total,
    ms: Date.now() - startedAt,
  };
}
