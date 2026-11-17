/**
 * gapless.ts — quando far partire il brano successivo, e con che volume.
 */

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

export const ANTICIPO_CARICAMENTO = 25;

export function devePrecaricare(tempo: number, durata: number, crossfade: number): boolean {
  if (!Number.isFinite(durata) || durata <= 0) return false;
  const quando = istanteTransizione(durata, crossfade) - ANTICIPO_CARICAMENTO;
  return tempo >= Math.max(0, quando);
}

/**
 * I due volumi durante la dissolvenza con equal-power curve.
 */
export function guadagni(p: number): { uscente: number; entrante: number } {
  const t = Math.max(0, Math.min(1, p));
  const angolo = (t * Math.PI) / 2;
  return { uscente: Math.cos(angolo), entrante: Math.sin(angolo) };
}

/**
 * Verifica se l'oggetto audio supporta il controllo software del volume.
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
