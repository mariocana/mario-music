/**
 * playlists.ts — creazione e ordinamento delle playlist.
 *
 * L'ordine sta in una colonna `position`, tenuta sempre contigua (0, 1, 2…).
 * Le riscritture dell'ordine cancellano e reinseriscono le righe dentro una
 * transazione, invece di aggiornarle una a una: la chiave primaria è
 * (playlist, posizione), quindi un aggiornamento in sequenza collideerebbe a
 * metà strada con una posizione ancora occupata.
 */
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { promisify } from 'node:util';
import { DATA_DIR } from './db.ts';

const run = promisify(execFile);
const COVERS = path.join(DATA_DIR, 'playlist-covers');

export type PlaylistSummary = {
  id: number;
  name: string;
  trackCount: number;
  duration: number;
  /** impronta della copertina personalizzata; null se non ce n'è una */
  coverKey: string | null;
  /** copertine dei primi brani, per il mosaico nell'elenco */
  covers: Array<{ albumId: number; coverKey: string | null }>;
};

const COLONNE_TRACCIA = `
  t.id, t.title, t.track_no AS trackNo, t.disc_no AS discNo, t.duration,
  t.codec, t.bitrate, t.sample_rate AS sampleRate, t.channels, t.size,
  al.id AS albumId, al.title AS album, al.cover_key AS coverKey,
  ar.id AS artistId, ar.name AS artist
`;

export function listPlaylists(db: DatabaseSync): PlaylistSummary[] {
  const righe = db.prepare(`
    SELECT p.id, p.name, p.cover_key AS coverKey,
           COUNT(pt.track_id) AS trackCount,
           ROUND(COALESCE(SUM(t.duration), 0)) AS duration
    FROM playlists p
    LEFT JOIN playlist_tracks pt ON pt.playlist_id = p.id
    LEFT JOIN tracks t ON t.id = pt.track_id
    GROUP BY p.id
    ORDER BY p.updated_at DESC
  `).all() as Array<Omit<PlaylistSummary, 'covers'>>;

  const copertine = db.prepare(`
    SELECT al.id AS albumId, al.cover_key AS coverKey
    FROM playlist_tracks pt
    JOIN tracks t ON t.id = pt.track_id
    JOIN albums al ON al.id = t.album_id
    WHERE pt.playlist_id = ?
    ORDER BY pt.position
    LIMIT 4
  `);

  return righe.map((r) => ({
    ...r,
    covers: copertine.all(r.id) as PlaylistSummary['covers'],
  }));
}

export function getPlaylist(db: DatabaseSync, id: number) {
  const playlist = db.prepare('SELECT id, name, cover_key AS coverKey FROM playlists WHERE id = ?').get(id) as
    { id: number; name: string; coverKey: string | null } | undefined;
  if (!playlist) return null;

  const tracks = db.prepare(`
    SELECT ${COLONNE_TRACCIA}, pt.position
    FROM playlist_tracks pt
    JOIN tracks t  ON t.id  = pt.track_id
    JOIN albums al ON al.id = t.album_id
    JOIN artists ar ON ar.id = t.artist_id
    WHERE pt.playlist_id = ?
    ORDER BY pt.position
  `).all(id);

  return { ...playlist, tracks };
}

export function createPlaylist(db: DatabaseSync, name: string): PlaylistSummary {
  const ora = Date.now();
  const id = Number(
    db.prepare('INSERT INTO playlists (name, created_at, updated_at) VALUES (?, ?, ?)')
      .run(name, ora, ora).lastInsertRowid,
  );
  return { id, name, trackCount: 0, duration: 0, coverKey: null, covers: [] };
}

export function renamePlaylist(db: DatabaseSync, id: number, name: string): boolean {
  return db.prepare('UPDATE playlists SET name = ?, updated_at = ? WHERE id = ?')
    .run(name, Date.now(), id).changes > 0;
}

export function deletePlaylist(db: DatabaseSync, id: number): boolean {
  // Il percorso della copertina va letto PRIMA di cancellare la riga:
  // dopo non c'è più modo di sapere quale file liberare, e resterebbe lì.
  const riga = db.prepare('SELECT cover_path AS coverPath FROM playlists WHERE id = ?').get(id) as
    { coverPath: string | null } | undefined;

  const cancellata = db.prepare('DELETE FROM playlists WHERE id = ?').run(id).changes > 0;
  if (cancellata) scartaSeOrfana(db, riga?.coverPath ?? null, null);
  return cancellata;
}

function tocca(db: DatabaseSync, id: number) {
  db.prepare('UPDATE playlists SET updated_at = ? WHERE id = ?').run(Date.now(), id);
}

