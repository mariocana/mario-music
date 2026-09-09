import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.tsx';
import { PlayerProvider } from './player.tsx';
import { DownloadsProvider } from './downloads.tsx';
import { LibraryProvider } from './library.tsx';
import { PlaylistsProvider } from './playlists.tsx';
import './styles.css';

/**
 * Alla prima visita il service worker prende il comando solo DOPO che la
 * pagina ha già chiesto catalogo e copertine: quelle risposte non passano da
 * lui e non finiscono in cache. Le richiediamo una seconda volta, in
 * sottofondo, quando ormai è lui a rispondere. Costa poco (il server le ha
 * appena servite, sono ancora nella cache HTTP) e rende la libreria
 * sfogliabile offline già dalla prima visita.
 */
async function warmCache() {
  await Promise.all(
    ['/api/stats', '/api/albums', '/api/artists', '/api/tracks']
      .map((path) => fetch(path).catch(() => undefined)),
  );

  // Le copertine una alla volta: sono tante e non c'è fretta.
  try {
    const albums = (await (await fetch('/api/albums')).json()) as Array<{ id: number }>;
    for (const album of albums) {
      await fetch(`/api/albums/${album.id}/cover`).catch(() => undefined);
    }
  } catch {
    /* senza rete non c'è niente da scaldare */
  }
}

if ('serviceWorker' in navigator) {
  // Dopo 'load', per non rubare banda al primo rendering.
  window.addEventListener('load', async () => {
    try {
      await navigator.serviceWorker.register('/sw.js');
      // `controller` è null finché il worker non ha preso in carico questa
      // scheda: prima di allora le nostre fetch gli passerebbero accanto.
      if (!navigator.serviceWorker.controller) {
        await new Promise((resolve) => {
          navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true });
        });
      }
      await warmCache();
    } catch (err) {
      console.warn('Service worker non registrato: niente ascolto offline.', err);
    }
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <LibraryProvider>
      <PlaylistsProvider>
        <DownloadsProvider>
          <PlayerProvider>
            <App />
          </PlayerProvider>
        </DownloadsProvider>
      </PlaylistsProvider>
    </LibraryProvider>
  </StrictMode>,
);
