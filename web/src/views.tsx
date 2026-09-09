/** Le schermate: griglia album, dettaglio album, artisti, brani, ricerca. */
import { useState } from 'react';
import { api, formatLength, formatTime, playlistCoverUrl } from './api.ts';
import type { Album, PlaylistSummary } from './api.ts';
import { useAsync } from './useAsync.ts';
import { useNavigate } from './nav.tsx';
import { useLibrary } from './library.tsx';
import { usePlayer } from './player.tsx';
import { Cover } from './components/Cover.tsx';
import { Icon } from './components/Icon.tsx';
import { TrackList } from './components/TrackList.tsx';
import { DownloadButton } from './components/DownloadButton.tsx';
import { AddMenu } from './components/AddMenu.tsx';
import { usePlaylists } from './playlists.tsx';
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
            <AddMenu tracks={data.tracks} variant="button" label="Playlist" />
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

/* ─────────────────────────── playlist ─────────────────────────── */

/**
 * L'immagine di una playlist, in ordine di preferenza: la copertina caricata
 * dall'utente, poi un mosaico dei primi quattro album, poi una copertina
 * sola, infine l'iniziale del nome.
 */
function Mosaico({ id, covers, name, coverKey }: {
  id: number;
  covers: PlaylistSummary['covers'];
  name: string;
  coverKey: string | null;
}) {
  if (coverKey) {
    return <img className="cover cover-md" src={playlistCoverUrl(id, coverKey)} alt="" loading="lazy" />;
  }
  if (covers.length === 0) {
    return <div className="cover cover-md cover-empty" aria-hidden><span>{name.slice(0, 1).toUpperCase()}</span></div>;
  }
  if (covers.length < 4) {
    return <Cover albumId={covers[0].albumId} title={name} coverKey={covers[0].coverKey} />;
  }
  return (
    <div className="mosaico" aria-hidden>
      {covers.slice(0, 4).map((c, i) => (
        <Cover key={i} albumId={c.albumId} title={name} coverKey={c.coverKey} size="sm" />
      ))}
    </div>
  );
}

export function PlaylistsView() {
  const playlists = usePlaylists();
  const navigate = useNavigate();
  const [nome, setNome] = useState('');

  return (
    <>
      <h1>Playlist</h1>

      <form
        className="playlist-nuova"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!nome.trim()) return;
          const creata = await playlists.create(nome.trim());
          setNome('');
          if (creata) navigate({ name: 'playlist', id: creata.id });
        }}
      >
        <input
          className="search"
          placeholder="Nome della nuova playlist"
          value={nome}
          onChange={(e) => setNome(e.target.value)}
        />
        <button className="primary" type="submit" disabled={!nome.trim()}>Crea</button>
      </form>

      {playlists.error && <p className="hint error">{playlists.error}</p>}

      {playlists.items.length === 0 ? (
        <p className="hint">Nessuna playlist. Creane una qui sopra, oppure dal menù ⋯ di un brano.</p>
      ) : (
        <div className="grid">
          {playlists.items.map((p) => (
            <button key={p.id} className="albumcard" onClick={() => navigate({ name: 'playlist', id: p.id })}>
              <Mosaico id={p.id} covers={p.covers} name={p.name} coverKey={p.coverKey} />
              <span className="albumcard-title">{p.name}</span>
              <span className="albumcard-sub">
                {p.trackCount} {p.trackCount === 1 ? 'brano' : 'brani'}
                {p.trackCount > 0 && ` · ${formatLength(p.duration)}`}
              </span>
            </button>
          ))}
        </div>
      )}
    </>
  );
}

