/**
 * downloads.tsx — gestione dei brani scaricati per l'ascolto offline.
 *
 * Chi fa cosa:
 *   questa pagina  scarica il file e lo mette nella Cache API
 *   sw.js          lo ritira dalla cache e lo serve a <audio>, con Range
 *
 * La Cache API è raggiungibile sia dalla pagina sia dal service worker: è
 * la scatola condivisa tra i due. Scaricare da qui invece che dal worker ci
 * permette di mostrare una barra di avanzamento vera, leggendo il corpo
 * della risposta a pezzi mentre arriva.
 */
import {
  createContext, useCallback, useContext, useEffect, useMemo, useState,
} from 'react';
import type { ReactNode } from 'react';
import type { Track } from './api.ts';
import { streamUrl } from './api.ts';

const MEDIA_CACHE = 'media'; // deve combaciare con la costante in sw.js

/** Chiave in cache dei metadati: serve a ricostruire l'elenco offline. */
const metaKey = (id: number) => `/__offline__/track-${id}.json`;

export type Downloaded = { track: Track; size: number };

type DownloadsApi = {
  supported: boolean;
  ready: boolean;
  online: boolean;
  /** brani scaricati, per id */
  items: Map<number, Downloaded>;
  /** avanzamento 0→1 dei download in corso, per id */
  progress: Map<number, number>;
  usage: { used: number; quota: number; persisted: boolean } | null;
  download: (tracks: Track[]) => Promise<void>;
  remove: (ids: number[]) => Promise<void>;
  clear: () => Promise<void>;
};

const DownloadsContext = createContext<DownloadsApi | null>(null);

/** Legge dalla cache l'elenco dei brani salvati e la loro dimensione reale. */
async function readCache(): Promise<Map<number, Downloaded>> {
  const cache = await caches.open(MEDIA_CACHE);
  const keys = await cache.keys();
  const out = new Map<number, Downloaded>();

  for (const request of keys) {
    const { pathname } = new URL(request.url);
    const match = /^\/__offline__\/track-(\d+)\.json$/.exec(pathname);
    if (!match) continue;

    const id = Number(match[1]);
    const metaResponse = await cache.match(request);
    if (!metaResponse) continue;
    const track = (await metaResponse.json()) as Track;

    // La dimensione la chiediamo al blob dell'audio, non ai metadati:
    // se il download si è interrotto a metà, qui si vede.
    const audio = await cache.match(streamUrl(id));
    if (!audio) continue;
    const size = (await audio.blob()).size;

    out.set(id, { track, size });
  }
  return out;
}

export function DownloadsProvider({ children }: { children: ReactNode }) {
  const supported = typeof caches !== 'undefined' && 'serviceWorker' in navigator;

  const [items, setItems] = useState<Map<number, Downloaded>>(new Map());
  const [progress, setProgress] = useState<Map<number, number>>(new Map());
  const [ready, setReady] = useState(false);
  const [online, setOnline] = useState(navigator.onLine);
  const [usage, setUsage] = useState<DownloadsApi['usage']>(null);

  const refreshUsage = useCallback(async () => {
    if (!navigator.storage?.estimate) return;
    const { usage: used = 0, quota = 0 } = await navigator.storage.estimate();
    const persisted = navigator.storage.persisted ? await navigator.storage.persisted() : false;
    setUsage({ used, quota, persisted });
  }, []);

  const refresh = useCallback(async () => {
    if (!supported) { setReady(true); return; }
    setItems(await readCache());
    await refreshUsage();
    setReady(true);
  }, [supported, refreshUsage]);

  useEffect(() => { void refresh(); }, [refresh]);

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);

  const download = useCallback(async (tracks: Track[]) => {
    if (!supported) return;

    // Senza questa richiesta lo spazio è "best-effort": il browser può
    // buttare via i download quando il disco si riempie, senza avvisare.
    if (navigator.storage?.persist && !(await navigator.storage.persisted())) {
      await navigator.storage.persist();
    }

    const cache = await caches.open(MEDIA_CACHE);

    // Uno alla volta: scaricare un album intero in parallelo satura la
    // connessione e rende i progressi inutilizzabili.
    for (const track of tracks) {
      if (items.has(track.id)) continue;

      setProgress((p) => new Map(p).set(track.id, 0));
      try {
        const response = await fetch(streamUrl(track.id));
        if (!response.ok || !response.body) throw new Error(`HTTP ${response.status}`);

        const total = Number(response.headers.get('Content-Length') ?? track.size);
        const type = response.headers.get('Content-Type') ?? 'audio/mpeg';

        // Leggiamo il corpo a pezzi per poter aggiornare la barra: è l'unico
        // motivo per cui non usiamo direttamente cache.add(url).
        const reader = response.body.getReader();
        const chunks: BlobPart[] = [];
        let received = 0;
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          chunks.push(value as BlobPart);
          received += value.byteLength;
          if (total > 0) setProgress((p) => new Map(p).set(track.id, received / total));
        }

        const blob = new Blob(chunks, { type });
        await cache.put(streamUrl(track.id), new Response(blob, {
          headers: { 'Content-Type': type, 'Content-Length': String(blob.size) },
        }));
        await cache.put(metaKey(track.id), new Response(JSON.stringify(track), {
          headers: { 'Content-Type': 'application/json' },
        }));

        setItems((m) => new Map(m).set(track.id, { track, size: blob.size }));
      } catch (err) {
        // Un download fallito non deve bloccare il resto dell'album: si
        // ripulisce quel che è rimasto a metà e si va avanti.
        await cache.delete(streamUrl(track.id));
        await cache.delete(metaKey(track.id));
        console.warn(`Download fallito: ${track.title}`, err);
      } finally {
        setProgress((p) => {
          const next = new Map(p);
          next.delete(track.id);
          return next;
        });
      }
    }
    await refreshUsage();
  }, [supported, items, refreshUsage]);

  const remove = useCallback(async (ids: number[]) => {
    const cache = await caches.open(MEDIA_CACHE);
    for (const id of ids) {
      await cache.delete(streamUrl(id));
      await cache.delete(metaKey(id));
    }
    setItems((m) => {
      const next = new Map(m);
      for (const id of ids) next.delete(id);
      return next;
    });
    await refreshUsage();
  }, [refreshUsage]);

  const clear = useCallback(async () => {
    await caches.delete(MEDIA_CACHE);
    setItems(new Map());
    await refreshUsage();
  }, [refreshUsage]);

  const value = useMemo<DownloadsApi>(
    () => ({ supported, ready, online, items, progress, usage, download, remove, clear }),
    [supported, ready, online, items, progress, usage, download, remove, clear],
  );

  return <DownloadsContext.Provider value={value}>{children}</DownloadsContext.Provider>;
}

export function useDownloads(): DownloadsApi {
  const ctx = useContext(DownloadsContext);
  if (!ctx) throw new Error('useDownloads va usato dentro <DownloadsProvider>');
  return ctx;
}

/** 1_536_000 → "1,5 MB" */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['kB', 'MB', 'GB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) { value /= 1024; unit++; }
  return `${value.toFixed(value < 10 ? 1 : 0).replace('.', ',')} ${units[unit]}`;
}
