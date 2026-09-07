/**
 * QueuePanel.tsx — il pannello "In riproduzione".
 *
 * Mostra la coda vera, quella che il player sta usando: cliccare una riga
 * salta lì, le frecce riordinano, la ✕ toglie. Non è una lista a parte da
 * tenere in sincronia — legge e scrive lo stesso stato del player.
 *
 * Il riordino è a frecce e non a trascinamento: il drag-and-drop HTML non
 * funziona al tocco, e questa app si usa soprattutto dal telefono.
 */
import { formatTime } from '../api.ts';
import { usePlayer } from '../player.tsx';
import { Cover } from './Cover.tsx';
import { Icon } from './Icon.tsx';
import { Lyrics } from './Lyrics.tsx';

/** Riepilogo testuale della coda, condiviso da pannello e schermata piena. */
export function useQueueSummary(): string {
  const p = usePlayer();
  if (p.queue.length === 0) return 'Coda vuota';
  const rimanenti = p.queue.length - p.index - 1;
  return `${p.queue.length} brani · ${rimanenti > 0 ? `${rimanenti} dopo questo` : 'ultimo brano'}`;
}

/** La sola lista dei brani in coda: il contorno lo mette chi la usa. */
export function QueueList() {
  const p = usePlayer();

  return (
    <>
      {p.queue.length === 0 ? (
        <p className="hint queue-empty">Scegli un album per riempire la coda.</p>
      ) : (
        <ol className="queue-list">
          {p.queue.map((track, i) => (
            <li key={`${track.id}-${i}`} className={`queue-row ${i === p.index ? 'is-current' : ''} ${i < p.index ? 'is-past' : ''}`}>
              <button className="queue-main" onClick={() => p.playAt(i)} title="Riproduci">
                <Cover albumId={track.albumId} title={track.album} coverKey={track.coverKey} size="sm" />
                <span className="queue-text">
                  <span className="queue-title">{track.title}</span>
                  <span className="queue-sub">{track.artist}</span>
                </span>
                <span className="queue-time">{formatTime(track.duration)}</span>
              </button>

              <span className="queue-actions">
                <button
                  className="icon" onClick={() => p.move(i, i - 1)} disabled={i === 0}
                  title="Sposta su" aria-label="Sposta su"
                ><Icon name="up" size={15} /></button>
                <button
                  className="icon" onClick={() => p.move(i, i + 1)} disabled={i === p.queue.length - 1}
                  title="Sposta giù" aria-label="Sposta giù"
                ><Icon name="down" size={15} /></button>
                <button
                  className="icon" onClick={() => p.removeAt(i)}
                  title="Togli dalla coda" aria-label="Togli dalla coda"
                ><Icon name="close" size={15} /></button>
              </span>
            </li>
          ))}
        </ol>
      )}
    </>
  );
}

/** La colonna di destra su desktop: coda e testo, due schede sullo stesso spazio. */
export function QueuePanel({ scheda, onScheda, onClose }: {
  scheda: 'coda' | 'testo';
  onScheda: (s: 'coda' | 'testo') => void;
  onClose: () => void;
}) {
  const riepilogo = useQueueSummary();

  return (
    <aside className="queue" aria-label={scheda === 'coda' ? 'Coda di riproduzione' : 'Testo del brano'}>
      <header className="queue-head">
        <div className="queue-tabs">
          <button
            className={`queue-tab ${scheda === 'coda' ? 'is-attiva' : ''}`}
            onClick={() => onScheda('coda')}
            aria-pressed={scheda === 'coda'}
          >In riproduzione</button>
          <button
            className={`queue-tab ${scheda === 'testo' ? 'is-attiva' : ''}`}
            onClick={() => onScheda('testo')}
            aria-pressed={scheda === 'testo'}
          >Testo</button>
        </div>
        <button className="icon" onClick={onClose} title="Chiudi" aria-label="Chiudi il pannello">
          <Icon name="close" />
        </button>
      </header>

      {scheda === 'coda' ? (
        <>
          <p className="queue-riepilogo dim">{riepilogo}</p>
          <QueueList />
        </>
      ) : (
        <div className="queue-testo"><Lyrics /></div>
      )}
    </aside>
  );
}
