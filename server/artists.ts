/**
 * artists.ts — la pagina di un artista.
 *
 * Tre domande, tre query:
 *   1. cosa ha pubblicato        → gli album, con quante tracce ciascuno
 *   2. cosa ascolti davvero      → i suoi brani più suonati DA TE
 *   3. che faccia gli diamo      → non avendo foto, una copertina sua
 *
 * Su "Top brani" c'è una scelta da difendere: si mostrano solo i brani con
 * almeno un ascolto. Senza altri utenti non esiste una classifica globale, e
 * la tabella `plays` è l'unico dato vero che abbiamo. Riempire la sezione con
 * cinque brani qualunque quando non c'è nulla da mostrare significherebbe
 * spacciare un ordine arbitrario per una classifica: meglio non mostrarla.
 */
import type { DatabaseSync } from 'node:sqlite';
import { COLONNE_TRACCIA } from './listening.ts';

const DA_TRACCE = `
  FROM tracks t
  JOIN albums  al ON al.id = t.album_id
  JOIN artists ar ON ar.id = t.artist_id
`;

export const MAX_TOP = 5;

export type ArtistCover = { albumId: number; coverKey: string } | null;

/** Gli album di un artista, dal più recente. */
export function albumsOfArtist(db: DatabaseSync, artistId: number): unknown[] {
  return db.prepare(`
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
  `).all(artistId);
}

/** I più ascoltati. Chi non è mai partito non compare: vedi sopra. */
export function topTracksOfArtist(db: DatabaseSync, artistId: number, limit = MAX_TOP): unknown[] {
  return db.prepare(`
    SELECT ${COLONNE_TRACCIA}
    ${DA_TRACCE}
    WHERE t.artist_id = ?
      AND EXISTS (SELECT 1 FROM plays p WHERE p.track_id = t.id)
    ORDER BY playCount DESC, t.title COLLATE NOCASE
    LIMIT ?
  `).all(artistId, limit);
}

/**
 * Tutti i brani, in ordine cronologico. Serve solo quando si preme Riproduci:
 * la pagina ne mostra cinque, spedirne settanta per disegnarla è sprecato.
 */
export function tracksOfArtist(db: DatabaseSync, artistId: number): unknown[] {
  return db.prepare(`
    SELECT ${COLONNE_TRACCIA}
    ${DA_TRACCE}
    WHERE t.artist_id = ?
    ORDER BY al.year, al.title COLLATE NOCASE, t.disc_no, t.track_no
  `).all(artistId);
}

/**
 * La copertina che fa da ritratto: quella dell'album più ascoltato, a parità
 * il più corposo, poi il più recente. Null se nessun suo album ne ha una.
 */
export function coverOfArtist(db: DatabaseSync, artistId: number): ArtistCover {
  const row = db.prepare(`
    SELECT al.id AS albumId, al.cover_key AS coverKey
    FROM albums al
    LEFT JOIN tracks t ON t.album_id = al.id
    LEFT JOIN plays  p ON p.track_id = t.id
    WHERE al.artist_id = ? AND al.cover_key IS NOT NULL
    GROUP BY al.id
    ORDER BY COUNT(p.id) DESC, COUNT(t.id) DESC, al.year DESC
    LIMIT 1
  `).get(artistId) as ArtistCover;
  return row ?? null;
}
