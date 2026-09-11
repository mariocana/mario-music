import type { Track } from '../api.ts';
import { formatTime } from '../api.ts';
import { usePlayer } from '../player.tsx';
import { useListening } from '../listening.tsx';
import { useIsMobile } from '../useMediaQuery.ts';
import { Cover } from './Cover.tsx';
import { DownloadButton } from './DownloadButton.tsx';
import { AddMenu } from './AddMenu.tsx';
import type { VoceMenu } from './AddMenu.tsx';
import { Icon } from './Icon.tsx';

type Props = {
  tracks: Track[];
  /** mostra artista e album: utile in "Brani", inutile dentro un album */
  showAlbum?: boolean;
  /**
   * Azioni proprie del contesto, aggiunte in cima al menù ⋯ di ogni riga.
   * Nelle playlist ci finiscono riordino e rimozione: in riga sarebbero tre
   * simboli in più su ogni traccia.
   */
  menuItems?: (track: Track, index: number) => VoceMenu[];
  /**
   * 'album' mette il numero di traccia a sinistra: ha senso solo dentro un
   * album. Altrove quel numero è la posizione del brano nel SUO album — il
   * primo di una playlist con un "10" a fianco — quindi si mostra la
   * copertina, che identifica la traccia molto meglio di una cifra.
   */
  numbering?: 'album' | 'nessuno';
};

export function TrackList({ tracks, showAlbum = false, menuItems, numbering = 'album' }: Props) {
  const player = usePlayer();
  const isMobile = useIsMobile();
  const ascolti = useListening();
  const conCopertina = numbering === 'nessuno';

  /** Colonne separate per artista e album solo dove c'è spazio. */
  const colonneSeparate = showAlbum && !isMobile;

  return (
    <ol className={`tracklist${conCopertina ? ' con-copertina' : ''}${colonneSeparate ? ' con-colonne' : ''}`}>
      {tracks.map((track, i) => {
        const active = player.current?.id === track.id;
        const suona = active && player.isPlaying;
        const riproduci = () => (active ? player.toggle() : player.playQueue(tracks, i));

        return (
          <li
            key={`${track.id}-${i}`}
            className={`track ${active ? 'is-active' : ''}`}
            // Tutta la riga avvia il brano: al tocco non serve centrare un
            // bersaglio piccolo. I pulsanti interni si gestiscono da soli.
            onClick={(e) => {
              if ((e.target as HTMLElement).closest('button')) return;
              riproduci();
            }}
          >
            {conCopertina ? (
              <button
                className="track-art"
                onClick={riproduci}
                aria-label={suona ? `Metti in pausa ${track.title}` : `Riproduci ${track.title}`}
              >
                <Cover albumId={track.albumId} title={track.album} coverKey={track.coverKey} size="sm" />
                {/* Il brano in corso porta la classe sull'elemento stesso
                    invece di dipendere da `.track.is-active` nel CSS: una
                    regola in meno da far vincere, e lo stato ce l'ha già
                    React. Sopra la copertina compare il play al passaggio
                    del mouse, e le barrette mentre suona. */}
                <span className={`track-art-sopra${active ? ' is-visibile' : ''}`} aria-hidden>
                  {suona
                    ? <span className="bars"><i /><i /><i /></span>
                    : <Icon name={active ? 'pause' : 'play'} size={16} />}
                </span>
              </button>
            ) : (
              <button
                className="track-index"
                onClick={riproduci}
                aria-label={suona ? `Metti in pausa ${track.title}` : `Riproduci ${track.title}`}
              >
                {suona
                  ? <span className="bars" aria-hidden><i /><i /><i /></span>
                  : <><span className="n">{track.trackNo ?? i + 1}</span><span className="play"><Icon name="play" size={13} /></span></>}
              </button>
            )}

            <div className="track-main">
              <span className="track-title">{track.title}</span>
              {showAlbum && !colonneSeparate && (
                <span className="track-sub">{track.artist} — {track.album}</span>
              )}
            </div>

            {colonneSeparate && <span className="track-artista">{track.artist}</span>}
            {colonneSeparate && <span className="track-album">{track.album}</span>}
            {!conCopertina && <span className="track-format">{track.codec?.toUpperCase()}</span>}

            {/* Cella sempre presente ma vuota se il brano non è preferito:
                tenere la colonna evita che le righe si disallineino, e non
                aggiunge un simbolo su ogni traccia. Si aggiunge dal menù ⋯. */}
            <span className="track-cuore">
              {ascolti.isFavorite(track.id) && (
                <button
                  className="icon is-preferito"
                  onClick={() => void ascolti.toggleFavorite(track)}
                  title="Togli dai preferiti"
                  aria-label={`Togli ${track.title} dai preferiti`}
                ><Icon name="heartFilled" size={14} /></button>
              )}
            </span>

            <DownloadButton tracks={[track]} />
            <span className="track-time">{formatTime(track.duration)}</span>
            <AddMenu tracks={[track]} singleTrack voci={menuItems?.(track, i)} />
          </li>
        );
      })}
    </ol>
  );
}
