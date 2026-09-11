/**
 * listening.ts — preferiti e ascolti.
 *
 * Un ascolto si registra solo quando è stato davvero ascoltato: metà del brano
 * oppure quattro minuti, quello che viene prima. È la convenzione dello
 * scrobbling, e serve a non gonfiare i conteggi mentre si saltano i brani —
 * contarli all'avvio renderebbe "i più ascoltati" un elenco di pezzi scartati
 * dopo tre secondi.
 */
import type { DatabaseSync } from 'node:sqlite';

export const COLONNE_TRACCIA = `
  t.id, t.title, t.track_no AS trackNo, t.disc_no AS discNo, t.duration,
  t.codec, t.bitrate, t.sample_rate AS sampleRate, t.channels, t.size,
  al.id AS albumId, al.title AS album, al.cover_key AS coverKey,
  ar.id AS artistId, ar.name AS artist,
  EXISTS (SELECT 1 FROM favorites f WHERE f.track_id = t.id) AS favorite,
  (SELECT COUNT(*) FROM plays p WHERE p.track_id = t.id) AS playCount
`;

const DA_TRACCE = `
  FROM tracks t
  JOIN albums  al ON al.id = t.album_id
  JOIN artists ar ON ar.id = t.artist_id
`;

export function setFavorite(db: DatabaseSync, trackId: number, preferito: boolean): boolean {
  const esiste = db.prepare('SELECT 1 FROM tracks WHERE id = ?').get(trackId);
  if (!esiste) return false;

  if (preferito) {
    db.prepare('INSERT OR IGNORE INTO favorites (track_id, added_at) VALUES (?, ?)')
      .run(trackId, Date.now());
  } else {
    db.prepare('DELETE FROM favorites WHERE track_id = ?').run(trackId);
  }
  return true;
}

export function listFavorites(db: DatabaseSync): unknown[] {
  return db.prepare(`
    SELECT ${COLONNE_TRACCIA}, fav.added_at AS addedAt
    ${DA_TRACCE}
    JOIN favorites fav ON fav.track_id = t.id
    ORDER BY fav.added_at DESC
  `).all();
}

export function recordPlay(db: DatabaseSync, trackId: number): number | null {
  const esiste = db.prepare('SELECT 1 FROM tracks WHERE id = ?').get(trackId);
  if (!esiste) return null;
  db.prepare('INSERT INTO plays (track_id, played_at) VALUES (?, ?)').run(trackId, Date.now());
  return (db.prepare('SELECT COUNT(*) AS n FROM plays WHERE track_id = ?').get(trackId) as { n: number }).n;
}

/** Ultimi brani ascoltati, uno per traccia anche se ripetuta. */
export function recentlyPlayed(db: DatabaseSync, limit = 60): unknown[] {
  return db.prepare(`
    SELECT ${COLONNE_TRACCIA}, MAX(p.played_at) AS lastPlayed
    ${DA_TRACCE}
    JOIN plays p ON p.track_id = t.id
    GROUP BY t.id
    ORDER BY lastPlayed DESC
    LIMIT ?
  `).all(limit);
}

/** I più ascoltati, eventualmente limitati agli ultimi N giorni. */
export function mostPlayed(db: DatabaseSync, limit = 60, giorni?: number): unknown[] {
  const da = giorni ? Date.now() - giorni * 24 * 60 * 60 * 1000 : 0;
  return db.prepare(`
    SELECT ${COLONNE_TRACCIA}, COUNT(p.id) AS periodPlays
    ${DA_TRACCE}
    JOIN plays p ON p.track_id = t.id
    WHERE p.played_at >= ?
    GROUP BY t.id
    ORDER BY periodPlays DESC, MAX(p.played_at) DESC
    LIMIT ?
  `).all(da, limit);
}