export function PlaylistDetailView({ id }: { id: number }) {
  const playlists = usePlaylists();
  const player = usePlayer();
  const navigate = useNavigate();
  // La revisione del context fa ricaricare dopo ogni modifica.
  const { data, error, loading } = useAsync(() => api.playlist(id), [id, playlists.revision]);
  const [rinomina, setRinomina] = useState<string | null>(null);
  const [erroreCopertina, setErroreCopertina] = useState<string | null>(null);

  if (loading) return <Loading />;
  if (error) return <Failure message={error} />;
  if (!data) return null;

  const totale = data.tracks.reduce((somma, t) => somma + t.duration, 0);

  return (
    <>
      <header className="playlist-head">
        <div className="playlist-copertina">
          {data.coverKey ? (
            <img className="cover cover-lg" src={playlistCoverUrl(id, data.coverKey)} alt="" />
          ) : (
            <div className="cover cover-lg cover-empty" aria-hidden>
              <span>{data.name.slice(0, 1).toUpperCase()}</span>
            </div>
          )}

          <div className="playlist-copertina-azioni">
            {/* Un input file nudo non si può stilare: lo si nasconde e si
                usa la sua <label> come pulsante. */}
            <label className="ghost">
              {data.coverKey ? 'Cambia immagine' : 'Scegli immagine'}
              <input
                type="file"
                accept="image/*"
                hidden
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  // Si azzera subito: senza, ricaricare lo stesso file non
                  // scatenerebbe un nuovo change.
                  e.target.value = '';
                  if (!file) return;
                  setErroreCopertina(null);
                  try {
                    await playlists.setCover(id, file);
                  } catch (err) {
                    setErroreCopertina(err instanceof Error ? err.message : 'Caricamento fallito');
                  }
                }}
              />
            </label>
            {data.coverKey && (
              <button className="ghost" onClick={() => void playlists.clearCover(id)}>Rimuovi</button>
            )}
          </div>
          {erroreCopertina && <p className="hint error playlist-errore">{erroreCopertina}</p>}
        </div>

        <div className="playlist-testa-dati">
        {rinomina === null ? (
          <h1>{data.name}</h1>
        ) : (
          <form
            className="playlist-nuova"
            onSubmit={async (e) => {
              e.preventDefault();
              if (rinomina.trim()) await playlists.rename(id, rinomina.trim());
              setRinomina(null);
            }}
          >
            <input autoFocus className="search" value={rinomina} onChange={(e) => setRinomina(e.target.value)} />
            <button className="primary" type="submit">Salva</button>
            <button className="ghost" type="button" onClick={() => setRinomina(null)}>Annulla</button>
          </form>
        )}

        <p className="dim">
          {data.tracks.length} {data.tracks.length === 1 ? 'brano' : 'brani'}
          {data.tracks.length > 0 && ` · ${formatLength(totale)}`}
        </p>

        <div className="albumhead-actions">
          <button
            className="primary"
            disabled={data.tracks.length === 0}
            onClick={() => player.playQueue(data.tracks, 0)}
          >▶ Riproduci</button>
          <button
            className="ghost"
            disabled={data.tracks.length === 0}
            onClick={() => {
              if (!player.shuffle) player.toggleShuffle();
              player.playQueue(data.tracks, Math.floor(Math.random() * data.tracks.length));
            }}
          >⤨ Casuale</button>
          {rinomina === null && (
            <button className="ghost" onClick={() => setRinomina(data.name)}>Rinomina</button>
          )}
          <button
            className="ghost pericolo"
            onClick={async () => {
              // Cancellare una playlist non si annulla: si chiede conferma.
              if (!confirm(`Eliminare la playlist "${data.name}"? I brani restano in libreria.`)) return;
              await playlists.remove(id);
              navigate({ name: 'playlists' });
            }}
          >Elimina</button>
        </div>
        </div>
      </header>

      {data.tracks.length === 0 ? (
        <p className="hint">Playlist vuota. Aggiungi brani dal menù ⋯ di una traccia o di un album.</p>
      ) : (
        <TrackList
          tracks={data.tracks}
          showAlbum
          extra={(_t, i) => (
            <span className="playlist-azioni">
              <button
                className="icon" disabled={i === 0}
                onClick={() => void playlists.move(id, i, i - 1)}
                title="Sposta su" aria-label="Sposta su"
              ><Icon name="up" size={15} /></button>
              <button
                className="icon" disabled={i === data.tracks.length - 1}
                onClick={() => void playlists.move(id, i, i + 1)}
                title="Sposta giù" aria-label="Sposta giù"
              ><Icon name="down" size={15} /></button>
              <button
                className="icon"
                onClick={() => void playlists.removeAt(id, i)}
                title="Togli dalla playlist" aria-label="Togli dalla playlist"
              ><Icon name="close" size={15} /></button>
            </span>
          )}
        />
      )}
    </>
  );
}
