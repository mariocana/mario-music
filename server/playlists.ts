/**
 * playlists.ts — creazione e ordinamento delle playlist.
 *
 * L'ordine sta in una colonna `position`, tenuta sempre contigua (0, 1, 2…).
 * Le riscritture dell'ordine cancellano e reinseriscono le righe dentro una
 * transazione, invece di aggiornarle una a una: la chiave primaria è
 * (playlist, posizione), quindi un aggiornamento in sequenza collideerebbe a
 * metà strada con una posizione ancora occupata.
 */
import type { DatabaseSync } from 'node:sqlite';

export type PlaylistSummary = {
  id: number;
  name: string;
  trackCount: number;
  duration: number;
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
    SELECT p.id, p.name,
           COUNT(pt.track_id) AS trackCount,
           ROUND(COALESCE(SUM(t.duration), 0)) AS duration
    FROM playlists p
    LEFT JOIN playlist_tracks pt ON pt.playlist_id = p.id
    LEFT JOIN tracks t ON t.id = pt.track_id
    GROUP BY p.id
    ORDER BY p.updated_at DESC
  `).all() as Array<{ id: number; name: string; trackCount: number; duration: number }>;

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
  const playlist = db.prepare('SELECT id, name FROM playlists WHERE id = ?').get(id) as
    { id: number; name: string } | undefined;
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
  return { id, name, trackCount: 0, duration: 0, covers: [] };
}

export function renamePlaylist(db: DatabaseSync, id: number, name: string): boolean {
  return db.prepare('UPDATE playlists SET name = ?, updated_at = ? WHERE id = ?')
    .run(name, Date.now(), id).changes > 0;
}

export function deletePlaylist(db: DatabaseSync, id: number): boolean {
  return db.prepare('DELETE FROM playlists WHERE id = ?').run(id).changes > 0;
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
