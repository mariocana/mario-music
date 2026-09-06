import type { Track } from '../api.ts';
import { formatTime } from '../api.ts';
import { usePlayer } from '../player.tsx';
import { DownloadButton } from './DownloadButton.tsx';
import { Icon } from './Icon.tsx';

type Props = {
  tracks: Track[];
  /** mostra colonna album/artista: utile in "Brani", inutile dentro un album */
  showAlbum?: boolean;
};

export function TrackList({ tracks, showAlbum = false }: Props) {
  const player = usePlayer();

  return (
    <ol className="tracklist">
      {tracks.map((track, i) => {
        const active = player.current?.id === track.id;
        return (
          <li
            key={track.id}
            className={`track ${active ? 'is-active' : ''}`}
            onDoubleClick={() => player.playQueue(tracks, i)}
          >
            <button
              className="track-index"
              onClick={() => (active ? player.toggle() : player.playQueue(tracks, i))}
              aria-label={active && player.isPlaying ? `Metti in pausa ${track.title}` : `Riproduci ${track.title}`}
            >
              {active && player.isPlaying
                ? <span className="bars" aria-hidden><i /><i /><i /></span>
                : <><span className="n">{track.trackNo ?? i + 1}</span><span className="play"><Icon name="play" size={13} /></span></>}
            </button>

            <div className="track-main">
              <span className="track-title">{track.title}</span>
              {showAlbum && <span className="track-sub">{track.artist} — {track.album}</span>}
            </div>

            <button
              className="icon track-queue"
              onClick={() => player.playNext(track)}
              title="Riproduci dopo"
              aria-label={`Riproduci ${track.title} dopo`}
            ><Icon name="queueNext" size={15} /></button>

            <span className="track-format">{track.codec?.toUpperCase()}</span>
            <span className="track-time">{formatTime(track.duration)}</span>
            <DownloadButton tracks={[track]} />
          </li>
        );
      })}
    </ol>
  );
}
