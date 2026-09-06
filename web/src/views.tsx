/** Le schermate: griglia album, dettaglio album, artisti, brani, ricerca. */
import { useState } from 'react';
import { api, formatLength, formatTime } from './api.ts';
import type { Album } from './api.ts';
import { useAsync } from './useAsync.ts';
import { useNavigate } from './nav.tsx';
import { useLibrary } from './library.tsx';
import { usePlayer } from './player.tsx';
import { Cover } from './components/Cover.tsx';
import { Icon } from './components/Icon.tsx';
import { TrackList } from './components/TrackList.tsx';
import { DownloadButton } from './components/DownloadButton.tsx';
import { formatBytes, useDownloads } from './downloads.tsx';

function Loading() { return <p className="hint">Carico…</p>; }
function Failure({ message }: { message: string }) { return <p className="hint error">Errore: {message}</p>; }

function AlbumCard({ album }: { album: Album }) {
  const navigate = useNavigate();
  return (
    <button className="albumcard" onClick={() => navigate({ name: 'album', id: album.id })}>
      <Cover albumId={album.id} title={album.title} coverKey={album.coverKey} />
      <span className="albumcard-title">{album.title}</span>
      <span className="albumcard-sub">{album.artist}{album.year ? ` · ${album.year}` : ''}</span>
    </button>
  );
}

export function AlbumsView() {
  const { revision } = useLibrary();
  const { data, error, loading } = useAsync(() => api.albums(), [revision]);
  if (loading) return <Loading />;
  if (error) return <Failure message={error} />;
  if (!data?.length) return <p className="hint">Libreria vuota. Lancia <code>npm run seed &amp;&amp; npm run scan</code>.</p>;

  return (
    <>
      <h1>Album</h1>
      <div className="grid">
        {data.map((album) => <AlbumCard key={album.id} album={album} />)}
      </div>
    </>
  );
}

export function AlbumDetailView({ id }: { id: number }) {
  const { revision } = useLibrary();
  const { data, error, loading } = useAsync(() => api.album(id), [id, revision]);
  const player = usePlayer();
  const navigate = useNavigate();

  if (loading) return <Loading />;
  if (error) return <Failure message={error} />;
  if (!data) return null;

  const total = data.tracks.reduce((sum, t) => sum + t.duration, 0);

  return (
    <>
      <header className="albumhead">
        <Cover albumId={data.id} title={data.title} coverKey={data.coverKey} size="lg" />
        <div className="albumhead-meta">
          <span className="eyebrow">{data.genre ?? 'Album'}</span>
          <h1>{data.title}</h1>
          <button className="linkish" onClick={() => navigate({ name: 'artist', id: data.artistId })}>
            {data.artist}
          </button>
          <p className="dim">
            {data.year ? `${data.year} · ` : ''}{data.tracks.length} brani · {formatLength(total)}
          </p>
          <div className="albumhead-actions">
            <button className="primary" onClick={() => player.playQueue(data.tracks, 0)}>
              <Icon name="play" size={15} /> Riproduci
            </button>
            <button
              className="ghost"
              onClick={() => {
                if (!player.shuffle) player.toggleShuffle();
                player.playQueue(data.tracks, Math.floor(Math.random() * data.tracks.length));
              }}
            ><Icon name="shuffle" size={15} /> Casuale</button>
            <DownloadButton tracks={data.tracks} label="Scarica" />
          </div>
        </div>
      </header>
      <TrackList tracks={data.tracks} />
    </>
  );
}

