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
import { mkdir, open, rename, stat, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fingerprintFile } from './scanner.ts';
import { DATA_DIR } from './db.ts';

/**
 * Sotto DATA_DIR, non accanto al codice: prima era `data/transcoded` calcolato
 * dalla cartella di lavoro, e sul Mac combaciava per caso. In un container,
 * dove i dati stanno in un volume e la cartella del codice è di sola lettura,
 * la conversione falliva con "permission denied" alla prima richiesta.
 */
export const TRANSCODE_DIR = process.env.TRANSCODE_DIR ?? path.join(DATA_DIR, 'transcoded');
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
  /** Qualcuno sta aspettando di sentire questo brano: passa davanti. */
  urgente?: boolean;
};

/* ── un semaforo con precedenza: al massimo MAX_PARALLELE ffmpeg alla volta ──
 *
 * Chi sta ascoltando passa davanti a chi prepara il brano successivo. Senza
 * precedenza succedeva questo: si preme play, parte la conversione del brano
 * scelto e insieme quella del successivo (il precaricamento del gapless), e
 * se c'era già un lavoro in corso il brano che si vuole sentire ADESSO
 * finiva terzo in coda — due secondi e mezzo di attesa invece di un decimo.
 */
let attive = 0;
const inAttesa: Array<{ urgente: boolean; via: () => void }> = [];
function acquisisci(urgente = false): Promise<void> {
  if (attive < MAX_PARALLELE) { attive++; return Promise.resolve(); }
  return new Promise((resolve) => {
    const voce = { urgente, via: () => { attive++; resolve(); } };
    // Gli urgenti in testa, ma dopo gli altri urgenti già in attesa: chi
    // aspetta da più tempo resta davanti.
    const dove = urgente ? inAttesa.findIndex((v) => !v.urgente) : -1;
    if (dove >= 0) inAttesa.splice(dove, 0, voce);
    else inAttesa.push(voce);
  });
}
function rilascia() {
  attive--;
  inAttesa.shift()?.via();
}

/**
 * MP4 FRAMMENTATO, non il solito MP4.
 *
 * Un MP4 normale tiene l'indice (`moov`) in fondo, e `+faststart` lo sposta in
 * testa solo alla fine, riscrivendo tutto: finché ffmpeg non ha finito, il
 * file è illeggibile — provato, "moov atom not found" dopo 4,7 MB scritti.
 *
 * Nella forma frammentata l'indice è distribuito: ogni frammento porta il
 * proprio, e un file troncato a metà è comunque audio valido (provato:
 * ffprobe legge 13 secondi di AAC da un pezzo di file ancora in scrittura).
 * È la stessa struttura che usano DASH e HLS, ed è ciò che permette di
 * servire il brano mentre viene convertito.
 *
 * `-flush_packets 1` e frammenti da un secondo sono la seconda metà del
 * trucco: senza, ffmpeg tiene tutto nei suoi buffer e dopo due secondi sul
 * disco ci sono 28 byte.
 */
