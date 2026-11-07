export const RIFERIMENTO = -18;

export function guadagnoDb(loudness: number | null | undefined): number {
  if (loudness === null || loudness === undefined || !Number.isFinite(loudness) || loudness >= 0) return 0;
  return Math.min(0, RIFERIMENTO - loudness);
}

export function fattoreVolume(loudness: number | null | undefined): number {
  const db = guadagnoDb(loudness);
  if (db === 0) return 1;
  return Math.max(0.05, Math.min(1, 10 ** (db / 20)));
}
