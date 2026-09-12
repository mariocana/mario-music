/**
 * transcode.ts — conversione al volo in AAC, per due motivi diversi.
 *
 *   1. Peso. Un FLAC viaggia a ~900 kbps, un AAC a 256 kbps suona quasi
 *      uguale e pesa un terzo. Sul telefono, fuori casa, è la differenza
 *      tra ascoltare e aspettare.
 *   2. Compatibilità. Chrome non legge ALAC, Safari non legge Ogg, WMA e APE
 *      non li legge nessuno. Convertiti in AAC li leggono tutti.
 *
 * COME — si converte in un file, non in un flusso.
 * L'alternativa "ffmpeg che scrive direttamente nella risposta HTTP" parte
 * un attimo prima, ma la lunghezza in byte non si conosce finché ffmpeg non
 * ha finito: niente Content-Length, niente Range, niente seek. Scrivere prima
 * il file e poi servirlo con stream.ts costa qualche secondo la PRIMA volta
 * (un brano di 4 minuti si converte in ~4 s) e da lì in poi è identico a un
 * file qualunque: fette, ETag, cache. Il player chiede in anticipo il brano
 * successivo (vedi /prepare), così di solito quei secondi non si vedono.
 *
 * La cache sta in data/transcoded/<impronta>.m4a: la chiave è l'impronta del
 * contenuto, non l'id né il percorso, quindi un file spostato o rinominato
 * non si riconverte, e un file cambiato sì. La cartella si può svuotare in
 * qualunque momento: si ricostruisce da sola.
 */
import { spawn } from 'node:child_process';
import { mkdir, rename, stat, unlink } from 'node:fs/promises';
import path from 'node:path';
import { fingerprintFile } from './scanner.ts';

export const TRANSCODE_DIR = process.env.TRANSCODE_DIR ?? path.resolve('data/transcoded');
export const TRANSCODE_MIME = 'audio/mp4';
const BITRATE = '256k';

/** Quante conversioni insieme: oltre due si rubano solo la CPU a vicenda. */
const MAX_PARALLELE = 2;

/**
 * Serve convertire? MP3 e AAC li legge qualunque browser e sono già
 * compressi: ricomprimerli farebbe solo perdere qualità. Tutto il resto —
 * lossless (FLAC, ALAC, WAV) o esotico (Ogg, WMA, APE) — sì.
 */
export function vaTranscodificato(codec: string | null | undefined): boolean {
  return codec !== 'mp3' && codec !== 'aac';
}

export type Sorgente = { path: string; size: number; fingerprint: string | null };

export type TranscodeOptions = {
  dir?: string;
  /** Per i test: al posto di ffmpeg. Riceve (input, output) e deve scrivere output. */
  converti?: (input: string, output: string) => Promise<void>;
};

/** Le conversioni in corso, per non lanciare due ffmpeg sullo stesso brano. */
const inCorso = new Map<string, Promise<string>>();

/* ── un semaforo minimo: al massimo MAX_PARALLELE ffmpeg alla volta ── */
let attive = 0;
const inAttesa: Array<() => void> = [];
function acquisisci(): Promise<void> {
  if (attive < MAX_PARALLELE) { attive++; return Promise.resolve(); }
  return new Promise((resolve) => inAttesa.push(() => { attive++; resolve(); }));
}
function rilascia() {
  attive--;
  inAttesa.shift()?.();
}

function ffmpeg(input: string, output: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const p = spawn('ffmpeg', [
      '-v', 'error', '-nostdin', '-y',
      '-i', input,
      '-vn',                          // via la copertina incorporata
      '-c:a', 'aac', '-b:a', BITRATE,
      '-movflags', '+faststart',      // indice in testa: si parte senza aspettare la coda
      '-f', 'mp4', output,
    ]);
    let stderr = '';
    p.stderr.on('data', (c) => { stderr += c; });
    p.on('error', reject);
    p.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg è uscito con codice ${code}: ${stderr.trim()}`));
    });
  });
}

/** Dove starebbe la versione convertita di questo brano (esista o no). */
export async function percorsoTranscodificato(track: Sorgente, dir = TRANSCODE_DIR): Promise<string> {
  const impronta = track.fingerprint ?? await fingerprintFile(track.path, track.size);
  return path.join(dir, `${impronta}.m4a`);
}

/** È già in cache? Costa uno stat, niente di più. */
export async function giaPronto(track: Sorgente, dir = TRANSCODE_DIR): Promise<boolean> {
  try { await stat(await percorsoTranscodificato(track, dir)); return true; } catch { return false; }
}

/**
 * Restituisce il percorso del file AAC, convertendo se non c'è ancora.
 * Due richieste per lo stesso brano nello stesso momento condividono la
 * stessa conversione: la seconda aspetta la prima, non ne lancia un'altra.
 */
export function transcodedFile(track: Sorgente, opts: TranscodeOptions = {}): Promise<string> {
  const dir = opts.dir ?? TRANSCODE_DIR;
  const chiave = `${dir}:${track.fingerprint ?? track.path}`;
  const pendente = inCorso.get(chiave);
  if (pendente) return pendente;

  const lavoro = (async () => {
    const dest = await percorsoTranscodificato(track, dir);
    try { await stat(dest); return dest; } catch { /* non c'è: si converte */ }

    await mkdir(dir, { recursive: true });
    // Si scrive su un nome provvisorio e si rinomina alla fine: un rename è
    // atomico, quindi un file .m4a o è completo o non esiste. Senza questo,
    // un server spento a metà conversione lascerebbe un file mozzo che alla
    // richiesta successiva verrebbe servito come buono.
    const tmp = `${dest}.${process.pid}.tmp`;
    await acquisisci();
    try {
      await (opts.converti ?? ffmpeg)(track.path, tmp);
      await rename(tmp, dest);
    } catch (err) {
      await unlink(tmp).catch(() => undefined);
      throw err;
    } finally {
      rilascia();
    }
    return dest;
  })();

  inCorso.set(chiave, lavoro);
  // then(f, f) e non finally(): finally() su una promise fallita ne produce
  // un'altra fallita, e nessuno la ascolterebbe (unhandled rejection).
  const pulisci = () => { inCorso.delete(chiave); };
  void lavoro.then(pulisci, pulisci);
  return lavoro;
}
