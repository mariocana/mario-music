/**
 * NowPlaying.tsx — la schermata piena del player, solo su mobile.
 *
 * Esiste perché la barra compatta non ha spazio: il titolo si tronca, i
 * comandi stanno a 33px e il volume era dovuto sparire del tutto. Qui c'è
 * posto per tutto, senza rubarne alla musica quando la schermata è chiusa.
 *
 * Si chiude trascinandola verso il basso. Il trascinamento è gestito con i
 * pointer event (non touch): così funziona identico con dito, mouse e penna.
 */
import { useRef, useState } from 'react';
import { formatTime } from '../api.ts';
import { usePlayer } from '../player.tsx';
import { useNavigate } from '../nav.tsx';
import type { View } from '../nav.tsx';
import { Cover } from './Cover.tsx';
import { Icon } from './Icon.tsx';
import { Scrubber } from './PlayerBar.tsx';
import { QueueList, useQueueSummary } from './QueuePanel.tsx';
import { Lyrics } from './Lyrics.tsx';

/** Oltre questi pixel trascinati verso il basso, la schermata si chiude. */
const SOGLIA_CHIUSURA = 110;

type Faccia = 'brano' | 'coda' | 'testo';

export function NowPlaying({ faccia, onFaccia, onClose }: {
  faccia: Faccia;
  onFaccia: (f: Faccia) => void;
  onClose: () => void;
}) {
  const p = usePlayer();
  const navigate = useNavigate();
  const riepilogo = useQueueSummary();

  /** Naviga e chiude la schermata: restare aperti coprirebbe la pagina aperta. */
  const vaiA = (view: View) => {
    navigate(view);
    onClose();
  };
  const [trascinamento, setTrascinamento] = useState(0);
  const partenza = useRef<number | null>(null);

  const durata = p.duration || p.current?.duration || 0;

  const iniziaTrascinamento = (e: React.PointerEvent) => {
    // Non si trascina partendo da un comando: quelli hanno il loro gesto.
    if ((e.target as HTMLElement).closest('button, .scrubber, .np-foot, .ly')) return;
    partenza.current = e.clientY;
  };

  const durante = (e: React.PointerEvent) => {
    if (partenza.current === null) return;
    // Solo verso il basso: verso l'alto la schermata non va da nessuna parte.
    setTrascinamento(Math.max(0, e.clientY - partenza.current));
  };

  const fine = () => {
    if (partenza.current === null) return;
    if (trascinamento > SOGLIA_CHIUSURA) onClose();
    partenza.current = null;
    setTrascinamento(0);
  };

  if (!p.current) return null;

  return (
    <div
      className="np"
      role="dialog"
      aria-label="In riproduzione"
      style={{
        transform: trascinamento ? `translateY(${trascinamento}px)` : undefined,
        // Durante il trascinamento niente transizione, o l'animazione
        // rincorrerebbe il dito con un ritardo visibile.
        transition: partenza.current !== null ? 'none' : undefined,
      }}
      onPointerDown={iniziaTrascinamento}
      onPointerMove={durante}
      onPointerUp={fine}
      onPointerCancel={fine}
    >
      <header className="np-head">
        <button className="np-grip" onClick={onClose} aria-label="Chiudi">
          <span />
        </button>
      </header>

      {faccia === 'brano' ? (
        <div className="np-body">
          <div className="np-art">
            <Cover
              albumId={p.current.albumId}
              title={p.current.album}
              coverKey={p.current.coverKey}
              size="lg"
            />
          </div>

          <div className="np-meta">
            <button
              className="np-link eyebrow"
              onClick={() => vaiA({ name: 'album', id: p.current!.albumId })}
              title={`Vai all'album ${p.current.album}`}
            >{p.current.album}</button>

            <h2>{p.current.title}</h2>

            <button
              className="np-link np-artist"
              onClick={() => vaiA({ name: 'artist', id: p.current!.artistId })}
              title={`Vai all'artista ${p.current.artist}`}
            >{p.current.artist}</button>
          </div>

          <div className="np-progress">
            <Scrubber
              value={p.currentTime}
              max={durata}
              buffered={p.buffered}
              onSeek={p.seek}
              ariaLabel="Posizione nel brano"
            />
            <div className="np-times">
              <span>{formatTime(p.currentTime)}</span>
              <span>-{formatTime(Math.max(0, durata - p.currentTime))}</span>
            </div>
          </div>

          <div className="np-controls">
            <button
              className={`icon ${p.shuffle ? 'on' : ''}`}
              onClick={p.toggleShuffle}
              aria-pressed={p.shuffle}
              title="Riproduzione casuale"
            ><Icon name="shuffle" size={22} /></button>
            <button className="icon" onClick={p.previous} title="Precedente"><Icon name="prev" size={30} /></button>
            <button className="icon np-play" onClick={p.toggle} title={p.isPlaying ? 'Pausa' : 'Riproduci'}>
              <Icon name={p.isPlaying ? 'pause' : 'play'} size={40} />
            </button>
            <button className="icon" onClick={p.next} title="Successivo"><Icon name="next" size={30} /></button>
            <button
              className={`icon ${p.repeat !== 'off' ? 'on' : ''}`}
              onClick={p.cycleRepeat}
              title={p.repeat === 'one' ? 'Ripeti brano' : p.repeat === 'all' ? 'Ripeti coda' : 'Ripetizione disattivata'}
            ><Icon name={p.repeat === 'one' ? 'repeatOne' : 'repeat'} size={22} /></button>
          </div>

          <div className="np-volume">
            <Icon name="mute" size={17} />
            <Scrubber
              value={p.muted ? 0 : p.volume}
              max={1}
              onSeek={p.setVolume}
              ariaLabel="Volume"
            />
            <Icon name="volume" size={17} />
          </div>
        </div>
      ) : faccia === 'testo' ? (
        <div className="np-body np-body-testo">
          <Lyrics />
        </div>
      ) : (
        <div className="np-body np-body-queue">
          <div className="np-queue-head">
            <h2>In riproduzione</h2>
            <span className="dim">{riepilogo}</span>
          </div>
          <QueueList />
        </div>
      )}

      <footer className="np-foot">
        <button
          className={`icon ${faccia === 'testo' ? 'on' : ''}`}
          onClick={() => onFaccia(faccia === 'testo' ? 'brano' : 'testo')}
          aria-pressed={faccia === 'testo'}
          title="Testo"
        ><Icon name="lyrics" size={20} /></button>
        <button
          className={`icon ${faccia === 'coda' ? 'on' : ''}`}
          onClick={() => onFaccia(faccia === 'coda' ? 'brano' : 'coda')}
          aria-pressed={faccia === 'coda'}
          title="Coda di riproduzione"
        ><Icon name="queue" size={20} /></button>
      </footer>
    </div>
  );
}
