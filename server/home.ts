/**
 * home.ts — "Per te": la prima schermata dell'app.
 *
 * Nessun consiglio intelligente, nessun modello: quattro domande a cui il
 * database sa già rispondere, e che messe in fila somigliano molto a quello
 * che fa Apple Music.
 *
 *   Ascoltati di recente  → cosa avevo per le mani ieri
 *   Aggiunti di recente   → cosa è entrato in libreria ultimamente
 *   Riscopri              → ascoltato tanto, ma non da mesi
 *   Top del mese          → i brani delle ultime settimane
 *
 * Tutte le sezioni possono essere vuote, e in quel caso spariscono: una
 * libreria appena creata ha solo "Aggiunti di recente", ed è giusto così.
 *
 * NOTA SULLE SOTTOQUERY — trackCount e duration si contano con due
 * sottoquery invece che con un JOIN e un GROUP BY. Con il JOIN su `plays`,
 * COUNT(t.id) conterebbe le righe del prodotto tracce × ascolti: un album di
 * 10 brani ascoltato 30 volte risulterebbe di 300 tracce. Le sottoquery
 * contano quello che devono contare.
 */
import type { DatabaseSync } from 'node:sqlite';
import { COLONNE_TRACCIA, mostPlayed } from './listening.ts';

/** Le colonne di un album, nella forma che il client già conosce. */
const COLONNE_ALBUM = `
  al.id, al.title, al.year, al.genre,
  ar.id AS artistId, ar.name AS artist,
  al.cover_key AS coverKey,
  al.cover_path IS NOT NULL AS hasCover,
  (SELECT COUNT(*)              FROM tracks t WHERE t.album_id = al.id) AS trackCount,
  (SELECT ROUND(SUM(t.duration)) FROM tracks t WHERE t.album_id = al.id) AS duration,
  (SELECT MAX(p.played_at) FROM plays p JOIN tracks t ON t.id = p.track_id
    WHERE t.album_id = al.id) AS lastPlayed,
  (SELECT COUNT(*) FROM plays p JOIN tracks t ON t.id = p.track_id
    WHERE t.album_id = al.id) AS plays,
  (SELECT MAX(t.added_at) FROM tracks t WHERE t.album_id = al.id) AS addedAt
  FROM albums al JOIN artists ar ON ar.id = al.artist_id
`;

const GIORNO = 24 * 60 * 60 * 1000;

/**
 * Le colonne calcolate non sono usabili in WHERE (SQLite non conosce ancora
 * i loro nomi a quel punto): si avvolge la SELECT e si filtra fuori. Gli
 * album sono poche centinaia, il costo è trascurabile e si legge meglio che
 * ripetere la sottoquery due volte.
 */
const avvolgi = (filtro: string, ordine: string) =>
  `SELECT * FROM (SELECT ${COLONNE_ALBUM}) WHERE ${filtro} ORDER BY ${ordine} LIMIT ?`;

/** Gli album toccati più di recente. */
export function recentAlbums(db: DatabaseSync, limit = 12): unknown[] {
  return db.prepare(avvolgi('lastPlayed IS NOT NULL', 'lastPlayed DESC')).all(limit);
}

/** Le novità: conta quando il brano è entrato in libreria, non la data del file. */
export function addedAlbums(db: DatabaseSync, limit = 12): unknown[] {
  // `id`, non `al.id`: fuori dalla SELECT avvolta l'alias della tabella non
  // esiste più, esistono solo i nomi delle colonne che ha prodotto.
  return db.prepare(avvolgi('addedAt IS NOT NULL', 'addedAt DESC, id DESC')).all(limit);
}

/**
 * Riscopri: album che hai ascoltato parecchio e poi lasciato lì. Il filtro è
 * doppio apposta — "non ascoltato da mesi" da solo pescherebbe quello che hai
 * messo su una volta e abbandonato, che non è una riscoperta ma un errore.
 */
export function rediscoverAlbums(db: DatabaseSync, limit = 12, giorni = 60, minAscolti = 3): unknown[] {
  const soglia = Date.now() - giorni * GIORNO;
  return db
    .prepare(avvolgi(`lastPlayed IS NOT NULL AND lastPlayed < ${soglia} AND plays >= ${minAscolti}`,
                     'plays DESC, lastPlayed ASC'))
    .all(limit);
}

/**
 * Mai ascoltati. È il compagno di "Riscopri" e copre il caso opposto: una
 * libreria giovane non ha ancora niente da riscoprire — gli ascolti sono
 * tutti di ieri — ma ha quasi sempre decine di album mai aperti.
 * L'ordine è casuale: è uno scaffale per curiosare, non una classifica.
 */
export function neverPlayedAlbums(db: DatabaseSync, limit = 12): unknown[] {
  return db.prepare(avvolgi('lastPlayed IS NULL AND trackCount > 0', 'RANDOM()')).all(limit);
}

/** I brani dell'ultimo mese. */
export function topOfMonth(db: DatabaseSync, limit = 10): unknown[] {
  return mostPlayed(db, limit, 30);
}

/** L'ultimo brano ascoltato, per il riquadro "Riprendi". */
export function ultimoAscolto(db: DatabaseSync): unknown {
  return db.prepare(`
    SELECT ${COLONNE_TRACCIA}, MAX(p.played_at) AS lastPlayed
    FROM tracks t
    JOIN albums  al ON al.id = t.album_id
    JOIN artists ar ON ar.id = t.artist_id
    JOIN plays   p  ON p.track_id = t.id
    GROUP BY t.id
    ORDER BY lastPlayed DESC
    LIMIT 1
  `).get() ?? null;
}

export function homePayload(db: DatabaseSync) {
  return {
    ripresa: ultimoAscolto(db),
    recenti: recentAlbums(db),
    aggiunti: addedAlbums(db),
    riscopri: rediscoverAlbums(db),
    mai: neverPlayedAlbums(db),
    top: topOfMonth(db),
  };
}
