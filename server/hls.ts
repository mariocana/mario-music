/**
 * hls.ts — il brano convertito servito a segmenti, come fa Apple Music.
 *
 * IL PROBLEMA. Il player di iOS (AVPlayer) vuole sapere quanto è lungo un
 * file prima di suonarlo: chiede byte a intervalli, e un file che sta ancora
 * crescendo non ha una lunghezza. Per questo l'app chiedeva `?full=1` e il
 * server aspettava la fine della conversione: ~4 secondi di silenzio ogni
 * volta che si sceglieva un FLAC mai convertito, fuori casa.
 *
 * L'IDEA DI HLS. Invece di un file, una PLAYLIST di pezzi da sei secondi:
 *
 *   #EXTM3U
 *   #EXT-X-MAP:URI="init.mp4"     ← intestazione: codec, frequenza, canali
 *   #EXTINF:6.0,
 *   0.m4s                         ← secondi 0–6
 *   #EXTINF:6.0,
 *   1.m4s                         ← secondi 6–12
 *   …
 *   #EXT-X-ENDLIST                ← è un brano intero, non una diretta
 *
 * Ogni pezzo è un file piccolo e COMPLETO, con la sua lunghezza: AVPlayer non
 * ha più niente da chiedere che non esista. Il trucco è che la playlist si
 * può scrivere SUBITO, prima di aver convertito qualunque cosa: la durata del
 * brano è nel database, quindi si sa già quanti pezzi ci saranno. Il player
 * la legge, chiede `init.mp4` e `0.m4s`, e ffmpeg li ha pronti in tre decimi
 * di secondo. Mentre si ascolta il primo pezzo, ffmpeg ha già finito tutto.
 *
 * I PEZZI. MP4 frammentato (fMP4), lo stesso formato del file convertito a
 * intero (vedi transcode.ts): un `init.mp4` con l'intestazione comune e poi i
 * frammenti `.m4s`. Provato su un FLAC di 3:33: init dopo 0,15 s, primo pezzo
 * dopo 0,3 s, tutto finito in 4,2 s; i file non cambiano più una volta
 * comparsi, e `temp_file` fa sì che un pezzo compaia solo quando è completo.
 *
 * LA DURATA VERA DEI PEZZI. ffmpeg taglia al primo frammento AAC (~23 ms)
 * oltre ogni multiplo di sei secondi: 6,014, 5,991, 6,014… Gli scarti non si
 * sommano, quindi la playlist calcolata con 6,0 tondi indica sempre il pezzo
 * giusto per un salto. A conversione finita si serve comunque quella scritta
 * da ffmpeg, che ha le durate esatte.
 *
 * SALTI IN AVANTI. Se durante il primissimo ascolto si trascina la barra a
 * metà brano, il pezzo chiesto potrebbe non esserci ancora: si aspetta che
 * ffmpeg ci arrivi, al massimo i ~4 secondi della conversione intera. Un
 * ffmpeg ripartito dal punto del salto (come fa Jellyfin) eviterebbe anche
 * quelli, al prezzo di molta complessità per un caso raro.
 *
 * LA CACHE sta in data/hls/<impronta>/, come per transcode.ts: un file
 * spostato non si riconverte, uno cambiato sì. `completo.m3u8` esiste solo a
 * conversione riuscita: una cartella senza è un lavoro interrotto (server
 * spento a metà) e si rifà da capo.
 */
