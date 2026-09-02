import { useEffect, useState } from 'react';
import { api } from './api.ts';
import { NavContext } from './nav.tsx';
import type { View } from './nav.tsx';
import { useAsync } from './useAsync.ts';
import { PlayerBar } from './components/PlayerBar.tsx';
import { usePlayer } from './player.tsx';
import {
  AlbumsView, AlbumDetailView, ArtistsView, ArtistDetailView, SongsView, SearchView,
  DownloadsView,
} from './views.tsx';
import { useDownloads } from './downloads.tsx';

export function App() {
  const [view, setView] = useState<View>({ name: 'albums' });
  const [query, setQuery] = useState('');
  const { data: stats } = useAsync(() => api.stats(), []);
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

  const nav = (next: View) => {
    if (next.name !== 'search') setQuery('');
    setView(next);
  };

  const item = (name: View['name'], label: string, target: View) => (
    <button
      className={`navitem ${view.name === name ? 'is-current' : ''}`}
      onClick={() => nav(target)}
    >{label}</button>
  );

  return (
    <NavContext.Provider value={nav}>
      <div className="app">
        <aside className="sidebar">
          <div className="brand">mario<span>music</span></div>

          <input
            className="search"
            type="search"
            placeholder="Cerca"
            value={query}
            onChange={(e) => {
              const q = e.target.value;
              setQuery(q);
              setView(q.trim() ? { name: 'search', q } : { name: 'albums' });
            }}
          />

          <nav>
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

          {stats && (
            <p className="sidebar-stats">
              {stats.tracks} brani · {stats.albums} album<br />{stats.artists} artisti
            </p>
          )}
        </aside>

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
          {view.name === 'search' && <SearchView q={view.q} />}
          {view.name === 'downloads' && <DownloadsView />}
        </main>

        <PlayerBar />
      </div>
    </NavContext.Provider>
  );
}
