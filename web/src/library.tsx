/**
 * library.tsx — sapere quando il catalogo è cambiato.
 *
 * Il server ripassa la libreria da solo ogni pochi minuti, ma l'interfaccia
 * non se ne accorgerebbe: i dati sono già stati caricati. Qui teniamo un
 * numero di revisione che le viste usano come dipendenza: quando cambia,
 * ricaricano.
 *
 * La revisione avanza in due casi:
 *   1. l'utente preme "Aggiorna" e lo scan trova qualcosa
 *   2. il conteggio dei brani cambia da solo → l'ha fatto lo scan periodico
 */
import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
} from 'react';
import type { ReactNode } from 'react';
import { api } from './api.ts';

export type ScanResult = {
  added: number; updated: number; skipped: number;
  removed: number; total: number; ms: number;
};

type LibraryApi = {
  /** cambia quando il catalogo è cambiato: mettilo tra le dipendenze */
  revision: number;
  scanning: boolean;
  lastScan: ScanResult | null;
  error: string | null;
  refresh: () => Promise<void>;
};

const LibraryContext = createContext<LibraryApi | null>(null);

/** Ogni quanto controllare se il server ha trovato roba nuova per conto suo. */
const POLL_MS = 60_000;

export function LibraryProvider({ children }: { children: ReactNode }) {
  const [revision, setRevision] = useState(0);
  const [scanning, setScanning] = useState(false);
  const [lastScan, setLastScan] = useState<ScanResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const knownTracks = useRef<number | null>(null);

  const refresh = useCallback(async () => {
    setScanning(true);
    setError(null);
    try {
      const res = await fetch('/api/scan', { method: 'POST' });
      if (!res.ok) throw new Error((await res.json()).error ?? `HTTP ${res.status}`);
      const result = (await res.json()) as ScanResult;
      setLastScan(result);
      knownTracks.current = result.total;
      // Solo se qualcosa è cambiato: altrimenti ricaricheremmo per niente.
      if (result.added + result.updated + result.removed > 0) setRevision((n) => n + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Scan fallito');
    } finally {
      setScanning(false);
    }
  }, []);

  // Sorveglianza leggera: se il numero di brani cambia senza che l'abbiamo
  // chiesto noi, vuol dire che lo scan periodico del server ha lavorato.
  useEffect(() => {
    const check = async () => {
      try {
        const stats = await api.stats();
        if (knownTracks.current === null) knownTracks.current = stats.tracks;
        else if (stats.tracks !== knownTracks.current) {
          knownTracks.current = stats.tracks;
          setRevision((n) => n + 1);
        }
      } catch { /* server irraggiungibile: riproveremo */ }
    };
    void check();
    const timer = setInterval(check, POLL_MS);
    return () => clearInterval(timer);
  }, []);

  const value = useMemo(
    () => ({ revision, scanning, lastScan, error, refresh }),
    [revision, scanning, lastScan, error, refresh],
  );
  return <LibraryContext.Provider value={value}>{children}</LibraryContext.Provider>;
}

export function useLibrary(): LibraryApi {
  const ctx = useContext(LibraryContext);
  if (!ctx) throw new Error('useLibrary va usato dentro <LibraryProvider>');
  return ctx;
}