import { spawn } from 'node:child_process';
import { mkdir, rename, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { DATA_DIR } from './db.ts';
import { fingerprintFile } from './scanner.ts';
import { acquisisci, rilascia, type Sorgente } from './transcode.ts';

export const HLS_DIR = process.env.HLS_DIR ?? path.join(DATA_DIR, 'hls');
export const PLAYLIST_MIME = 'application/vnd.apple.mpegurl';
export const SEGMENTO_MIME = 'audio/mp4';

/** Secondi per pezzo: il valore che Apple raccomanda per il VOD. */
export const SEGMENTO_S = 6;
const BITRATE = '256k';

/** La playlist scritta da ffmpeg, rinominata così solo a lavoro riuscito. */
const COMPLETA = 'completo.m3u8';
const PARZIALE = 'ffmpeg.m3u8';

/** I nomi che un client può chiedere: nient'altro esce dalla cartella. */
export const NOME_FILE = /^(init\.mp4|\d{1,5}\.m4s)$/;

/* ───────────────────────── la playlist calcolata ───────────────────────── */

/**
 * Quanti pezzi annunciare per un brano di `durata` secondi: ceil(durata / 6).
 *
 * ffmpeg ne scrive ALMENO tanti, a volte uno in più: l'encoder AAC aggiunge
 * qualche decina di millisecondi di riempimento, e un brano di esattamente
 * 12 s esce in tre pezzi, l'ultimo quasi vuoto (provato: 12 s → 3, 17,98 s → 3,
 * 18 s → 4). Annunciarne uno in meno costa al massimo quel riempimento in
 * coda; annunciarne uno in più sarebbe un pezzo che non arriva mai, e il
 * player si fermerebbe in errore alla fine del brano.
 */
export function numeroSegmenti(durata: number, segmento = SEGMENTO_S): number {
  if (!Number.isFinite(durata) || durata <= 0) return 0;
  return Math.ceil(durata / segmento);
}

/** La playlist che si può dare al player prima che esista un solo pezzo. */
export function playlistCalcolata(durata: number, segmento = SEGMENTO_S): string {
  const n = numeroSegmenti(durata, segmento);
  const righe = [
    '#EXTM3U',
    '#EXT-X-VERSION:7',
    `#EXT-X-TARGETDURATION:${segmento}`,
    '#EXT-X-MEDIA-SEQUENCE:0',
    '#EXT-X-PLAYLIST-TYPE:VOD',
    '#EXT-X-INDEPENDENT-SEGMENTS',
    '#EXT-X-MAP:URI="init.mp4"',
  ];
  for (let i = 0; i < n; i++) {
    const resto = durata - i * segmento;
    const d = i === n - 1 ? Math.max(0.001, Math.min(resto, segmento)) : segmento;
    righe.push(`#EXTINF:${d.toFixed(3)},`, `${i}.m4s`);
  }
  righe.push('#EXT-X-ENDLIST', '');
  return righe.join('\n');
}

/* ───────────────────────────── la conversione ───────────────────────────── */

export type Lavoro = {
  cartella: string;
  /** si risolve a conversione finita (o già finita); rigetta se ffmpeg fallisce */
  fine: Promise<void>;
};

export type HlsOptions = {
  dir?: string;
  /** Per i test: al posto di ffmpeg. Riceve (input, cartella) e scrive i pezzi lì. */
  converti?: (input: string, cartella: string) => Promise<void>;
  /** Qualcuno sta aspettando di sentirlo: passa davanti nel semaforo. */
  urgente?: boolean;
};

function ffmpegHls(input: string, cartella: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const p = spawn('ffmpeg', [
      '-v', 'error', '-nostdin', '-y',
      '-i', input,
      '-vn',
      '-c:a', 'aac', '-b:a', BITRATE,
      '-f', 'hls',
      '-hls_time', String(SEGMENTO_S),
      '-hls_playlist_type', 'vod',
      '-hls_segment_type', 'fmp4',
      '-hls_fmp4_init_filename', 'init.mp4',
      // temp_file: ogni pezzo si scrive come .tmp e si rinomina quando è
      // completo. Così "il file esiste" vuol dire "il file è pronto".
      '-hls_flags', 'temp_file+independent_segments',
      '-hls_segment_filename', path.join(cartella, '%d.m4s'),
      path.join(cartella, PARZIALE),
    ]);
    let stderr = '';
    p.stderr.on('data', (c) => { stderr += c; });
    p.on('error', reject);
    p.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg (hls) è uscito con codice ${code}: ${stderr.trim()}`));
    });
  });
}

async function esiste(f: string): Promise<boolean> {
  try { await stat(f); return true; } catch { return false; }
}

export async function cartellaHls(track: Sorgente, dir = HLS_DIR): Promise<string> {
  const impronta = track.fingerprint ?? await fingerprintFile(track.path, track.size);
  return path.join(dir, impronta);
}

/** La conversione è finita e riuscita? */
export async function hlsPronto(track: Sorgente, dir = HLS_DIR): Promise<boolean> {
  return esiste(path.join(await cartellaHls(track, dir), COMPLETA));
}

/** Le conversioni in corso: si tiene la PROMESSA, come in transcode.ts. */
const inCorso = new Map<string, Promise<Lavoro>>();

/**
 * Avvia la conversione a pezzi di un brano, o si aggancia a quella in corso,
 * o restituisce quella già fatta. Non aspetta la fine: per quello c'è `fine`.
 */
export function avviaHls(track: Sorgente, opts: HlsOptions = {}): Promise<Lavoro> {
  const dir = opts.dir ?? HLS_DIR;
  const chiave = `${dir}:${track.fingerprint ?? track.path}`;
  const gia = inCorso.get(chiave);
  if (gia) return gia;

  const avvio = (async (): Promise<Lavoro> => {
    const cartella = await cartellaHls(track, dir);
    if (await esiste(path.join(cartella, COMPLETA))) {
      inCorso.delete(chiave);
      return { cartella, fine: Promise.resolve() };
    }

    // Pezzi rimasti da un lavoro interrotto (server spento a metà): via
    // SUBITO, prima di restituire il lavoro, altrimenti attendiFile() li
    // troverebbe e li servirebbe mentre questa conversione è ancora in coda.
    await rm(cartella, { recursive: true, force: true });
    await mkdir(cartella, { recursive: true });

    const fine = (async () => {
      await acquisisci(opts.urgente);
      try {
        await (opts.converti ?? ffmpegHls)(track.path, cartella);
        await rename(path.join(cartella, PARZIALE), path.join(cartella, COMPLETA));
      } catch (err) {
        await rm(cartella, { recursive: true, force: true }).catch(() => undefined);
        throw err;
      } finally {
        rilascia();
        inCorso.delete(chiave);
      }
    })();
    // Nessuno aspetta `fine` se il player cambia brano: niente rifiuti orfani.
    fine.catch(() => undefined);
    return { cartella, fine };
  })();

  inCorso.set(chiave, avvio);
  avvio.catch(() => inCorso.delete(chiave));
  return avvio;
}

/**
 * Il percorso di un file della conversione, aspettando che ffmpeg lo scriva.
 * null se la conversione è finita e quel file non c'è (pezzo oltre la fine).
 * Rigetta se ffmpeg fallisce o se dopo `limite` ms non è ancora arrivato.
 *
 * `init.mp4` si considera pronto solo quando c'è anche il primo pezzo: è
 * l'unico file che ffmpeg non scrive con `temp_file`, e quando esiste 0.m4s
 * l'intestazione è sicuramente completa (verificato: non cambia più).
 */
export async function attendiFile(
  lavoro: Lavoro,
  nome: string,
  { attesa = 50, limite = 30_000 }: { attesa?: number; limite?: number } = {},
): Promise<string | null> {
  const file = path.join(lavoro.cartella, nome);
  const segnale = nome === 'init.mp4' ? path.join(lavoro.cartella, '0.m4s') : file;

  let finito = false;
  let errore: unknown = null;
  void lavoro.fine.then(() => { finito = true; }, (e) => { finito = true; errore = e; });

  const scadenza = Date.now() + limite;
  for (;;) {
    if (await esiste(segnale) && await esiste(file)) return file;
    if (errore) throw errore;
    if (finito) return null;
    if (Date.now() > scadenza) throw new Error(`${nome}: non arrivato dopo ${limite} ms`);
    await new Promise((r) => setTimeout(r, attesa));
  }
}

/**
 * La playlist da dare al player: quella esatta di ffmpeg se la conversione è
 * finita, altrimenti quella calcolata dalla durata.
 */
export async function playlistPer(lavoro: Lavoro, durata: number): Promise<{ testo: string } | { file: string }> {
  const completa = path.join(lavoro.cartella, COMPLETA);
  if (await esiste(completa)) return { file: completa };
  return { testo: playlistCalcolata(durata) };
}
