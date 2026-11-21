export const RIFERIMENTO = -18;
export const CHIAVE_NORMALIZZA = 'mario-music.normalizza';

export function guadagnoDb(loudness: number | null | undefined): number {
  if (loudness === null || loudness === undefined || !Number.isFinite(loudness) || loudness >= 0) return 0;
  return Math.min(0, RIFERIMENTO - loudness);
}

export function fattoreVolume(loudness: number | null | undefined): number {
  const db = guadagnoDb(loudness);
  if (db === 0) return 1;
  return Math.max(0.05, Math.min(1, 10 ** (db / 20)));
}

/** Il fattore da applicare a questo brano, tenendo conto dell'interruttore "Volume uniforme". */
export function volumeDelBrano(loudness: number | null | undefined, attiva: boolean): number {
  return attiva ? fattoreVolume(loudness) : 1;
}

/**
 * La preferenza salvata. Accesa se non c'è niente: nell'app la normalizzazione
 * è sempre stata attiva, e spegnerla da sola cambierebbe come suona la
 * musica alle spalle di chi ascolta. (Il web la teneva spenta per lo stesso
 * motivo: lì era il comportamento di partenza.)
 */
export function leggiNormalizza(grezzo: string | null): boolean {
  return grezzo !== '0';
}
