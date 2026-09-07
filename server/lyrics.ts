/**
 * lyrics.ts — i testi dei brani.
 *
 * Ordine delle fonti, dalla migliore alla peggiore:
 *   1. cache in database        (già risolto in passato)
 *   2. LRCLIB                   (spesso sincronizzato, cioè con i tempi)
 *   3. tag dentro al file       (letto durante lo scan, mai sincronizzato)
 *
 * LRCLIB viene prima dei tag perché restituisce il testo con i tempi riga per
 * riga, che è quello che permette di evidenziare il verso in corso. I tag
 * ID3 contengono solo blocchi di testo.
 *
 * Anche i tentativi a vuoto si registrano: senza, ogni apertura del pannello
 * ripartirebbe con una richiesta di rete per una canzone che non c'è.
 */
import type { DatabaseSync } from 'node:sqlite';

/** Si identifica il client: LRCLIB lo chiede esplicitamente. */
const USER_AGENT = 'mario-music (self-hosted personal music server)';
const BASE = 'https://lrclib.net/api';

/** Dopo quanto rifare un tentativo andato a vuoto. */
const RIPROVA_DOPO_MS = 7 * 24 * 60 * 60 * 1000;

export type LyricLine = { t: number; text: string };
export type LyricsResult = {
  source: 'lrclib' | 'tag' | 'none';
  synced: LyricLine[] | null;
  plain: string | null;
};

type TrackInfo = {
  id: number;
  title: string;
  artist: string;
  album: string;
  duration: number;
  embedded: string | null;
};

/**
 * Converte il formato LRC in righe con tempo.
 *
 *   [00:13.06] I used to rule the world   →   { t: 13.06, text: '…' }
 *
 * Una riga può avere più marcatori (ritornelli ripetuti): vanno espansi tutti.
 */
export function parseLrc(lrc: string): LyricLine[] {
  const lines: LyricLine[] = [];
  for (const raw of lrc.split('\n')) {
    const marcatori = [...raw.matchAll(/\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?\]/g)];
    if (marcatori.length === 0) continue;
    const text = raw.replace(/\[[^\]]*\]/g, '').trim();
    for (const m of marcatori) {
      const centesimi = m[3] ? Number(m[3].padEnd(3, '0')) / 1000 : 0;
      lines.push({ t: Number(m[1]) * 60 + Number(m[2]) + centesimi, text });
    }
  }
  return lines.sort((a, b) => a.t - b.t);
}

async function chiedi(url: string): Promise<unknown | null> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT },
      // Senza scadenza una risposta lenta bloccherebbe la richiesta del client.
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

type LrclibRecord = {
  instrumental?: boolean;
  plainLyrics?: string | null;
  syncedLyrics?: string | null;
  duration?: number;
};

/**
 * Interroga LRCLIB. Prima la corrispondenza esatta, poi senza album (i titoli
 * degli album nelle librerie vere sono pieni di "(Deluxe Edition) CD1"), poi
 * una ricerca libera scegliendo il risultato con la durata più vicina.
 */
async function daLrclib(track: TrackInfo): Promise<LrclibRecord | null> {
  const q = (extra: Record<string, string>) =>
    new URLSearchParams({
      artist_name: track.artist,
      track_name: track.title,
      ...extra,
    }).toString();

  const durata = String(Math.round(track.duration));

  const esatto = await chiedi(`${BASE}/get?${q({ album_name: track.album, duration: durata })}`);
  if (esatto) return esatto as LrclibRecord;

  const senzaAlbum = await chiedi(`${BASE}/get?${q({ duration: durata })}`);
  if (senzaAlbum) return senzaAlbum as LrclibRecord;

  const risultati = (await chiedi(`${BASE}/search?${q({})}`)) as LrclibRecord[] | null;
  if (!Array.isArray(risultati) || risultati.length === 0) return null;

  // Fra i risultati vince quello che dura di più simile: è il segnale più
  // affidabile per capire se è la stessa incisione e non un remix o un live.
  return risultati
    .filter((r) => r.syncedLyrics || r.plainLyrics)
    .sort((a, b) =>
      Math.abs((a.duration ?? 0) - track.duration) - Math.abs((b.duration ?? 0) - track.duration))[0] ?? null;
}

export async function getLyrics(db: DatabaseSync, trackId: number): Promise<LyricsResult | null> {
  const track = db.prepare(`
    SELECT t.id, t.title, t.duration, t.embedded_lyrics AS embedded,
           ar.name AS artist, al.title AS album
    FROM tracks t
    JOIN artists ar ON ar.id = t.artist_id
    JOIN albums  al ON al.id = t.album_id
    WHERE t.id = ?
  `).get(trackId) as TrackInfo | undefined;
  if (!track) return null;

  const cached = db.prepare('SELECT synced, plain, source, fetched_at AS fetchedAt FROM lyrics WHERE track_id = ?')
    .get(trackId) as { synced: string | null; plain: string | null; source: string; fetchedAt: number } | undefined;

  const scaduto = cached?.source === 'none' && Date.now() - cached.fetchedAt > RIPROVA_DOPO_MS;
  if (cached && !scaduto) {
    return {
      source: cached.source as LyricsResult['source'],
      synced: cached.synced ? parseLrc(cached.synced) : null,
      plain: cached.plain,
    };
  }

  const record = await daLrclib(track);

  let synced: string | null = null;
  let plain: string | null = null;
  let source: LyricsResult['source'] = 'none';

  if (record && !record.instrumental && (record.syncedLyrics || record.plainLyrics)) {
    synced = record.syncedLyrics?.trim() || null;
    plain = record.plainLyrics?.trim() || null;
    source = 'lrclib';
  } else if (track.embedded?.trim()) {
    plain = track.embedded.trim();
    source = 'tag';
  }

  db.prepare(`
    INSERT INTO lyrics (track_id, synced, plain, source, fetched_at) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(track_id) DO UPDATE SET
      synced = excluded.synced, plain = excluded.plain,
      source = excluded.source, fetched_at = excluded.fetched_at
  `).run(trackId, synced, plain, source, Date.now());

  return { source, synced: synced ? parseLrc(synced) : null, plain };
}
