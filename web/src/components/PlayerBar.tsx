import { useRef } from 'react';
import { formatTime } from '../api.ts';
import { usePlayer } from '../player.tsx';
import { Cover } from './Cover.tsx';
import { Icon } from './Icon.tsx';

/** Barra trascinabile: click e drag mappano la posizione X su un valore. */
export function Scrubber({ value, max, buffered = 0, onSeek, ariaLabel }: {
  value: number; max: number; buffered?: number; onSeek: (v: number) => void; ariaLabel: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  const valueAt = (clientX: number) => {
    const box = ref.current?.getBoundingClientRect();
    if (!box || box.width === 0) return 0;
    const ratio = Math.min(1, Math.max(0, (clientX - box.left) / box.width));
    return ratio * max;
  };

  const startDrag = (e: React.PointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    onSeek(valueAt(e.clientX));
  };

  const pct = max > 0 ? (value / max) * 100 : 0;
  const bufPct = max > 0 ? Math.min(100, (buffered / max) * 100) : 0;

  return (
    <div
      ref={ref}
      className="scrubber"
      role="slider"
      aria-label={ariaLabel}
      aria-valuemin={0}
      aria-valuemax={Math.round(max)}
      aria-valuenow={Math.round(value)}
      tabIndex={0}
      onPointerDown={startDrag}
      onPointerMove={(e) => { if (e.buttons === 1) onSeek(valueAt(e.clientX)); }}
      onKeyDown={(e) => {
        if (e.key === 'ArrowRight') onSeek(Math.min(max, value + 5));
        if (e.key === 'ArrowLeft') onSeek(Math.max(0, value - 5));
      }}
    >
      <div className="scrubber-track">
        <div className="scrubber-buffer" style={{ width: `${bufPct}%` }} />
        <div className="scrubber-fill" style={{ width: `${pct}%` }} />
        <div className="scrubber-knob" style={{ left: `${pct}%` }} />
      </div>
    </div>
  );
}

export type Vista = 'chiusa' | 'brano' | 'coda' | 'testo';

export function PlayerBar({ vista, onVista, onExpand }: {
  vista: Vista;
  onVista: (v: Vista) => void;
  /** su mobile: apre la schermata piena; su desktop non viene passata */
  onExpand?: () => void;
}) {
  const p = usePlayer();

  if (!p.current) {
    return (
      <footer className="playerbar playerbar-idle">
        <span>Scegli un brano per iniziare</span>
        <button
          className={`icon ${vista === 'coda' ? 'on' : ''}`}
          onClick={() => onVista(vista === 'coda' ? 'chiusa' : 'coda')}
          title="Coda di riproduzione"
        ><Icon name="queue" /></button>
      </footer>
    );
  }

  return (
    <footer className="playerbar">
      <div
        className={`pb-now ${onExpand ? 'pb-now-tap' : ''}`}
        onClick={onExpand}
        role={onExpand ? 'button' : undefined}
        tabIndex={onExpand ? 0 : undefined}
        onKeyDown={(e) => { if (onExpand && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onExpand(); } }}
        aria-label={onExpand ? 'Apri la schermata di riproduzione' : undefined}
      >
        <Cover albumId={p.current.albumId} title={p.current.album} coverKey={p.current.coverKey} size="sm" />
        <div className="pb-meta">
          <span className="pb-title">{p.current.title}</span>
          <span className="pb-sub">{p.current.artist} — {p.current.album}</span>
        </div>
      </div>

      <div className="pb-center">
        <div className="pb-buttons">
          <button
            className={`icon ${p.shuffle ? 'on' : ''}`}
            onClick={p.toggleShuffle}
            aria-pressed={p.shuffle}
            title="Riproduzione casuale"
          ><Icon name="shuffle" /></button>
          <button className="icon" onClick={p.previous} title="Precedente"><Icon name="prev" /></button>
          <button className="icon big" onClick={p.toggle} title={p.isPlaying ? 'Pausa' : 'Riproduci'}>
            <Icon name={p.isPlaying ? 'pause' : 'play'} size={26} />
          </button>
          <button className="icon" onClick={p.next} title="Successivo"><Icon name="next" /></button>
          <button
            className={`icon ${p.repeat !== 'off' ? 'on' : ''}`}
            onClick={p.cycleRepeat}
            title={p.repeat === 'one' ? 'Ripeti brano' : p.repeat === 'all' ? 'Ripeti coda' : 'Ripetizione disattivata'}
          ><Icon name={p.repeat === 'one' ? 'repeatOne' : 'repeat'} /></button>
        </div>

        <div className="pb-progress">
          <span className="t">{formatTime(p.currentTime)}</span>
          <Scrubber
            value={p.currentTime}
            max={p.duration || p.current.duration}
            buffered={p.buffered}
            onSeek={p.seek}
            ariaLabel="Posizione nel brano"
          />
          <span className="t">-{formatTime(Math.max(0, (p.duration || p.current.duration) - p.currentTime))}</span>
        </div>
      </div>

      <div className="pb-right">
        {p.isLoading && <span className="pb-buffering" title="In caricamento"><Icon name="spinner" size={15} /></span>}
        <button
          className={`icon pb-lyrics ${vista === 'testo' ? 'on' : ''}`}
          onClick={() => onVista(vista === 'testo' ? 'chiusa' : 'testo')}
          aria-pressed={vista === 'testo'}
          title="Testo"
        ><Icon name="lyrics" /></button>
        <button
          className={`icon pb-queue ${vista === 'coda' ? 'on' : ''}`}
          onClick={() => onVista(vista === 'coda' ? 'chiusa' : 'coda')}
          aria-pressed={vista === 'coda'}
          title="Coda di riproduzione"
        ><Icon name="queue" /></button>
        <button className="icon pb-mute" onClick={p.toggleMute} title="Muto">
          <Icon name={p.muted || p.volume === 0 ? 'mute' : 'volume'} />
        </button>
        <div className="pb-volume">
          <Scrubber
            value={p.muted ? 0 : p.volume}
            max={1}
            onSeek={p.setVolume}
            ariaLabel="Volume"
          />
        </div>
      </div>

      {p.error && <div className="pb-error" role="status">{p.error}</div>}
    </footer>
  );
}
