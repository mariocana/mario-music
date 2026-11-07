const TETTO_SECONDI = 4 * 60;

export function sogliaAscolto(durata: number): number {
  if (!Number.isFinite(durata) || durata <= 0) return TETTO_SECONDI;
  return Math.min(durata / 2, TETTO_SECONDI);
}
