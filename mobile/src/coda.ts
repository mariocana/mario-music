import type { Track } from './types';

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