function ffmpeg(input: string, output: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const p = spawn('ffmpeg', [
      '-v', 'error', '-nostdin', '-y',
      '-i', input,
      '-vn',                          // via la copertina incorporata
      '-c:a', 'aac', '-b:a', BITRATE,
      '-movflags', '+frag_keyframe+empty_moov+default_base_moof',
      '-frag_duration', '1000000',    // un frammento al secondo
      '-flush_packets', '1',          // scrivi subito, non a buffer pieno
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
 * Il percorso del file AAC, aspettando che la conversione finisca.
 *
 * Passa dalla stessa `iniziaConversione` del percorso progressivo, e non è un
 * dettaglio: tenere due strade separate significava due ffmpeg che scrivevano
 * lo stesso file provvisorio quando un brano veniva chiesto in entrambi i
 * modi — succede ogni volta che si trascina la barra durante il primo
 * ascolto. Una conversione per brano, chiunque la chieda.
 */
export async function transcodedFile(track: Sorgente, opts: TranscodeOptions = {}): Promise<string> {
  const dest = await percorsoTranscodificato(track, opts.dir ?? TRANSCODE_DIR);
  try {
    await stat(dest);
    return dest;
  } catch { /* non c'è ancora: si converte */ }
  const conv = await iniziaConversione(track, opts);
  return conv.fine;
}

/* ──────────────────── conversione progressiva ────────────────────
 *
 * Qui sta la differenza fra "aspetta che il brano sia pronto" e "comincia a
 * suonare adesso". La conversione è la stessa; cambia che il file viene
 * servito mentre cresce, invece che alla fine.
 *
 * Funziona perché ffmpeg converte molto più in fretta di quanto si ascolti —
 * una settantina di volte il tempo reale su questa macchina — quindi chi
 * ascolta non raggiunge mai la coda di ciò che è stato scritto. Se la
 * raggiungesse (una macchina lenta, un file enorme) il lettore aspetta i byte
 * mancanti, esattamente come farebbe con una rete lenta.
 */

export type Conversione = {
  /** il file provvisorio, che cresce mentre ffmpeg scrive */
  tmp: string;
  /** dove finirà quando sarà completo */
  dest: string;
  /** si risolve a conversione finita; rigetta se ffmpeg fallisce */
  fine: Promise<string>;
};

/**
 * Le conversioni aperte, per agganciarsi invece di duplicarle.
 *
 * La mappa contiene la PROMESSA, non il risultato: due richieste che arrivano
 * nello stesso istante trovano già qualcosa e si mettono in fila. Tenendo il
 * risultato, nel tempo fra l'avvio e il suo arrivo la mappa resta vuota e
 * partono due ffmpeg sullo stesso file.
 */
const progressive = new Map<string, Promise<Conversione>>();

/**
 * Avvia (o riusa) una conversione e restituisce subito il file provvisorio,
 * senza aspettare che sia finita.
 */
export function iniziaConversione(track: Sorgente, opts: TranscodeOptions = {}): Promise<Conversione> {
  const dir = opts.dir ?? TRANSCODE_DIR;
  const chiave = `${dir}:${track.fingerprint ?? track.path}`;
  const gia = progressive.get(chiave);
  if (gia) return gia;

  const avvio = (async () => {
    const dest = await percorsoTranscodificato(track, dir);
    await mkdir(dir, { recursive: true });
    const tmp = `${dest}.${process.pid}.tmp`;

    // `pronto` scatta quando ffmpeg è partito davvero: solo da quel momento
    // ha senso mettersi a leggere il file provvisorio. Il semaforo può far
    // aspettare, se ci sono già due conversioni in corso.
    let segnalaPronto: () => void = () => {};
    const pronto = new Promise<void>((r) => { segnalaPronto = r; });

    const fine: Promise<string> = (async () => {
      await acquisisci(opts.urgente);
      try {
        // Il file deve esistere prima che il lettore provi ad aprirlo.
        await writeFile(tmp, '');
        const lavoro = (opts.converti ?? ffmpeg)(track.path, tmp);
        segnalaPronto();
        await lavoro;
        await rename(tmp, dest);
        return dest;
      } catch (err) {
        await unlink(tmp).catch(() => undefined);
        throw err;
      } finally {
        rilascia();
        progressive.delete(chiave);
      }
    })();
    // Nessuno aspetta `fine` se il lettore si disconnette: senza questo, un
    // errore di ffmpeg diventerebbe una promise rifiutata e non ascoltata.
    fine.catch(() => undefined);

    await pronto;
    return { tmp, dest, fine };
  })();

  progressive.set(chiave, avvio);
  avvio.catch(() => progressive.delete(chiave));
  return avvio;
}

/**
 * Legge un file mentre qualcun altro lo sta scrivendo.
 *
 * Arrivati in fondo a ciò che c'è, si aspetta: o arrivano altri byte, o la
 * conversione finisce e allora si è letto tutto. `attesa` è breve perché un
 * frammento dura un secondo: controllare dieci volte al secondo costa nulla
 * e non introduce ritardi percepibili.
 *
 * IL PASSAGGIO DI TESTIMONE. A conversione finita il file provvisorio viene
 * rinominato, e sparisce da sotto i piedi di chi sta ancora leggendo — gli
 * ultimi byte scritti resterebbero fuori. Per questo si continua dal file di
 * destinazione, dallo stesso punto: è lo stesso contenuto, con un altro nome.
 */
export async function* leggiMentreCresce(
  conv: { tmp: string; dest: string; fine: Promise<unknown> },
  { attesa = 100 }: { attesa?: number } = {},
): AsyncGenerator<Buffer> {
  let finito = false;
  let errore: unknown = null;
  void conv.fine.then(() => { finito = true; }, (e) => { finito = true; errore = e; });

  let letti = 0;
  for (;;) {
    // Prima il provvisorio, che è quello che cresce; quando non c'è più, il
    // definitivo. Se mancano entrambi, o la conversione è fallita o non è
    // ancora cominciata.
    let fonte: string | null = null;
    let dimensione = 0;
    for (const f of [conv.tmp, conv.dest]) {
      try {
        dimensione = (await stat(f)).size;
        fonte = f;
        break;
      } catch { /* si prova l'altro */ }
    }

    if (fonte && dimensione > letti) {
      // Si apre, si legge e si CHIUDE prima di cedere il pezzo. Tenere il
      // file aperto attraverso lo `yield` sembra più efficiente, ma se chi
      // legge se ne va — il browser che cambia brano, la scheda che si
      // chiude — il generatore può essere abbandonato senza che nessuno
      // esegua la chiusura: il descrittore resta appeso finché il garbage
      // collector non lo trova, e Node a quel punto fa morire il processo.
      // Successo davvero, qui, la prima volta.
      const fh = await open(fonte, 'r');
      let pezzo: Buffer;
      try {
        const buf = Buffer.allocUnsafe(dimensione - letti);
        const { bytesRead } = await fh.read(buf, 0, buf.length, letti);
        letti += bytesRead;
        pezzo = buf.subarray(0, bytesRead);
      } finally {
        await fh.close();
      }
      if (pezzo.length > 0) yield pezzo;
      continue;
    }

    if (errore) throw errore;
    if (finito) break;
    await new Promise((r) => setTimeout(r, attesa));
  }
}
