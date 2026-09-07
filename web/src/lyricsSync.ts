import type { LyricLine } from './api.ts';

/**
 * Indice del verso in corso al secondo `t`: l'ultimo che è già cominciato.
 *
 * Il piccolo anticipo compensa il fatto che si legge il tempo a fotogrammi
 * discreti: senza, il verso si accende sempre un pelo dopo che è iniziato.
 *
 * Sta in un file suo, e non dentro al componente, per due motivi: è logica
 * pura e va provata con dei test, e Node sa eseguire un `.ts` ma non un
 * `.tsx` (strippa i tipi, non compila il JSX).
 */
export function indiceAttivo(righe: LyricLine[] | null | undefined, t: number): number {
  if (!righe || righe.length === 0) return -1;
  let i = -1;
  for (let k = 0; k < righe.length; k++) {
    if (righe[k].t <= t + 0.12) i = k;
    else break;
  }
  return i;
}
