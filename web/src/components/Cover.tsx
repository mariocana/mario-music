import { useState } from 'react';
import { coverUrl } from '../api.ts';

/** Copertina con ripiego grafico quando l'album non ne ha una. */
export function Cover({ albumId, title, coverKey, size = 'md' }: {
  albumId: number;
  title: string;
  /** impronta del contenuto: entra nell'URL per invalidare la cache */
  coverKey?: string | null;
  size?: 'sm' | 'md' | 'lg';
}) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <div className={`cover cover-${size} cover-empty`} aria-hidden>
        <span>{title.slice(0, 1).toUpperCase()}</span>
      </div>
    );
  }
  return (
    <img
      className={`cover cover-${size}`}
      src={coverUrl(albumId, coverKey)}
      alt=""
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}
