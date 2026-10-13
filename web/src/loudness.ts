/**
 * loudness.ts (lato browser) — da quanto suona forte un brano al volume con
 * cui riprodurlo.
 *
 * SI PUÒ SOLO ABBASSARE. `audio.volume` va da 0 a 1: alzare non si può.
 * Quindi non si porta ogni brano al livello di riferimento, si porta ogni
 * brano **più forte** del riferimento giù fino a lui. I pochi più sommessi
 * restano come sono — male che vada li si sente come prima, e nessun brano
 * viene mai distorto perché il volume non supera mai 1.
 *
 * IL RIFERIMENTO è -18 LUFS, più basso dei -14 di Spotify e dei -16 di Apple.
 * Con un riferimento alto bisognerebbe amplificare i brani sommessi, che è
 * proprio quello che non possiamo fare; con uno basso si attenua e basta. Si
 * perde un po' di volume assoluto — si alza la manopola una volta — e si
 * guadagna che tutta la libreria suona allo stesso livello.
 */

/** Il livello a cui si allinea la libreria, in LUFS. */
export const RIFERIMENTO = -18;
export const CHIAVE_NORMALIZZA = 'mario-music.normalizza';

/**
 * Di quanti decibel va corretto questo brano. Mai positivo: vedi sopra.
 * `null` quando la misura non c'è ancora — e allora non si tocca niente.
 */
export function guadagnoDb(loudness: number | null | undefined): number {
  if (loudness === null || loudness === undefined || !Number.isFinite(loudness) || loudness >= 0) return 0;
  return Math.min(0, RIFERIMENTO - loudness);
}

/**
 * Da decibel a fattore di volume: ogni -6 dB dimezza l'ampiezza.
 * Il taglio a 0.05 è una rete di sicurezza: una misura sballata (un file
 * rotto letto come fortissimo) non deve rendere un brano inudibile.
 */
export function fattoreVolume(loudness: number | null | undefined): number {
  const db = guadagnoDb(loudness);
  if (db === 0) return 1;
  return Math.max(0.05, Math.min(1, 10 ** (db / 20)));
}

/* ── la preferenza dell'utente, come per qualità e dissolvenza ── */

const ascoltatori = new Set<() => void>();
let attiva: boolean | null = null;

function leggi(): boolean {
  try {
    // Spenta finché non la si accende: cambia come suona la musica, e una
    // cosa del genere non si accende da sola alle spalle di chi ascolta.
    return localStorage.getItem(CHIAVE_NORMALIZZA) === '1';
  } catch {
    return false;
  }
}

export function normalizzaAttiva(): boolean {
  if (attiva === null) attiva = leggi();
  return attiva;
}

export function impostaNormalizza(on: boolean): void {
  attiva = on;
  try {
    localStorage.setItem(CHIAVE_NORMALIZZA, on ? '1' : '0');
  } catch {
    /* navigazione privata o quota piena: vale per questa sessione */
  }
  for (const fn of ascoltatori) fn();
}

export function sottoscriviNormalizza(fn: () => void): () => void {
  ascoltatori.add(fn);
  return () => { ascoltatori.delete(fn); };
}

/** Il fattore da applicare a questo brano, tenendo conto della preferenza. */
export function volumeDelBrano(loudness: number | null | undefined): number {
  return normalizzaAttiva() ? fattoreVolume(loudness) : 1;
}
