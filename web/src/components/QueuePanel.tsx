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

export function QueuePanel({ onClose }: { onClose: () => void }) {
  const p = usePlayer();
  const rimanenti = p.queue.length - p.index - 1;

  return (
    <aside className="queue" aria-label="Coda di riproduzione">
      <header className="queue-head">
        <div>
          <h2>In riproduzione</h2>
          <span className="dim">
            {p.queue.length === 0
              ? 'Coda vuota'
              : `${p.queue.length} brani · ${rimanenti > 0 ? `${rimanenti} dopo questo` : 'ultimo brano'}`}
          </span>
        </div>
        <button className="icon" onClick={onClose} title="Chiudi la coda" aria-label="Chiudi la coda">
          <Icon name="close" />
        </button>
      </header>

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
    </aside>
  );
}
