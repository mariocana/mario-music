import { useSyncExternalStore } from 'react';
import { normalizzaAttiva, sottoscriviNormalizza, impostaNormalizza } from './loudness.ts';

/** L'interruttore del livellamento del volume, condiviso da tutta l'app. */
export function useNormalizza(): [boolean, (on: boolean) => void] {
  const on = useSyncExternalStore(sottoscriviNormalizza, normalizzaAttiva, normalizzaAttiva);
  return [on, impostaNormalizza];
}
