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
    // La rotazione del telefono ha il suo evento: lo si ascolta anche se in
    // teoria 'resize' basterebbe, perché qui in teoria bastava anche 'change'.
    window.addEventListener('orientationchange', onChange);
    return () => {
      mq.removeEventListener('change', onChange);
      window.removeEventListener('resize', onChange);
      window.removeEventListener('orientationchange', onChange);
    };
  }, [query]);

  return matches;
}

/**
 * Deve essere identica alla media query "mobile" in styles.css: là decide
 * l'aspetto, qui cosa viene montato. Se divergono, React monta la schermata
 * piena del telefono sopra il layout desktop, o viceversa.
 */
export const MOBILE_QUERY = '(max-width: 700px), ((pointer: coarse) and (max-height: 520px))';

export const useIsMobile = () => useMediaQuery(MOBILE_QUERY);
