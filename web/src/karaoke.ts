/**
 * karaoke.ts — quanto è "avanzata" la riga che si sta cantando.
 *
 * LRCLIB dà un tempo per RIGA, non per parola: sa quando comincia un verso,
 * non quando arriva la terza sillaba. Il karaoke vero di Apple Music usa
 * tempi per parola, che nessuna fonte libera fornisce.
 *
 * Quello che si può fare è riempire la riga in proporzione al tempo passato
 * dal suo inizio. Non è esatto parola per parola — una parola tenuta lunga
 * manda avanti il riempimento come le altre — ma segue il canto abbastanza da
 * farti sapere a che punto sei, che è poi quello che serve.
 *
 * LA DURATA DI UNA RIGA non è sempre la distanza dalla successiva. Fra un
 * verso e l'altro può esserci un assolo di quindici secondi: riempire la riga
 * in quindici secondi la farebbe strisciare, e resterebbe a metà per tutto
 * l'intermezzo. Allora si stima anche quanto ci vuole a CANTARLA, dai
 * caratteri, e si prende la più breve delle due: la riga finisce di
 * riempirsi quando è ragionevolmente finita, e poi aspetta la prossima.
 */
import type { LyricLine } from './api.ts';

/** Caratteri al secondo: andatura media del canto. */
const VELOCITA = 12;
/** Anche una riga di due parole non si riempie in un lampo. */
const MINIMA = 0.8;
/** L'ultima riga non ha una successiva: se manca la durata del brano, questa. */
const CODA = 5;

/**
 * Quanto dura, in secondi, il riempimento della riga `i`.
 * `durataBrano` serve solo per l'ultima riga.
 */
export function durataRiga(righe: LyricLine[], i: number, durataBrano?: number): number {
  if (i < 0 || i >= righe.length) return 0;
  const inizio = righe[i].t;
  const dopo = i + 1 < righe.length ? righe[i + 1].t : (durataBrano && durataBrano > inizio ? durataBrano : inizio + CODA);
  const finoAllaProssima = Math.max(0, dopo - inizio);

  const testo = righe[i].text?.trim() ?? '';
  if (!testo) return finoAllaProssima;   // un verso vuoto è una pausa: nessuna fretta

  const perCantarla = Math.max(MINIMA, testo.length / VELOCITA);
  return Math.min(finoAllaProssima, perCantarla);
}

/**
 * Quanta parte della riga `i` è già stata cantata al secondo `t`: da 0 a 1.
 * Fuori dalla riga vale 0 (non ancora) o 1 (già passata).
 */
export function avanzamentoRiga(
  righe: LyricLine[] | null | undefined,
  i: number,
  t: number,
  durataBrano?: number,
): number {
  if (!righe || i < 0 || i >= righe.length) return 0;
  const inizio = righe[i].t;
  if (t <= inizio) return 0;
  const durata = durataRiga(righe, i, durataBrano);
  if (durata <= 0) return 1;
  return Math.max(0, Math.min(1, (t - inizio) / durata));
}

/**
 * La riga divisa in parole, ciascuna con la frazione di riga a cui comincia.
 *
 * Serve per accendere le parole una alla volta invece di far scorrere un
 * gradiente sopra tutta la riga. Il gradiente sembrava la cosa più semplice,
 * ma su un verso lungo che va a capo colora le due righe visive in parallelo:
 * la seconda si illumina da sinistra mentre la prima non è finita. Parola per
 * parola il problema non si pone, e l'effetto somiglia di più a un karaoke.
 *
 * La posizione si misura in caratteri: è un'approssimazione — una parola
 * lunga non si canta sempre in proporzione alle sue lettere — ma è la stessa
 * che fa già `durataRiga`, e dentro una riga sola l'errore è piccolo.
 */
export function parole(testo: string): Array<{ testo: string; inizio: number }> {
  const pezzi = testo.split(/(\s+)/).filter((x) => x.length > 0);
  const totale = testo.length || 1;
  let scorsi = 0;
  return pezzi.map((pezzo) => {
    const inizio = scorsi / totale;
    scorsi += pezzo.length;
    return { testo: pezzo, inizio };
  });
}

/**
 * Le righe da mostrare intorno a quella in corso.
 *
 * Si restituisce una finestra, non tutto il testo: a schermo pieno ne stanno
 * cinque o sei, e disegnarne duecento per poi nasconderle è lavoro sprecato
 * su un telefono. `attiva` è l'indice della riga corrente dentro la finestra,
 * così chi disegna sa quale ingrandire.
 */
export function finestra(
  righe: LyricLine[] | null | undefined,
  i: number,
  { prima = 2, dopo = 3 }: { prima?: number; dopo?: number } = {},
): { righe: Array<LyricLine & { indice: number }>; attiva: number } {
  if (!righe || righe.length === 0) return { righe: [], attiva: -1 };
  // Prima che cominci il canto (i = -1) si mostrano le prime righe, così lo
  // schermo non è vuoto durante l'introduzione strumentale.
  const centro = Math.max(0, i);
  const da = Math.max(0, centro - prima);
  const a = Math.min(righe.length, centro + dopo + 1);
  return {
    righe: righe.slice(da, a).map((r, k) => ({ ...r, indice: da + k })),
    attiva: i < 0 ? -1 : centro - da,
  };
}
