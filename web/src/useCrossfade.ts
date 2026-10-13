import { useSyncExternalStore } from 'react';
import { crossfadeCorrente, sottoscriviCrossfade, impostaCrossfade } from './gapless.ts';
import type { Crossfade } from './gapless.ts';

/** La durata della dissolvenza incrociata, condivisa da tutta l'app. */
export function useCrossfade(): [Crossfade, (s: Crossfade) => void] {
  const v = useSyncExternalStore(sottoscriviCrossfade, crossfadeCorrente, crossfadeCorrente);
  return [v, impostaCrossfade];
}
