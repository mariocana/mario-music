/**
 * gapless.ts — quando far partire il brano successivo, e con che volume.
 *
 * IL PROBLEMA. Con un solo elemento <audio>, il brano dopo comincia a
 * caricarsi quando il precedente è già finito: prima la richiesta HTTP, poi
 * l'intestazione del file, poi abbastanza byte per partire. Sono centinaia di
 * millisecondi di silenzio — di più se il file va convertito. Su un album
 * normale non si nota, su un disco dal vivo o su un concept album taglia la
 * musica a metà.
 *
 * LA SOLUZIONE. Due elementi: mentre il primo suona, il secondo ha già il suo
 * file in caricamento. Quando è il momento, il secondo parte e il primo si
 * ferma — senza aspettare nulla dalla rete.
 *
 * PERCHÉ NON WEB AUDIO. `decodeAudioData` + `AudioBufferSourceNode` darebbero
 * una transizione esatta al singolo campione, che è il gapless "vero". Ma su
 * iOS l'AudioContext viene sospeso quando l'app va in secondo piano, e tutta
 * la riproduzione a schermo bloccato — in auto, sulle casse Bluetooth — si
 * fermerebbe. Due <audio> restano elementi media nativi: il sistema continua
 * a trattarli come musica, e il blocco schermo non li tocca. Si rinuncia alla
 * precisione al campione per non perdere la cosa più importante.
 *
 * Qui dentro c'è solo aritmetica: niente DOM, così si può provare con i test.
 */

/** Le durate offerte dall'interfaccia. 0 = solo gapless, nessuna dissolvenza. */
export const DURATE_CROSSFADE = [0, 3, 6, 12] as const;
export type Crossfade = (typeof DURATE_CROSSFADE)[number];
export const CHIAVE_CROSSFADE = 'mario-music.crossfade';

/**
 * La dissolvenza non può durare più di metà del brano più corto coinvolto:
 * con 12 secondi di dissolvenza su un intermezzo di 20, il brano sarebbe già
 * a metà prima ancora di cominciare.
 */
export function durataEffettiva(crossfade: number, durata: number): number {
  if (!Number.isFinite(durata) || durata <= 0) return 0;
  return Math.max(0, Math.min(crossfade, durata / 2));
}

/**
 * A che secondo del brano comincia la transizione.
 * Senza dissolvenza è la fine esatta: il secondo brano parte quando il primo
 * finisce, ed è questo il gapless.
 */
export function istanteTransizione(durata: number, crossfade: number): number {
  return Math.max(0, durata - durataEffettiva(crossfade, durata));
}

/** È ora di far partire il prossimo? */
export function deveIniziare(tempo: number, durata: number, crossfade: number): boolean {
  if (!Number.isFinite(durata) || durata <= 0) return false;
  return tempo >= istanteTransizione(durata, crossfade);
}

/**
 * Quanto prima della fine mettere in carica il brano successivo. Non è la
 * stessa cosa della transizione: il file va chiesto molto prima, perché la
 * rete ha i suoi tempi — e se si va in dissolvenza, deve essere già pronto.
 */
export const ANTICIPO_CARICAMENTO = 25;

export function devePrecaricare(tempo: number, durata: number, crossfade: number): boolean {
  if (!Number.isFinite(durata) || durata <= 0) return false;
  const quando = istanteTransizione(durata, crossfade) - ANTICIPO_CARICAMENTO;
  return tempo >= Math.max(0, quando);
}

/**
 * I due volumi durante la dissolvenza, con `p` che va da 0 (inizio) a 1 (fine).
 *
 * Non è una rampa dritta, ed è il punto interessante. Il volume che senti va
 * con la POTENZA del segnale, che è il quadrato dell'ampiezza. Con due rampe
 * lineari, a metà strada i due brani stanno a 0.5 di ampiezza ciascuno:
 * 0.5² + 0.5² = 0.5, cioè metà della potenza di partenza. Si sente come un
 * avvallamento, un buco di volume proprio in mezzo alla transizione.
 *
 * Con coseno e seno invece cos²+sin² = 1 a ogni istante: la potenza resta
 * costante e il passaggio è continuo. È la curva "equal-power", quella dei
 * mixer veri.
 */
export function guadagni(p: number): { uscente: number; entrante: number } {
  const t = Math.max(0, Math.min(1, p));
  const angolo = (t * Math.PI) / 2;
  return { uscente: Math.cos(angolo), entrante: Math.sin(angolo) };
}

/**
 * Il volume si può davvero cambiare?
 *
 * Su iPhone e iPad no: `volume` esiste, si può scrivere, e il browser la
 * ignora — il volume è solo quello dei tasti fisici. Invece di indovinare dal
 * nome del browser (che mente, e cambia a ogni versione), si prova: si scrive
 * un valore e si rilegge. È la stessa differenza che passa tra chiedere a
 * qualcuno se sa nuotare e buttarlo in piscina.
 *
 * Dove non si può, la dissolvenza incrociata non è disponibile e resta il
 * gapless, che del volume non ha bisogno.
 */
export function volumeControllabile(audio: { volume: number }): boolean {
  const prima = audio.volume;
  try {
    audio.volume = 0.123;
    const risponde = Math.abs(audio.volume - 0.123) < 0.001;
    audio.volume = prima;
    return risponde;
  } catch {
    return false;
  }
}

/* ── la preferenza dell'utente, come per la qualità audio (sorgente.ts) ── */

const ascoltatori = new Set<() => void>();
let corrente: Crossfade | null = null;

function leggi(): Crossfade {
  try {
    const n = Number(localStorage.getItem(CHIAVE_CROSSFADE));
    return (DURATE_CROSSFADE as readonly number[]).includes(n) ? (n as Crossfade) : 0;
  } catch {
    return 0;
  }
}

export function crossfadeCorrente(): Crossfade {
  if (corrente === null) corrente = leggi();
  return corrente;
}

export function impostaCrossfade(secondi: Crossfade): void {
  corrente = secondi;
  try {
    localStorage.setItem(CHIAVE_CROSSFADE, String(secondi));
  } catch {
    /* navigazione privata o quota piena: vale per questa sessione */
  }
  for (const fn of ascoltatori) fn();
}

export function sottoscriviCrossfade(fn: () => void): () => void {
  ascoltatori.add(fn);
  return () => { ascoltatori.delete(fn); };
}
