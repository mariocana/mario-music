/** Le schermate: griglia album, dettaglio album, artisti, brani, ricerca. */
import { useState } from 'react';
import { api, formatLength, formatTime, playlistCoverUrl } from './api.ts';
import type { Album, PlaylistSummary } from './api.ts';
import { useAsync } from './useAsync.ts';
import { useNavigate } from './nav.tsx';
import type { View } from './nav.tsx';
import { useLibrary } from './library.tsx';
import { usePlayer } from './player.tsx';
import { Cover } from './components/Cover.tsx';
import { Icon } from './components/Icon.tsx';
import type { IconName } from './components/Icon.tsx';
import { TrackList } from './components/TrackList.tsx';
import { DownloadButton } from './components/DownloadButton.tsx';
import { AddMenu } from './components/AddMenu.tsx';
import { usePlaylists } from './playlists.tsx';
import { useListening } from './listening.tsx';
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
        {/* Il menù ⋯ sta in alto a destra, come su Apple Music: playlist e
            "riproduci dopo" non meritano un pulsante in fila con gli altri. */}
        <div className="albumhead-menu"><AddMenu tracks={data.tracks} /></div>

        <Cover albumId={data.id} title={data.title} coverKey={data.coverKey} size="lg" />

        <div className="albumhead-meta">
          <h1>{data.title}</h1>
          <button className="albumhead-artist" onClick={() => navigate({ name: 'artist', id: data.artistId })}>
            {data.artist}
          </button>
          {(data.genre || data.year) && (
            <p className="albumhead-sub">{[data.genre, data.year].filter(Boolean).join(' · ')}</p>
          )}

          {/* Tre comandi, sempre sulla stessa riga: casuale, Riproduci, scarica. */}
          <div className="albumhead-actions">
            <button
              className="round"
              onClick={() => {
                if (!player.shuffle) player.toggleShuffle();
                player.playQueue(data.tracks, Math.floor(Math.random() * data.tracks.length));
              }}
              title="Riproduzione casuale" aria-label="Riproduzione casuale"
            ><Icon name="shuffle" size={20} /></button>
            <button className="pill-play" onClick={() => player.playQueue(data.tracks, 0)}>
              <Icon name="play" size={16} /> Riproduci
            </button>
            <DownloadButton tracks={data.tracks} compact />
          </div>
        </div>
      </header>

      <TrackList tracks={data.tracks} />

      {/* Come su Apple Music: il totale sta in fondo, dove serve dopo aver scorso. */}
      <p className="albumfoot dim">
        {data.tracks.length} {data.tracks.length === 1 ? 'brano' : 'brani'} · {formatLength(total)}
      </p>
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
      <TrackList tracks={data} showAlbum numbering="nessuno" />
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
          // Stessa lista delle altre schermate: i risultati diventano la coda.
          <TrackList tracks={data} showAlbum numbering="nessuno" />
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
          <TrackList tracks={tracks} showAlbum numbering="nessuno" />
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
          numbering="nessuno"
          // Riordino e rimozione stanno nel menù ⋯ e non in riga: erano tre
          // simboli in più su ogni traccia, oltre a download e menù.
          menuItems={(_t, i) => [
            { label: 'Sposta su', icon: 'up', disabled: i === 0, onClick: () => void playlists.move(id, i, i - 1) },
            { label: 'Sposta giù', icon: 'down', disabled: i === data.tracks.length - 1, onClick: () => void playlists.move(id, i, i + 1) },
            { label: 'Togli dalla playlist', icon: 'trash', onClick: () => void playlists.removeAt(id, i) },
          ]}
        />
      )}
    </>
  );
}

/* ──────────────────── preferiti e ascolti ──────────────────── */

export function FavoritesView() {
  const ascolti = useListening();
  const player = usePlayer();
  // La revisione del context fa ricaricare quando si toglie un cuore.
  const { data, error, loading } = useAsync(() => api.favorites(), [ascolti.revision]);

  if (loading) return <Loading />;
  if (error) return <Failure message={error} />;

  if (!data?.length) {
    return (
      <>
        <h1>Preferiti</h1>
        <p className="hint">
          Nessun preferito. Apri il menù ⋯ di un brano e scegli “Aggiungi ai preferiti”.
        </p>
      </>
    );
  }

  const totale = data.reduce((somma, t) => somma + t.duration, 0);

  return (
    <>
      <h1>Preferiti</h1>
      <p className="dim sotto-titolo">
        {data.length} {data.length === 1 ? 'brano' : 'brani'} · {formatLength(totale)}
      </p>
      <div className="albumhead-actions">
        <button className="primary" onClick={() => player.playQueue(data, 0)}>▶ Riproduci</button>
        <button
          className="ghost"
          onClick={() => {
            if (!player.shuffle) player.toggleShuffle();
            player.playQueue(data, Math.floor(Math.random() * data.length));
          }}
        >⤨ Casuale</button>
      </div>
      <TrackList tracks={data} showAlbum numbering="nessuno" />
    </>
  );
}

