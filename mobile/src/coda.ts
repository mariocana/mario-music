import type { Track } from './types.ts';

export type Coda = { queue: Track[]; index: number };

function senzaDoppioni(queue: Track[], index: number, tracks: Track[]): Track[] {
  const daRimuovere = new Set(tracks.map((t) => t.id));
  const inAscolto = queue[index];
  return queue.filter((t, i) => i === index || !daRimuovere.has(t.id) || t === inAscolto);
}

/** In fondo alla coda, nell'ordine in cui arrivano. */
export function accoda(coda: Coda, tracks: Track[]): Coda {
  if (tracks.length === 0) return coda;
  return { queue: [...coda.queue, ...tracks], index: coda.index };
}

/** Subito dopo il brano in ascolto, mantenendo l'ordine del blocco. */
export function inserisciDopo(coda: Coda, tracks: Track[]): Coda {
  if (tracks.length === 0) return coda;
  const pulita = senzaDoppioni(coda.queue, coda.index, tracks);
  const corrente = coda.queue[coda.index];
  const at = pulita.findIndex((t) => t === corrente);
  const q = [...pulita];
  q.splice(at + 1, 0, ...tracks);
  return { queue: q, index: at };
}

/**
 * Toglie il brano in posizione `i`. L'indice continua a puntare al brano in
 * ascolto; se si toglie proprio quello, `index` è chi prende il suo posto
 * (il successivo, o l'ultimo se era in fondo) e `cambiato` lo segnala: il
 * player deve caricarlo. Coda vuota → index -1.
 */
export function togli(coda: Coda, i: number): Coda & { cambiato: boolean } {
  if (i < 0 || i >= coda.queue.length) return { ...coda, cambiato: false };
  const queue = coda.queue.filter((_, k) => k !== i);
  if (queue.length === 0) return { queue, index: -1, cambiato: true };
  if (i < coda.index) return { queue, index: coda.index - 1, cambiato: false };
  if (i > coda.index) return { queue, index: coda.index, cambiato: false };
  return { queue, index: Math.min(i, queue.length - 1), cambiato: true };
}

/**
 * Sposta il brano da `from` a `to`. Il brano in ascolto resta quello: cambia
 * solo la sua posizione, se il riordino gli passa sopra.
 */
export function sposta(coda: Coda, from: number, to: number): Coda {
  const n = coda.queue.length;
  if (from === to || from < 0 || to < 0 || from >= n || to >= n) return coda;
  const queue = [...coda.queue];
  const [mosso] = queue.splice(from, 1);
  queue.splice(to, 0, mosso);

  let index = coda.index;
  if (from === coda.index) index = to;
  else if (from < coda.index && to >= coda.index) index = coda.index - 1;
  else if (from > coda.index && to <= coda.index) index = coda.index + 1;
  return { queue, index };
}

/**
 * Offline si possono suonare solo i brani scaricati: la coda tiene quelli, e
 * basta. Se il brano scelto non c'è, si parte dal primo ascoltabile che viene
 * dopo di lui (o, se dopo non ce n'è, dal primo della lista): è il brano più
 * vicino a quello che si voleva sentire. Null se non ce n'è nessuno.
 */
export function soloAscoltabili(
  tracks: Track[],
  startIndex: number,
  ascoltabile: (t: Track) => boolean,
): { tracks: Track[]; startIndex: number } | null {
  const tenuti: Track[] = [];
  let inizio = -1;
  tracks.forEach((t, i) => {
    if (!ascoltabile(t)) return;
    if (inizio < 0 && i >= startIndex) inizio = tenuti.length;
    tenuti.push(t);
  });
  if (tenuti.length === 0) return null;
  return { tracks: tenuti, startIndex: inizio < 0 ? 0 : inizio };
}