export function ArtistsView() {
  const { revision } = useLibrary();
  const { data, error, loading } = useAsync(() => api.artists(), [revision]);
  const navigate = useNavigate();
  if (loading) return <Loading />;
  if (error) return <Failure message={error} />;

  return (
    <>
      <h1>Artisti</h1>
      <ul className="rows">
        {data?.map((artist) => (
          <li key={artist.id}>
            <button className="row" onClick={() => navigate({ name: 'artist', id: artist.id })}>
              <span className="row-title">{artist.name}</span>
              <span className="dim">{artist.albumCount} album · {artist.trackCount} brani</span>
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}

export function ArtistDetailView({ id }: { id: number }) {
  const { revision } = useLibrary();
  const { data, error, loading } = useAsync(() => api.artist(id), [id, revision]);
  if (loading) return <Loading />;
  if (error) return <Failure message={error} />;
  if (!data) return null;

  return (
    <>
      <h1>{data.name}</h1>
      <div className="grid">
        {data.albums.map((album) => <AlbumCard key={album.id} album={album} />)}
      </div>
    </>
  );
}

export function SongsView() {
  const { revision } = useLibrary();
  const { data, error, loading } = useAsync(() => api.tracks(), [revision]);
  if (loading) return <Loading />;
  if (error) return <Failure message={error} />;
  if (!data?.length) return <p className="hint">Nessun brano indicizzato.</p>;

  return (
    <>
      <h1>Brani</h1>
      <TrackList tracks={data} showAlbum />
    </>
  );
}

export function SearchView() {
  // La query vive qui, non in App: il campo esiste solo dentro questa vista.
  const [q, setQ] = useState('');
  const term = q.trim();
  const { data, error, loading } = useAsync(
    () => (term.length < 2 ? Promise.resolve([]) : api.search(term)),
    [term],
  );
  const navigate = useNavigate();
  const player = usePlayer();

  return (
    <>
      <input
        className="search searchbox"
        type="search"
        placeholder="Artisti, album, brani"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        // Toccando "Cerca" ci si aspetta di poter già scrivere.
        autoFocus
      />

      {term.length < 2 ? <p className="hint">Scrivi almeno due lettere.</p>
        : loading ? <Loading />
        : error ? <Failure message={error} />
        : !data?.length ? <p className="hint">Nessun risultato per “{term}”.</p>
        : (
          <ul className="rows">
            {data.map((hit, i) => (
              <li key={hit.id}>
                <button
                  className="row"
                  // I risultati diventano la coda: cliccarne uno fa partire da lì.
                  onClick={() => player.playQueue(data, i)}
                  onDoubleClick={() => navigate({ name: 'album', id: hit.albumId })}
                >
                  <Cover albumId={hit.albumId} title={hit.album} coverKey={hit.coverKey} size="sm" />
                  <span className="row-title">{hit.title}</span>
                  <span className="dim">{hit.artist} — {hit.album}</span>
                  <span className="dim">{formatTime(hit.duration)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
    </>
  );
}

export function DownloadsView() {
  const d = useDownloads();
  const player = usePlayer();

  if (!d.supported) {
    return <p className="hint">Questo browser non espone la Cache API: l'ascolto offline non è disponibile.</p>;
  }
  if (!d.ready) return <Loading />;

  const items = [...d.items.values()];
  const tracks = items.map((i) => i.track);
  const bytes = items.reduce((sum, i) => sum + i.size, 0);

  return (
    <>
      <h1>Scaricati</h1>

      {items.length === 0 ? (
        <p className="hint">
          Nessun brano scaricato. Usa il pulsante di download su un album o su un singolo brano:
          resterà ascoltabile anche con il server spento.
        </p>
      ) : (
        <>
          <div className="albumhead-actions" style={{ marginBottom: 18 }}>
            <button className="primary" onClick={() => player.playQueue(tracks, 0)}>
              <Icon name="play" size={15} /> Riproduci
            </button>
            <button className="ghost" onClick={() => void d.clear()}>Libera spazio</button>
          </div>
          <p className="dim" style={{ marginTop: -8 }}>
            {items.length} brani · {formatBytes(bytes)} occupati
            {d.usage && ` · ${formatBytes(d.usage.used)} di ${formatBytes(d.usage.quota)} concessi dal browser`}
            {d.usage && !d.usage.persisted && ' · spazio revocabile dal browser se il disco si riempie'}
          </p>
          <TrackList tracks={tracks} showAlbum />
        </>
      )}
    </>
  );
}
