import { useSyncExternalStore } from 'react';
import { qualitaCorrente, sottoscriviQualita, impostaQualita } from './sorgente.ts';
import type { Qualita } from './sorgente.ts';

/** La preferenza "originale / risparmio dati", condivisa da tutta l'app. */
export function useQualita(): [Qualita, (q: Qualita) => void] {
  const q = useSyncExternalStore(sottoscriviQualita, qualitaCorrente, qualitaCorrente);
  return [q, impostaQualita];
}
