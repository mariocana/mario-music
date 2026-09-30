/**
 * coda.ts — le due operazioni sulla coda, come funzioni pure.
 *
 * Stanno fuori da player.tsx per la stessa ragione di lyricsSync.ts: qui c'è
 * una regola che vale la pena provare con dei test, e i .tsx non si possono
 * importare da Node.
 *
 * LA DIFFERENZA TRA LE DUE, che è tutta la funzione:
 *   accoda        → in fondo, quando finisce quello che stai ascoltando
 *   inserisciDopo → subito dopo il brano in corso, per sentirlo adesso
 *
 * PERCHÉ PRENDONO UNA LISTA E NON UN BRANO. Chiamare "riproduci dopo" una
 * volta per ogni traccia di un album le infila tutte subito dopo quella in
 * ascolto, una davanti all'altra: l'ultima inserita finisce per prima, e
 * l'album parte dalla fine. Inserire il blocco in un colpo solo è l'unico
 * modo di tenerne l'ordine.
 */
import type { Track } from './api.ts';

export type Coda = { queue: Track[]; index: number };

/**
 * Toglie dalla coda i brani che stiamo per reinserire, così "riproduci dopo"
 * su qualcosa che è già in lista lo sposta invece di duplicarlo. Il brano in
 * ascolto non si tocca mai: toglierlo da sotto i piedi fermerebbe la musica.
 */
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

/**
 * Subito dopo il brano in ascolto, mantenendo l'ordine del blocco.
 * L'indice torna aggiornato: togliendo i doppioni la posizione del brano in
 * ascolto può essersi spostata indietro.
 */
export function inserisciDopo(coda: Coda, tracks: Track[]): Coda {
  if (tracks.length === 0) return coda;
  const pulita = senzaDoppioni(coda.queue, coda.index, tracks);
  const corrente = coda.queue[coda.index];
  const at = pulita.findIndex((t) => t === corrente);
  const q = [...pulita];
  q.splice(at + 1, 0, ...tracks);
  return { queue: q, index: at };
}