export function ListeningView() {
  const [scheda, setScheda] = useState<'recenti' | 'top'>('recenti');
  const [periodo, setPeriodo] = useState<number | undefined>(undefined);
  const player = usePlayer();

  const { data, error, loading } = useAsync(
    () => (scheda === 'recenti' ? api.recent() : api.top(periodo)),
    [scheda, periodo],
  );

  return (
    <>
      <h1>Ascolti</h1>

      <div className="queue-tabs sotto-titolo">
        <button
          className={`queue-tab ${scheda === 'recenti' ? 'is-attiva' : ''}`}
          onClick={() => setScheda('recenti')}
        >Di recente</button>
        <button
          className={`queue-tab ${scheda === 'top' ? 'is-attiva' : ''}`}
          onClick={() => setScheda('top')}
        >Più ascoltati</button>
      </div>

      {scheda === 'top' && (
        <div className="queue-tabs sotto-titolo">
          {([[undefined, 'Sempre'], [30, 'Ultimo mese'], [7, 'Ultima settimana']] as const).map(([g, etichetta]) => (
            <button
              key={etichetta}
              className={`queue-tab ${periodo === g ? 'is-attiva' : ''}`}
              onClick={() => setPeriodo(g)}
            >{etichetta}</button>
          ))}
        </div>
      )}

      {loading ? <Loading />
        : error ? <Failure message={error} />
        : !data?.length ? (
          <p className="hint">
            {scheda === 'recenti'
              ? 'Ancora nessun ascolto. Un brano conta quando ne hai sentito metà, o quattro minuti.'
              : 'Nessun ascolto in questo periodo.'}
          </p>
        ) : (
          <>
            <div className="albumhead-actions">
              <button className="primary" onClick={() => player.playQueue(data, 0)}>▶ Riproduci</button>
            </div>
            <TrackList tracks={data} showAlbum numbering="nessuno" />
          </>
        )}
    </>
  );
}

/* ─────────────────────────── libreria (mobile) ─────────────────────────── */

/**
 * La pagina "Libreria" del telefono: un elenco delle sezioni che non stanno
 * nella barra in fondo. Su desktop non serve, la barra laterale le mostra
 * tutte — ma è raggiungibile lo stesso, non fa danni.
 */
export function LibraryHubView() {
  const navigate = useNavigate();
  const downloads = useDownloads();
  const voci: Array<{ label: string; icon: IconName; target: View; nota?: string }> = [
    { label: 'Artisti', icon: 'artist', target: { name: 'artists' } },
    { label: 'Brani', icon: 'note', target: { name: 'songs' } },
    { label: 'Album', icon: 'grid', target: { name: 'albums' } },
    { label: 'Playlist', icon: 'playlist', target: { name: 'playlists' } },
    { label: 'Preferiti', icon: 'heart', target: { name: 'favorites' } },
    { label: 'Ascolti', icon: 'chart', target: { name: 'listening' }, nota: 'di recente e più ascoltati' },
  ];
  if (downloads.supported) {
    voci.push({
      label: 'Scaricati', icon: 'downloadBox', target: { name: 'downloads' },
      nota: downloads.items.size > 0 ? `${downloads.items.size} brani offline` : undefined,
    });
  }

  return (
    <>
      <h1>Libreria</h1>
      <ul className="hub">
        {voci.map((v) => (
          <li key={v.label}>
            <button className="hub-voce" onClick={() => navigate(v.target)}>
              <span className="hub-icona"><Icon name={v.icon} size={20} /></span>
              <span className="hub-testo">
                <span className="hub-label">{v.label}</span>
                {v.nota && <span className="dim">{v.nota}</span>}
              </span>
              <Icon name="next" size={14} />
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}
