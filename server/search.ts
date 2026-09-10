/**
 * search.ts — la ricerca, su indice full-text FTS5.
 *
 * Prima era una `LIKE '%testo%'` su tre colonne: niente indice, quindi una
 * scansione completa a ogni tasto premuto, nessun ordinamento per rilevanza
 * (i risultati uscivano in ordine alfabetico) e nessuna tolleranza agli
 * accenti. Con FTS5 si ha un indice vero, il punteggio bm25 e la ricerca per
 * prefisso mentre si digita.
 *
 * L'indice si ricostruisce da zero alla fine di ogni scan invece di essere
 * tenuto allineato con dei trigger: lo scanner è l'unico che modifica le
 * tracce, un rebuild completo su qualche migliaio di righe costa millisecondi,
 * e soprattutto non può andare fuori sincrono.
 */
import type { DatabaseSync } from 'node:sqlite';

/**
 * Traduce quello che scrive l'utente in una query FTS5.
 *
 * Non si può passare il testo grezzo: in FTS5 `MATCH` ha una sintassi con
 * operatori (AND, OR, NOT, virgolette, `*`, `:`, `^`), e una virgoletta
 * spaiata o un trattino iniziale fanno fallire l'intera query con un errore
 * di sintassi. Si estraggono quindi solo lettere e numeri, e ogni parola si
 * racchiude fra virgolette — così qualunque cosa venga digitata è trattata
 * come testo da cercare, mai come un operatore.
 *
 * L'asterisco finale su ogni parola serve a far combaciare i prefissi: si
 * cerca mentre si scrive, e "bea" deve già trovare "Beatles".
 */
export function buildMatchQuery(input: string): string | null {
  const parole = input.match(/[\p{L}\p{N}]+/gu);
  if (!parole || parole.length === 0) return null;
  // Massimo otto parole: oltre non serve, e tiene corta la query.
  return parole.slice(0, 8).map((p) => `"${p}"*`).join(' ');
}

/** Ricostruisce l'indice a partire dalle tabelle vere. */
export function rebuildSearchIndex(db: DatabaseSync): number {
  db.exec('DELETE FROM tracks_fts');
  db.exec(`
    INSERT INTO tracks_fts (rowid, title, artist, album)
    SELECT t.id, t.title, ar.name, al.title
    FROM tracks t
    JOIN artists ar ON ar.id = t.artist_id
    JOIN albums  al ON al.id = t.album_id
  `);
  return (db.prepare('SELECT COUNT(*) AS n FROM tracks_fts').get() as { n: number }).n;
}

/** Vero se l'indice non rispecchia più le tracce (database vecchio, o mai scansionato). */
export function indexIsStale(db: DatabaseSync): boolean {
  const tracce = (db.prepare('SELECT COUNT(*) AS n FROM tracks').get() as { n: number }).n;
  const indice = (db.prepare('SELECT COUNT(*) AS n FROM tracks_fts').get() as { n: number }).n;
  return tracce !== indice;
}

const SELEZIONE = `
  t.id, t.title, t.track_no AS trackNo, t.disc_no AS discNo, t.duration,
  t.codec, t.bitrate, t.sample_rate AS sampleRate, t.channels, t.size,
  al.id AS albumId, al.title AS album, al.cover_key AS coverKey,
  ar.id AS artistId, ar.name AS artist
`;

export function searchTracks(db: DatabaseSync, input: string, limit = 50): unknown[] {
  const match = buildMatchQuery(input);
  if (!match) return [];

  try {
    return db.prepare(`
      SELECT ${SELEZIONE}
      FROM tracks_fts f
      JOIN tracks t   ON t.id  = f.rowid
      JOIN albums al  ON al.id = t.album_id
      JOIN artists ar ON ar.id = t.artist_id
      WHERE tracks_fts MATCH ?
      -- Pesi: il titolo conta più dell'artista, che conta più dell'album.
      -- bm25 restituisce valori negativi, più bassi = più pertinenti.
      ORDER BY bm25(tracks_fts, 10.0, 5.0, 3.0)
      LIMIT ?
    `).all(match, limit);
  } catch {
    // Rete di sicurezza: se per qualsiasi motivo la query non è valida,
    // meglio nessun risultato che una schermata di errore mentre si digita.
    return [];
  }
}
