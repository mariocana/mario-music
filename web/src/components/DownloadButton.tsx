import type { Track } from '../api.ts';
import { useDownloads } from '../downloads.tsx';
import { Icon } from './Icon.tsx';

/**
 * Bottone a tre stati: da scaricare → in corso (con percentuale) → salvato.
 * Cliccato quando è già salvato, rimuove il download.
 */
export function DownloadButton({ tracks, label, compact = false }: {
  tracks: Track[];
  label?: string;
  /** solo icona, senza percentuali né conteggi: per i pulsanti tondi */
  compact?: boolean;
}) {
  const d = useDownloads();
  if (!d.supported || tracks.length === 0) return null;

  const done = tracks.filter((t) => d.items.has(t.id));
  const running = tracks.filter((t) => d.progress.has(t.id));
  const allDone = done.length === tracks.length;

  if (running.length > 0) {
    // Percentuale sull'intero gruppo: i brani già finiti contano per 1.
    const partial = running.reduce((sum, t) => sum + (d.progress.get(t.id) ?? 0), 0);
    const pct = Math.round(((done.length + partial) / tracks.length) * 100);
    return (
      <button className="ghost dl dl-busy" disabled>
        <span className="dl-ring" style={{ '--pct': `${pct}%` } as React.CSSProperties} />
        {compact ? null : label ? `Scarico… ${pct}%` : `${pct}%`}
      </button>
    );
  }

  if (allDone) {
    return (
      <button
        className="ghost dl dl-done"
        title="Rimuovi dai download"
        onClick={() => void d.remove(tracks.map((t) => t.id))}
      ><Icon name="check" size={15} />{label ? ' Scaricato' : ''}</button>
    );
  }

  return (
    <button
      className="ghost dl"
      title={d.online ? 'Scarica per ascoltare offline' : 'Serve la rete per scaricare'}
      disabled={!d.online}
      onClick={() => void d.download(tracks)}
    ><Icon name="download" size={15} />{label ? ` ${label}` : ''}{!compact && done.length > 0 ? ` (${done.length}/${tracks.length})` : ''}</button>
  );
}
