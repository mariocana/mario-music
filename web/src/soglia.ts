/** Oltre questa durata non si aspetta la metà: quattro minuti bastano. */
const TETTO_SECONDI = 4 * 60;

/**
 * Quanti secondi vanno ascoltati perché il brano conti come ascoltato:
 * metà del brano, oppure quattro minuti, quello che viene prima.
 *
 * È la convenzione dello scrobbling. Serve a non gonfiare i conteggi mentre
 * si saltano i brani: contarli all'avvio renderebbe "i più ascoltati" un
 * elenco di pezzi scartati dopo tre secondi.
 */
export function sogliaAscolto(durata: number): number {
  if (!Number.isFinite(durata) || durata <= 0) return TETTO_SECONDI;
  return Math.min(durata / 2, TETTO_SECONDI);
}