/** Aggiunge in coda. Accetta più brani per poter infilare un album intero. */
export function addTracks(db: DatabaseSync, id: number, trackIds: number[]): number {
  const esiste = db.prepare('SELECT 1 FROM playlists WHERE id = ?').get(id);
  if (!esiste) return -1;

  const prossima = (db.prepare('SELECT COALESCE(MAX(position) + 1, 0) AS n FROM playlist_tracks WHERE playlist_id = ?')
    .get(id) as { n: number }).n;

  const ins = db.prepare('INSERT INTO playlist_tracks (playlist_id, track_id, position) VALUES (?, ?, ?)');
  const valido = db.prepare('SELECT 1 FROM tracks WHERE id = ?');

  db.exec('BEGIN');
  try {
    let posizione = prossima;
    let aggiunti = 0;
    for (const trackId of trackIds) {
      if (!valido.get(trackId)) continue;
      ins.run(id, trackId, posizione++);
      aggiunti++;
    }
    db.exec('COMMIT');
    tocca(db, id);
    return aggiunti;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

/** Legge l'ordine attuale come semplice elenco di id. */
function ordine(db: DatabaseSync, id: number): number[] {
  return (db.prepare('SELECT track_id AS trackId FROM playlist_tracks WHERE playlist_id = ? ORDER BY position')
    .all(id) as Array<{ trackId: number }>).map((r) => r.trackId);
}

/** Riscrive l'ordine da zero: unico modo sicuro con la chiave (playlist, posizione). */
function riscrivi(db: DatabaseSync, id: number, trackIds: number[]) {
  const del = db.prepare('DELETE FROM playlist_tracks WHERE playlist_id = ?');
  const ins = db.prepare('INSERT INTO playlist_tracks (playlist_id, track_id, position) VALUES (?, ?, ?)');
  db.exec('BEGIN');
  try {
    del.run(id);
    trackIds.forEach((trackId, i) => ins.run(id, trackId, i));
    db.exec('COMMIT');
    tocca(db, id);
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

export function removeAt(db: DatabaseSync, id: number, position: number): boolean {
  const attuale = ordine(db, id);
  if (position < 0 || position >= attuale.length) return false;
  attuale.splice(position, 1);
  riscrivi(db, id, attuale);
  return true;
}

export function moveTrack(db: DatabaseSync, id: number, from: number, to: number): boolean {
  const attuale = ordine(db, id);
  if (from < 0 || to < 0 || from >= attuale.length || to >= attuale.length) return false;
  const [spostato] = attuale.splice(from, 1);
  attuale.splice(to, 0, spostato);
  riscrivi(db, id, attuale);
  return true;
}

/* ─────────────────────── copertina personalizzata ─────────────────────── */

/**
 * Salva l'immagine caricata come copertina della playlist.
 *
 * L'immagine passa comunque per ffmpeg: normalizza qualsiasi formato in un
 * JPEG quadrato da 640px, e fa anche da controllo — se ffmpeg non riesce a
 * decodificarla, non era un'immagine e la richiesta viene rifiutata. Meglio
 * che fidarsi del Content-Type dichiarato dal client.
 *
 * Il nome del file è l'impronta del contenuto, non l'id della playlist: così
 * l'URL cambia quando cambia l'immagine, e browser e service worker non
 * possono servire quella vecchia.
 */
export async function setCover(db: DatabaseSync, id: number, dati: Buffer): Promise<string | null> {
  const playlist = db.prepare('SELECT cover_path AS coverPath FROM playlists WHERE id = ?').get(id) as
    { coverPath: string | null } | undefined;
  if (!playlist) return null;

  await mkdir(COVERS, { recursive: true });
  const grezzo = path.join(COVERS, `.in-arrivo-${id}`);
  const provvisorio = path.join(COVERS, `.lavorazione-${id}.jpg`);
  await writeFile(grezzo, dati);

  try {
    // Riempie un quadrato 640x640 e ritaglia il resto, come fanno le
    // copertine degli album: una playlist non deve avere bande nere.
    await run('ffmpeg', [
      '-y', '-loglevel', 'error',
      '-i', grezzo,
      '-vf', 'scale=640:640:force_original_aspect_ratio=increase,crop=640:640',
      '-frames:v', '1',
      '-c:v', 'mjpeg', '-q:v', '3',
      provvisorio,
    ]);
  } catch {
    await rm(grezzo, { force: true });
    return null;
  } finally {
    await rm(grezzo, { force: true });
  }

  const { readFile } = await import('node:fs/promises');
  const finale = await readFile(provvisorio);
  const key = createHash('sha1').update(finale).digest('hex').slice(0, 16);
  const destinazione = path.join(COVERS, `${key}.jpg`);
  await writeFile(destinazione, finale);
  await rm(provvisorio, { force: true });

  db.prepare('UPDATE playlists SET cover_path = ?, cover_key = ?, updated_at = ? WHERE id = ?')
    .run(destinazione, key, Date.now(), id);

  scartaSeOrfana(db, playlist.coverPath, destinazione);
  return key;
}

export function clearCover(db: DatabaseSync, id: number): boolean {
  const playlist = db.prepare('SELECT cover_path AS coverPath FROM playlists WHERE id = ?').get(id) as
    { coverPath: string | null } | undefined;
  if (!playlist) return false;

  db.prepare('UPDATE playlists SET cover_path = NULL, cover_key = NULL, updated_at = ? WHERE id = ?')
    .run(Date.now(), id);
  scartaSeOrfana(db, playlist.coverPath, null);
  return true;
}

/**
 * Cancella il vecchio file solo se nessuna playlist lo usa più.
 *
 * Serve il controllo perché due playlist possono avere caricato la stessa
 * immagine: avendo lo stesso contenuto hanno lo stesso nome, e cancellarla
 * per una la toglierebbe anche all'altra.
 */
function scartaSeOrfana(db: DatabaseSync, vecchia: string | null, nuova: string | null) {
  if (!vecchia || vecchia === nuova || !existsSync(vecchia)) return;
  const ancoraUsata = db.prepare('SELECT 1 FROM playlists WHERE cover_path = ?').get(vecchia);
  if (!ancoraUsata) void rm(vecchia, { force: true });
}

export function coverFile(db: DatabaseSync, id: number): string | null {
  const riga = db.prepare('SELECT cover_path AS coverPath FROM playlists WHERE id = ?').get(id) as
    { coverPath: string | null } | undefined;
  return riga?.coverPath && existsSync(riga.coverPath) ? riga.coverPath : null;
}
