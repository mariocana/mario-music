/**
 * ripresa.ts — cosa si salva per ritrovare la coda dopo la chiusura dell'app.
 *
 * Due chiavi, non una. La coda può essere l'intera libreria ("Brani" →
 * riproduci tutto): migliaia di brani, centinaia di KB di JSON. Si riscrive
 * solo quando la coda cambia. La posizione invece è minuscola e si scrive
 * spesso: ogni pochi secondi, a ogni pausa, quando l'app va in background.
 *
 * Qui stanno solo i conti, senza AsyncStorage: leggere un ricordo vecchio,
 * scritto da una versione precedente o mezzo corrotto, non deve mai
 * impedire all'app di partire. Nel dubbio si riparte da zero.
 */
import type { RepeatMode, Track } from './types.ts';

export const CHIAVE_CODA = 'mario-music.ripresa.coda';
export const CHIAVE_POSIZIONE = 'mario-music.ripresa.posizione';

/** Ogni quanto, al massimo, si riscrive la posizione mentre si ascolta. */
export const INTERVALLO_SALVATAGGIO_MS = 5000;

export type CodaSalvata = {
  queue: Track[];
  /** l'ordine prima dello shuffle, per poterlo ripristinare; assente se coincide con `queue` */
  original?: Track[];
};

export type PosizioneSalvata = {
  index: number;
  /** l'id del brano a quell'indice: se non torna, la coda è cambiata dopo l'ultimo salvataggio */
  id: number;
  time: number;
  shuffle: boolean;
  repeat: RepeatMode;
};

export type Ripresa = {
  queue: Track[];
  original: Track[];
  index: number;
  time: number;
  shuffle: boolean;
  repeat: RepeatMode;
};

const MODI: RepeatMode[] = ['off', 'all', 'one'];

function brani(valore: unknown): Track[] | null {
  if (!Array.isArray(valore) || valore.length === 0) return null;
  const ok = valore.every((t) => t && typeof t === 'object' && typeof (t as Track).id === 'number');
  return ok ? (valore as Track[]) : null;
}

function leggiJson(grezzo: string | null): unknown {
  if (!grezzo) return null;
  try {
    return JSON.parse(grezzo);
  } catch {
    return null;
  }
}

/**
 * Rimette insieme coda e posizione. Null se non c'è niente di utilizzabile.
 *
 * Se l'indice salvato non punta più al brano salvato (la coda è stata
 * scritta dopo la posizione, o viceversa), si cerca il brano per id; se non
 * c'è, si riparte dall'inizio della coda, da zero secondi.
 */
export function leggiRipresa(codaGrezza: string | null, posizioneGrezza: string | null): Ripresa | null {
  const coda = leggiJson(codaGrezza) as Partial<CodaSalvata> | null;
  const queue = brani(coda?.queue);
  if (!queue) return null;
  const original = brani(coda?.original) ?? queue;

  const pos = (leggiJson(posizioneGrezza) ?? {}) as Partial<PosizioneSalvata>;
  let index = Number.isInteger(pos.index) ? (pos.index as number) : 0;
  let time = typeof pos.time === 'number' && Number.isFinite(pos.time) ? Math.max(0, pos.time) : 0;

  if (queue[index]?.id !== pos.id) {
    const trovato = queue.findIndex((t) => t.id === pos.id);
    if (trovato >= 0) {
      index = trovato;
    } else {
      index = 0;
      time = 0;
    }
  }

  // A pochi secondi dalla fine non ha senso ripartire: si riprende da capo.
  const durata = queue[index].duration;
  if (Number.isFinite(durata) && durata > 0 && time >= durata - 2) time = 0;

  return {
    queue,
    original,
    index,
    time,
    shuffle: pos.shuffle === true,
    repeat: MODI.includes(pos.repeat as RepeatMode) ? (pos.repeat as RepeatMode) : 'off',
  };
}

export function scriviCoda(queue: Track[], original: Track[]): string {
  const dati: CodaSalvata = original === queue ? { queue } : { queue, original };
  return JSON.stringify(dati);
}

export function scriviPosizione(p: PosizioneSalvata): string {
  return JSON.stringify(p);
}
