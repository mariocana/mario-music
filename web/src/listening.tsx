/**
 * listening.tsx — i preferiti, condivisi da menù, righe e schermata dedicata.
 *
 * Tenuti in un Set di id invece che rileggendo le tracce: il cuore compare
 * sulla stessa canzone in cinque punti diversi (album, brani, ricerca,
 * playlist, coda) e devono accendersi e spegnersi tutti insieme.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { api, send } from './api.ts';
import type { Track } from './api.ts';

type ListeningApi = {
  preferiti: Set<number>;
  /** cambia a ogni modifica: le viste la usano come dipendenza */
  revision: number;
  isFavorite: (trackId: number) => boolean;
  toggleFavorite: (track: Track) => Promise<void>;
};

const ListeningContext = createContext<ListeningApi | null>(null);

export function ListeningProvider({ children }: { children: ReactNode }) {
  const [preferiti, setPreferiti] = useState<Set<number>>(new Set());
  const [revision, setRevision] = useState(0);

  const carica = useCallback(async () => {
    try {
      const elenco = await api.favorites();
      setPreferiti(new Set(elenco.map((t) => t.id)));
    } catch {
      /* server irraggiungibile: si riproverà al prossimo caricamento */
    }
  }, []);

  useEffect(() => { void carica(); }, [carica]);

  const toggleFavorite = useCallback(async (track: Track) => {
    const era = preferiti.has(track.id);

    // Si aggiorna subito, prima della risposta: un cuore che ci mette mezzo
    // secondo a colorarsi sembra rotto. In caso di errore si torna indietro.
    setPreferiti((p) => {
      const nuovo = new Set(p);
      if (era) nuovo.delete(track.id); else nuovo.add(track.id);
      return nuovo;
    });

    try {
      await send(`/api/tracks/${track.id}/favorite`, 'POST', { favorite: !era });
      setRevision((n) => n + 1);
    } catch {
      setPreferiti((p) => {
        const nuovo = new Set(p);
        if (era) nuovo.add(track.id); else nuovo.delete(track.id);
        return nuovo;
      });
    }
  }, [preferiti]);

  const value = useMemo<ListeningApi>(() => ({
    preferiti,
    revision,
    isFavorite: (id) => preferiti.has(id),
    toggleFavorite,
  }), [preferiti, revision, toggleFavorite]);

  return <ListeningContext.Provider value={value}>{children}</ListeningContext.Provider>;
}

export function useListening(): ListeningApi {
  const ctx = useContext(ListeningContext);
  if (!ctx) throw new Error('useListening va usato dentro <ListeningProvider>');
  return ctx;
}
