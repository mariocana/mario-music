import { useEffect, useState } from 'react';
import { api } from './api.ts';
import { NavContext } from './nav.tsx';
import type { View } from './nav.tsx';
import { useAsync } from './useAsync.ts';
import { PlayerBar } from './components/PlayerBar.tsx';
import { QueuePanel } from './components/QueuePanel.tsx';
import { NowPlaying } from './components/NowPlaying.tsx';
import { useIsMobile } from './useMediaQuery.ts';
import { usePlayer } from './player.tsx';
import {
  AlbumsView, AlbumDetailView, ArtistsView, ArtistDetailView, SongsView, SearchView,
  DownloadsView, PlaylistsView, PlaylistDetailView, FavoritesView, ListeningView,
  LibraryHubView,
} from './views.tsx';
import { MobileTabBar } from './components/MobileTabBar.tsx';
import { usePlaylists } from './playlists.tsx';
import { useDownloads } from './downloads.tsx';
import { useLibrary } from './library.tsx';
import { Icon } from './components/Icon.tsx';

export function App() {
  /**
   * La cronologia delle schermate è quella del browser, non uno stato nostro.
   *
   * Ogni voce di history porta { view, depth }. Così il tasto Indietro
   * dell'app fa semplicemente history.back(), e in più funzionano gratis il
   * gesto dal bordo sinistro di iOS, il pulsante Indietro di Android, e il
   * ricaricamento della pagina — che prima ti riportava sempre agli album.
   *
   * `depth` dice quanto si è scesi: le sezioni della barra sono a 0 e non
   * mostrano il tasto; album, artista e playlist aperti da lì sono a 1, 2…
   */
  const [stato, setStato] = useState<{ view: View; depth: number }>(() =>
    history.state?.view ? history.state : { view: { name: 'albums' }, depth: 0 });
  const view = stato.view;

  useEffect(() => {
    if (!history.state?.view) history.replaceState({ view: stato.view, depth: 0 }, '');
    const onPop = (e: PopStateEvent) => { if (e.state?.view) setStato(e.state); };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const back = () => history.back();
  // Un solo stato per entrambi i formati: su desktop 'coda' e 'testo' sono
  // le due schede della colonna di destra, su mobile sono due facce della
  // schermata piena (dove esiste anche 'brano', che su desktop non serve).
  const isMobile = useIsMobile();
  const [vista, setVista] = useState<'chiusa' | 'brano' | 'coda' | 'testo'>('chiusa');
  const colonnaAperta = !isMobile && (vista === 'coda' || vista === 'testo');
  const library = useLibrary();
  const { data: stats } = useAsync(() => api.stats(), [library.revision]);
  const player = usePlayer();
  const downloads = useDownloads();
  const playlists = usePlaylists();

  // La barra spaziatrice mette in pausa, come in Apple Music — ma non mentre
  // si sta scrivendo nel campo di ricerca.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.isContentEditable) return;
      if (e.code === 'Space') { e.preventDefault(); player.toggle(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [player]);

  /** Dalla barra: cambia sezione senza scendere di livello, come le schede di iOS. */
  const nav = (next: View) => {
    const s = { view: next, depth: 0 };
    history.replaceState(s, '');
    setStato(s);
  };

  /** Dal contenuto (una copertina, una riga, una voce di menù): si scende di un livello. */
  const navigate = (next: View) => {
    const s = { view: next, depth: stato.depth + 1 };
    history.pushState(s, '');
    setStato(s);
  };

  const item = (name: View['name'], label: string, target: View) => (
    <button
      className={`navitem ${view.name === name ? 'is-current' : ''}`}
      onClick={() => nav(target)}
    >{label}</button>
  );

  return (
    <NavContext.Provider value={navigate}>
      <div className={`app${colonnaAperta ? ' with-queue' : ''}`}>
        {isMobile ? (
          <MobileTabBar view={view} onNav={nav} />
        ) : (
          <aside className="sidebar">
            <div className="brand">mario<span>music</span></div>

            <nav>
              {item('search', 'Cerca', { name: 'search' })}
              <span className="navlabel">Libreria</span>
              {item('albums', 'Album', { name: 'albums' })}
              {item('artists', 'Artisti', { name: 'artists' })}
              {item('songs', 'Brani', { name: 'songs' })}
              {item('playlists', 'Playlist', { name: 'playlists' })}
              {item('favorites', 'Preferiti', { name: 'favorites' })}
              {item('listening', 'Ascolti', { name: 'listening' })}
              {downloads.supported && (
                <button
                  className={`navitem ${view.name === 'downloads' ? 'is-current' : ''}`}
                  onClick={() => nav({ name: 'downloads' })}
                >
                  Scaricati
                  {downloads.items.size > 0 && <span className="badge">{downloads.items.size}</span>}
                </button>
              )}
            </nav>

            {playlists.items.length > 0 && (
              <nav className="nav-playlists">
                <span className="navlabel">Le tue playlist</span>
                {playlists.items.map((p) => (
                  <button
                    key={p.id}
                    className={`navitem ${view.name === 'playlist' && view.id === p.id ? 'is-current' : ''}`}
                    onClick={() => nav({ name: 'playlist', id: p.id })}
                    title={p.name}
                  >{p.name}</button>
                ))}
              </nav>
            )}

            <div className="sidebar-foot">
              <button
                className="refresh"
                onClick={() => void library.refresh()}
                disabled={library.scanning}
                title="Rilegge i file e aggiorna il catalogo"
              >
                <Icon name={library.scanning ? 'spinner' : 'refresh'} size={14} />
                {library.scanning ? 'Aggiorno…' : 'Aggiorna'}
              </button>
              {stats && (
                <p className="sidebar-stats">
                  {stats.tracks} brani · {stats.albums} album · {stats.artists} artisti
                </p>
              )}
              {library.error && <p className="sidebar-stats error">{library.error}</p>}
            </div>
          </aside>
        )}

        <div className="main">
          <main className="content">
          {stato.depth > 0 && (
            <button className="back" onClick={back} aria-label="Indietro" title="Indietro">
              <Icon name="back" size={20} />
            </button>
          )}
          {!downloads.online && (
            <p className="offline-banner" role="status">
              Sei offline: si vedono il catalogo salvato e i brani scaricati.
            </p>
          )}
          {view.name === 'albums' && <AlbumsView />}
          {view.name === 'album' && <AlbumDetailView id={view.id} />}
          {view.name === 'artists' && <ArtistsView />}
          {view.name === 'artist' && <ArtistDetailView id={view.id} />}
          {view.name === 'songs' && <SongsView />}
          {view.name === 'search' && <SearchView />}
          {view.name === 'downloads' && <DownloadsView />}
          {view.name === 'library' && <LibraryHubView />}
          {view.name === 'favorites' && <FavoritesView />}
          {view.name === 'listening' && <ListeningView />}
          {view.name === 'playlists' && <PlaylistsView />}
          {view.name === 'playlist' && <PlaylistDetailView id={view.id} />}
          </main>
        </div>

        {colonnaAperta && (
          <QueuePanel
            scheda={vista === 'testo' ? 'testo' : 'coda'}
            onScheda={setVista}
            onClose={() => setVista('chiusa')}
          />
        )}

        <PlayerBar
          vista={vista}
          onVista={setVista}
          onExpand={isMobile ? () => setVista('brano') : undefined}
        />

        {isMobile && vista !== 'chiusa' && (
          <NowPlaying faccia={vista} onFaccia={setVista} onClose={() => setVista('chiusa')} />
        )}
      </div>
    </NavContext.Provider>
  );
}
