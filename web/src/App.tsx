import { useEffect, useState } from 'react';
import { api } from './api.ts';
import { NavContext } from './nav.tsx';
import type { View } from './nav.tsx';
import { useAsync } from './useAsync.ts';
import { PlayerBar } from './components/PlayerBar.tsx';
import { QueuePanel } from './components/QueuePanel.tsx';
import { usePlayer } from './player.tsx';
import {
  AlbumsView, AlbumDetailView, ArtistsView, ArtistDetailView, SongsView, SearchView,
  DownloadsView,
} from './views.tsx';
import { useDownloads } from './downloads.tsx';
import { useLibrary } from './library.tsx';
import { Icon } from './components/Icon.tsx';

export function App() {
  const [view, setView] = useState<View>({ name: 'albums' });
  const [queueOpen, setQueueOpen] = useState(false);
  const library = useLibrary();
  const { data: stats } = useAsync(() => api.stats(), [library.revision]);
  const player = usePlayer();
  const downloads = useDownloads();

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

  const nav = (next: View) => setView(next);

  const item = (name: View['name'], label: string, target: View) => (
    <button
      className={`navitem ${view.name === name ? 'is-current' : ''}`}
      onClick={() => nav(target)}
    >{label}</button>
  );

  return (
    <NavContext.Provider value={nav}>
      <div className={`app${queueOpen ? ' with-queue' : ''}`}>
        <aside className="sidebar">
          <div className="brand">mario<span>music</span></div>

          <nav>
            {item('search', 'Cerca', { name: 'search' })}
            <span className="navlabel">Libreria</span>
            {item('albums', 'Album', { name: 'albums' })}
            {item('artists', 'Artisti', { name: 'artists' })}
            {item('songs', 'Brani', { name: 'songs' })}
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

        <div className="main">
          <main className="content">
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
          </main>
        </div>

        {queueOpen && <QueuePanel onClose={() => setQueueOpen(false)} />}

        <PlayerBar queueOpen={queueOpen} onToggleQueue={() => setQueueOpen((v) => !v)} />
      </div>
    </NavContext.Provider>
  );
}
