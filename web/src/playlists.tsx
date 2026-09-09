/**
 * playlists.tsx — l'elenco delle playlist, condiviso da barra laterale,
 * schermate e menù di aggiunta.
 *
 * Sta in un context e non in ogni vista perché la stessa lista compare in tre
 * posti che devono restare allineati: crei una playlist dal menù di un brano
 * e deve comparire subito nella barra laterale.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { api, send } from './api.ts';
import type { PlaylistSummary } from './api.ts';

type PlaylistsApi = {
  items: PlaylistSummary[];
  loading: boolean;
  error: string | null;
  /** cambia a ogni modifica: le viste di dettaglio la usano per ricaricarsi */
  revision: number;
  refresh: () => Promise<void>;
  create: (name: string) => Promise<PlaylistSummary | null>;
  rename: (id: number, name: string) => Promise<void>;
  remove: (id: number) => Promise<void>;
  addTracks: (id: number, trackIds: number[]) => Promise<number>;
  removeAt: (id: number, position: number) => Promise<void>;
  setCover: (id: number, file: File) => Promise<void>;
  clearCover: (id: number) => Promise<void>;
  move: (id: number, from: number, to: number) => Promise<void>;
};

const PlaylistsContext = createContext<PlaylistsApi | null>(null);

export function PlaylistsProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<PlaylistSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);

  const refresh = useCallback(async () => {
    try {
      setItems(await api.playlists());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Errore');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  /** Ogni modifica ricarica l'elenco e fa avanzare la revisione. */
  const dopoModifica = useCallback(async () => {
    await refresh();
    setRevision((n) => n + 1);
  }, [refresh]);

  const value = useMemo<PlaylistsApi>(() => ({
    items, loading, error, revision, refresh,

    create: async (name) => {
      try {
        const creata = await send<PlaylistSummary>('/api/playlists', 'POST', { name });
        await dopoModifica();
        return creata;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Errore');
        return null;
      }
    },
    rename: async (id, name) => {
      await send(`/api/playlists/${id}`, 'PATCH', { name });
      await dopoModifica();
    },
    remove: async (id) => {
      await send(`/api/playlists/${id}`, 'DELETE');
      await dopoModifica();
    },
    addTracks: async (id, trackIds) => {
      const esito = await send<{ added: number }>(`/api/playlists/${id}/tracks`, 'POST', { trackIds });
      await dopoModifica();
      return esito.added;
    },
    removeAt: async (id, position) => {
      await send(`/api/playlists/${id}/tracks/${position}`, 'DELETE');
      await dopoModifica();
    },
    setCover: async (id, file) => {
      // Il file va nel corpo così com'è: niente multipart, non c'è altro da mandare.
      const res = await fetch(`/api/playlists/${id}/cover`, { method: 'POST', body: file });
      if (!res.ok) {
        const dettaglio = await res.json().catch(() => null) as { error?: string } | null;
        throw new Error(dettaglio?.error ?? `HTTP ${res.status}`);
      }
      await dopoModifica();
    },
    clearCover: async (id) => {
      await send(`/api/playlists/${id}/cover`, 'DELETE');
      await dopoModifica();
    },
    move: async (id, from, to) => {
      await send(`/api/playlists/${id}/tracks`, 'PATCH', { from, to });
      await dopoModifica();
    },
  }), [items, loading, error, revision, refresh, dopoModifica]);

  return <PlaylistsContext.Provider value={value}>{children}</PlaylistsContext.Provider>;
}

export function usePlaylists(): PlaylistsApi {
  const ctx = useContext(PlaylistsContext);
  if (!ctx) throw new Error('usePlaylists va usato dentro <PlaylistsProvider>');
  return ctx;
}
