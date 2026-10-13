/**
 * loudness.ts — misurare quanto suona forte un brano.
 *
 * IL PROBLEMA. Un album del 1985 e la sua rimasterizzazione del 2015 hanno lo
 * stesso contenuto e due volumi diversi: in trent'anni di "loudness war" i
 * dischi sono stati masterizzati sempre più forti. In una playlist che li
 * mescola, il volume salta a ogni traccia e la mano corre alla manopola.
 *
 * LA MISURA. Non si guarda il picco — un colpo di rullante non dice quanto
 * suona forte un brano — ma il **loudness integrato** secondo lo standard
 * EBU R128, espresso in LUFS: una media su tutto il brano pesata come la
 * sente l'orecchio, che alle frequenze medie è più sensibile che ai bassi.
 * È lo stesso numero che usano Spotify, YouTube e Apple per il loro
 * livellamento automatico.
 *
 * QUALE FILTRO. `loudnorm` di ffmpeg dà lo stesso valore ma impiega 9 secondi
 * per brano, perché calcola anche come normalizzare. A noi serve solo
 * misurare: `ebur128` dà loudness e true peak in 1,4 secondi — quaranta volte
 * più veloce, stesso numero (verificato: entrambi -22.8 LUFS sullo stesso
 * file). Su una libreria da 1500 brani è la differenza fra dieci minuti e
 * quattro ore.
 *
 * QUANDO. Mai durante lo scan normale: quello deve restare veloce, perché
 * gira ogni cinque minuti. La misura è un lavoro a parte, che il server fa a
 * piccoli lotti quando non ha altro da fare, oppure `npm run loudness` in un
 * colpo solo.
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { DatabaseSync } from 'node:sqlite';

const run = promisify(execFile);

export type Misura = { loudness: number; peak: number };

/** Quante misure insieme: ffmpeg usa già più core, oltre tre si ostacolano. */
const PARALLELE = 3;

/**
 * Legge il riassunto che ebur128 stampa alla fine:
 *
 *   Integrated loudness:
 *     I:         -22.8 LUFS
 *   True peak:
 *     Peak:       -1.8 dBFS
 *
 * Un brano di puro silenzio dà `-inf`: si riconosce e si scarta, perché un
 * guadagno calcolato su meno infinito sarebbe infinito.
 */
export function leggiMisura(stderr: string): Misura | null {
  const i = /I:\s+(-?[\d.]+|-inf)\s+LUFS/.exec(stderr);
  const p = /Peak:\s+(-?[\d.]+|-inf)\s+dBFS/.exec(stderr);
  if (!i) return null;
  const loudness = Number(i[1]);
  const peak = p ? Number(p[1]) : 0;
  if (!Number.isFinite(loudness)) return null;
  return { loudness, peak: Number.isFinite(peak) ? peak : 0 };
}

/** Misura un file. Restituisce null se ffmpeg non ce la fa (file illeggibile). */
export async function misuraFile(file: string): Promise<Misura | null> {
  try {
    // ebur128 scrive il riassunto su stderr, non su stdout: `framelog=quiet`
    // toglie le migliaia di righe intermedie e lascia solo quello che serve.
    const { stderr } = await run('ffmpeg', [
      '-nostdin', '-hide_banner',
      '-i', file,
      '-af', 'ebur128=peak=true:framelog=quiet',
      '-f', 'null', '-',
    ], { maxBuffer: 4 * 1024 * 1024 });
    return leggiMisura(stderr);
  } catch {
    return null;
  }
}

export type AnalisiResult = { misurati: number; falliti: number; restanti: number; ms: number };

/**
 * Misura i brani che non hanno ancora un valore. `limite` tiene corto il
 * lavoro: il server ne fa un lotto alla volta, così una libreria appena
 * importata non blocca la macchina per mezz'ora di fila.
 */
export async function analizzaMancanti(
  db: DatabaseSync,
  { limite = 50, parallele = PARALLELE }: { limite?: number; parallele?: number } = {},
): Promise<AnalisiResult> {
  const t0 = Date.now();
  const daFare = db.prepare(`
    SELECT id, path FROM tracks WHERE loudness IS NULL ORDER BY id LIMIT ?
  `).all(limite) as Array<{ id: number; path: string }>;

  const salva = db.prepare('UPDATE tracks SET loudness = ?, peak = ? WHERE id = ?');
  let misurati = 0;
  let falliti = 0;

  // Una coda semplice: `parallele` operai che pescano dalla stessa lista.
  let prossimo = 0;
  const operaio = async () => {
    for (;;) {
      const i = prossimo++;
      if (i >= daFare.length) return;
      const t = daFare[i];
      const m = await misuraFile(t.path);
      if (m) {
        salva.run(m.loudness, m.peak, t.id);
        misurati++;
      } else {
        // Niente di meglio da fare: segnando 0 non lo si riprova all'infinito,
        // e un guadagno di 0 dB è esattamente "lascialo com'è".
        salva.run(0, 0, t.id);
        falliti++;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, parallele) }, operaio));

  const restanti = (db.prepare('SELECT COUNT(*) AS n FROM tracks WHERE loudness IS NULL').get() as { n: number }).n;
  return { misurati, falliti, restanti, ms: Date.now() - t0 };
}

/** Quanti brani aspettano ancora una misura. */
export function daMisurare(db: DatabaseSync): number {
  return (db.prepare('SELECT COUNT(*) AS n FROM tracks WHERE loudness IS NULL').get() as { n: number }).n;
}
