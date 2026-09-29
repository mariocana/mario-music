/**
 * stats.ts — il riepilogo degli ascolti, sul modello di Apple Music Replay.
 *
 * Tutto esce da una tabella sola: `plays`, una riga per ascolto con l'istante
 * in cui è avvenuto. Sembra poco, e invece basta per dire quanto hai
 * ascoltato, cosa, quando, e come è cambiato nei mesi.
 *
 * SUI MINUTI — non misuriamo il tempo davvero trascorso: sommiamo la durata
 * dei brani ascoltati. È una stima, e per eccesso: chi salta un pezzo a
 * tre quarti lo conta intero. Resta onesta perché un ascolto viene registrato
 * solo dopo metà brano (o quattro minuti, vedi listening.ts): l'errore è al
 * massimo la seconda metà di un pezzo, non un intero album sfiorato.
 *
 * SUL FUSO ORARIO — 'localtime' compare in ogni raggruppamento per data.
 * Senza, "quando ascolti" sarebbe in UTC: le due di notte italiane
 * finirebbero a mezzanotte, e le ore piccole sembrerebbero serate.
 */
import type { DatabaseSync } from 'node:sqlite';

export type Periodo = { giorni: number | null };

export type Riepilogo = {
  giorni: number | null;
  totali: { ascolti: number; minuti: number; brani: number; artisti: number; album: number };
  artisti: Array<{ id: number; nome: string; ascolti: number; minuti: number }>;
  album: Array<{ id: number; titolo: string; artista: string; coverKey: string | null; ascolti: number; minuti: number }>;
  brani: Array<{ id: number; titolo: string; artista: string; album: string; albumId: number; coverKey: string | null; ascolti: number }>;
  mesi: Array<{ mese: string; ascolti: number; minuti: number }>;
  ore: Array<{ ora: number; ascolti: number }>;
  /** il giorno in cui hai ascoltato di più, in tutto il periodo */
  record: { data: string; ascolti: number } | null;
  /** quando è stato registrato il primo ascolto in assoluto */
  inizio: number | null;
};

/** Il filtro temporale, scritto una volta sola. */
const DA = (giorni: number | null) => (giorni ? Date.now() - giorni * 24 * 60 * 60 * 1000 : 0);

const MINUTI = 'ROUND(SUM(t.duration) / 60.0)';
/** plays.played_at è in millisecondi; SQLite ragiona in secondi. */
const DATA = "datetime(p.played_at / 1000, 'unixepoch', 'localtime')";

export function riepilogo(db: DatabaseSync, giorni: number | null = null): Riepilogo {
  const da = DA(giorni);

  const totali = db.prepare(`
    SELECT COUNT(*) AS ascolti,
           COALESCE(${MINUTI}, 0) AS minuti,
           COUNT(DISTINCT t.id) AS brani,
           COUNT(DISTINCT t.artist_id) AS artisti,
           COUNT(DISTINCT t.album_id) AS album
    FROM plays p JOIN tracks t ON t.id = p.track_id
    WHERE p.played_at >= ?
  `).get(da) as Riepilogo['totali'];

  const artisti = db.prepare(`
    SELECT ar.id, ar.name AS nome, COUNT(*) AS ascolti, ${MINUTI} AS minuti
    FROM plays p
    JOIN tracks t ON t.id = p.track_id
    JOIN artists ar ON ar.id = t.artist_id
    WHERE p.played_at >= ?
    GROUP BY ar.id
    ORDER BY ascolti DESC, minuti DESC
    LIMIT 5
  `).all(da) as Riepilogo['artisti'];

  const album = db.prepare(`
    SELECT al.id, al.title AS titolo, ar.name AS artista, al.cover_key AS coverKey,
           COUNT(*) AS ascolti, ${MINUTI} AS minuti
    FROM plays p
    JOIN tracks t ON t.id = p.track_id
    JOIN albums al ON al.id = t.album_id
    JOIN artists ar ON ar.id = al.artist_id
    WHERE p.played_at >= ?
    GROUP BY al.id
    ORDER BY ascolti DESC, minuti DESC
    LIMIT 5
  `).all(da) as Riepilogo['album'];

  const brani = db.prepare(`
    SELECT t.id, t.title AS titolo, ar.name AS artista, al.title AS album,
           al.id AS albumId, al.cover_key AS coverKey, COUNT(*) AS ascolti
    FROM plays p
    JOIN tracks t ON t.id = p.track_id
    JOIN albums al ON al.id = t.album_id
    JOIN artists ar ON ar.id = t.artist_id
    WHERE p.played_at >= ?
    GROUP BY t.id
    ORDER BY ascolti DESC, MAX(p.played_at) DESC
    LIMIT 5
  `).all(da) as Riepilogo['brani'];

  const mesi = db.prepare(`
    SELECT strftime('%Y-%m', ${DATA}) AS mese, COUNT(*) AS ascolti, ${MINUTI} AS minuti
    FROM plays p JOIN tracks t ON t.id = p.track_id
    WHERE p.played_at >= ?
    GROUP BY mese
    ORDER BY mese
  `).all(da) as Riepilogo['mesi'];

  // Le 24 ore ci sono sempre tutte, anche quelle a zero: un grafico con le
  // ore mancanti saltate racconterebbe una giornata che non esiste.
  const conteggioOre = new Map<number, number>();
  for (const r of db.prepare(`
    SELECT CAST(strftime('%H', ${DATA}) AS INTEGER) AS ora, COUNT(*) AS ascolti
    FROM plays p
    WHERE p.played_at >= ?
    GROUP BY ora
  `).all(da) as Array<{ ora: number; ascolti: number }>) {
    conteggioOre.set(r.ora, r.ascolti);
  }
  const ore = Array.from({ length: 24 }, (_, ora) => ({ ora, ascolti: conteggioOre.get(ora) ?? 0 }));

  const record = db.prepare(`
    SELECT date(${DATA}) AS data, COUNT(*) AS ascolti
    FROM plays p
    WHERE p.played_at >= ?
    GROUP BY data
    ORDER BY ascolti DESC, data DESC
    LIMIT 1
  `).get(da) as Riepilogo['record'];

  const primo = db.prepare('SELECT MIN(played_at) AS quando FROM plays').get() as { quando: number | null };

  return { giorni, totali, artisti, album, brani, mesi, ore, record: record ?? null, inizio: primo.quando };
}
