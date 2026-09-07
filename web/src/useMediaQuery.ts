import { useEffect, useState } from 'react';

/**
 * Segue una media query da JavaScript.
 *
 * Serve dove il CSS non basta: la schermata a tutto schermo del player esiste
 * solo su mobile, quindi non va nemmeno montata su desktop — nasconderla con
 * `display: none` lascerebbe comunque gli ascoltatori di eventi attivi.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);

  useEffect(() => {
    const mq = window.matchMedia(query);
    const onChange = () => setMatches(mq.matches);
    onChange();

    // Due ascoltatori per lo stesso fatto. L'evento 'change' della media
    // query è quello giusto, ma non è arrivato in tutti gli ambienti provati:
    // restando indietro, l'app teneva montata la schermata piena del telefono
    // su una finestra desktop. 'resize' è la rete di sicurezza.
    mq.addEventListener('change', onChange);
    window.addEventListener('resize', onChange);
    return () => {
      mq.removeEventListener('change', onChange);
      window.removeEventListener('resize', onChange);
    };
  }, [query]);

  return matches;
}

export const useIsMobile = () => useMediaQuery('(max-width: 700px)');
