import { useState } from 'react';
import { coverUrl } from '../api.ts';

/**
 * Copertina con ripiego a iniziale quando l'album non ne ha una.
 *
 * Due accorgimenti, entrambi nati da bug veri:
 *
 * 1. Senza `coverKey` non c'è copertina: si mostra subito l'iniziale, senza
 *    nemmeno provare a scaricarla. Durante un import gli album compaiono
 *    prima che le copertine vengano estratte, e questo evita una raffica di
 *    404 per ogni riquadro sullo schermo.
 *
 * 2. Si ricorda QUALE indirizzo ha fallito, non un semplice "ha fallito".
 *    Con un booleano, un riquadro che aveva fallito restava sull'iniziale
 *    per sempre: quando lo scan successivo trovava la copertina, l'indirizzo
 *    cambiava ma il componente non ci riprovava più.
 */
export function Cover({ albumId, title, coverKey, size = 'md' }: {
  albumId: number;
  title: string;
  /** impronta del contenuto: entra nell'URL per invalidare la cache */
  coverKey?: string | null;
  size?: 'sm' | 'md' | 'lg';
}) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const src = coverKey ? coverUrl(albumId, coverKey) : null;

  if (!src || failedSrc === src) {
    return (
      <div className={`cover cover-${size} cover-empty`} aria-hidden>
        <span>{title.slice(0, 1).toUpperCase()}</span>
      </div>
    );
  }

  return (
    <img
      className={`cover cover-${size}`}
      src={src}
      alt=""
      loading="lazy"
      onError={() => setFailedSrc(src)}
    />
  );
}
