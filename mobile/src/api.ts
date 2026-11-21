import { useEffect, useState } from 'react';
import * as FileSystem from 'expo-file-system/legacy';
import { leggiCatalogo, scriviCatalogo } from './catalogo';
import { daMettereInCache } from './catalogoChiavi';
import { getServerUrlSync } from './config';
import type { ScanResult } from './scan';
import type {
  Album,
  AlbumDetail,
  Artist,
  ArtistDetail,
  Home,
  Lyrics,
  PlaylistDetail,
  PlaylistSummary,
  Replay,
  Stats,
  Track,
} from './types';

export const DEFAULT_TIMEOUT_MS = 4000;

export class TimeoutError extends Error {
  constructor(message = 'Timeout di connessione verso il server') {
    super(message);
    this.name = 'TimeoutError';
  }
}

// Stato di connettività del server condiviso
let isServerOnline = true;
const onlineListeners = new Set<(online: boolean) => void>();

export function setServerOnline(online: boolean) {
  if (isServerOnline !== online) {
    isServerOnline = online;
    onlineListeners.forEach((cb) => cb(online));
  }
}

export function isServerOnlineSync(): boolean {
  return isServerOnline;
}

export function subscribeServerOnline(cb: (online: boolean) => void): () => void {
  onlineListeners.add(cb);
  return () => onlineListeners.delete(cb);
}

export function useServerOnline(): boolean {
  const [online, setOnline] = useState<boolean>(isServerOnline);
  useEffect(() => {
    return subscribeServerOnline(setOnline);
  }, []);
  return online;
}

export async function fetchWithTimeout(
  url: string,
  init?: RequestInit,
  timeoutMs = DEFAULT_TIMEOUT_MS
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  try {
    const res = await fetch(url, {
      ...init,
      signal: controller.signal,
    });
    // Il server ha risposto (anche se con codice HTTP 4xx o 5xx, la macchina è raggiungibile)
    setServerOnline(true);
    return res;
  } catch (err: unknown) {
    const isAbort = (err as { name?: string })?.name === 'AbortError';
    // Fallimento di rete o timeout: server non raggiungibile
    setServerOnline(false);
    if (isAbort) {
      throw new TimeoutError(`Timeout (${Math.round(timeoutMs / 1000)}s): impossibile raggiungere il server`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/** Ultima volta che, da offline, si è provato a vedere se il server è tornato. */
let ultimoTentativo = 0;
const INTERVALLO_TENTATIVI_MS = 10_000;

/**
 * Da offline si risponde dalla cache senza toccare la rete: è proprio questo
 * che prima riportava l'app "online" al primo successo. Allora lo si
 * controlla a parte, in sottofondo e non più spesso di ogni dieci secondi.
 */
function riprovaConnessione() {
  const ora = Date.now();
  if (ora - ultimoTentativo < INTERVALLO_TENTATIVI_MS) return;
  ultimoTentativo = ora;
  void checkServerReachable();
}

/**
 * GET verso il server, con il catalogo offline (vedi catalogo.ts):
 * - online: si chiede al server e si salva la risposta;
 * - il server non risponde: si restituisce l'ultima risposta salvata;
 * - già offline: si restituisce subito quella salvata, senza aspettare il
 *   timeout a ogni schermata.
 * Gli errori HTTP (404, 500…) non si nascondono: il server ha risposto.
 */
async function get<T>(path: string, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<T> {
  const base = getServerUrlSync();
  const rel = path.startsWith('/') ? path : `/${path}`;
  const url = `${base}${rel}`;
  const salvabile = daMettereInCache(rel);

  if (salvabile && !isServerOnline) {
    const salvato = await leggiCatalogo<T>(base, rel);
    if (salvato !== null) {
      riprovaConnessione();
      return salvato;
    }
  }

  let res: Response;
  try {
    res = await fetchWithTimeout(url, undefined, timeoutMs);
  } catch (err) {
    if (salvabile) {
      const salvato = await leggiCatalogo<T>(base, rel);
      if (salvato !== null) return salvato;
    }
    throw err;
  }
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} su ${path}`);
  }
  const dati = (await res.json()) as T;
  if (salvabile) void scriviCatalogo(base, rel, dati);
  return dati;
}

async function send<T>(
  path: string,
  method: 'POST' | 'PATCH' | 'DELETE',
  body?: unknown,
  timeoutMs = DEFAULT_TIMEOUT_MS
): Promise<T> {
  const base = getServerUrlSync();
  const url = `${base}${path.startsWith('/') ? path : `/${path}`}`;
  const res = await fetchWithTimeout(
    url,
    {
      method,
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    },
    timeoutMs
  );
  if (!res.ok) {
    const dettaglio = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(dettaglio?.error ?? `HTTP ${res.status} su ${path}`);
  }
  return res.json() as Promise<T>;
}

export async function checkServerReachable(timeoutMs = 2500): Promise<boolean> {
  try {
    const base = getServerUrlSync();
    const res = await fetchWithTimeout(`${base}/api/stats`, undefined, timeoutMs);
    const ok = res.ok;
    setServerOnline(ok);
    return ok;
  } catch {
    setServerOnline(false);
    return false;
  }
}

export const api = {
  stats: () => get<Stats>('/api/stats'),
  /**
   * Fa rileggere al server la cartella della musica. Senza novità dura un
   * secondo; con album nuovi molto di più (ogni file va letto e misurato), da
   * cui il timeout lungo.
   */
  scan: () => send<ScanResult>('/api/scan', 'POST', undefined, 10 * 60 * 1000),
  home: () => get<Home>('/api/home'),
  replay: (giorni?: number | null) => get<Replay>(`/api/replay${giorni ? `?days=${giorni}` : ''}`),
  albums: () => get<Album[]>('/api/albums'),
  album: (id: number) => get<AlbumDetail>(`/api/albums/${id}`),
  artists: () => get<Artist[]>('/api/artists'),
  artist: (id: number) => get<ArtistDetail>(`/api/artists/${id}`),
  artistTracks: (id: number) => get<Track[]>(`/api/artists/${id}/tracks`),
  tracks: () => get<Track[]>('/api/tracks'),
  search: (q: string) => get<Track[]>(`/api/search?q=${encodeURIComponent(q)}`),
  lyrics: (trackId: number) => get<Lyrics>(`/api/tracks/${trackId}/lyrics`),
  favorites: () => get<Track[]>('/api/favorites'),
  recent: () => get<Track[]>('/api/recent'),
  top: (days?: number) => get<Track[]>(`/api/top${days ? `?days=${days}` : ''}`),
  playlists: () => get<PlaylistSummary[]>('/api/playlists'),
  playlist: (id: number) => get<PlaylistDetail>(`/api/playlists/${id}`),
  createPlaylist: (name: string) => send<PlaylistSummary>('/api/playlists', 'POST', { name }),
  renamePlaylist: (id: number, name: string) =>
    send<{ id: number; name: string }>(`/api/playlists/${id}`, 'PATCH', { name }),
  /** Toglie l'immagine scelta: la playlist torna al mosaico degli album. */
  removePlaylistCover: (id: number) => send<{ ok: true }>(`/api/playlists/${id}/cover`, 'DELETE'),
  deletePlaylist: (id: number) => send<void>(`/api/playlists/${id}`, 'DELETE'),
  addTracksToPlaylist: (playlistId: number, trackIds: number[]) =>
    send<{ added: number }>(`/api/playlists/${playlistId}/tracks`, 'POST', { trackIds }),
  removeTrackFromPlaylist: (playlistId: number, position: number) =>
    send<void>(`/api/playlists/${playlistId}/tracks/${position}`, 'DELETE'),
  moveTrackInPlaylist: (playlistId: number, from: number, to: number) =>
    send<void>(`/api/playlists/${playlistId}/tracks`, 'PATCH', { from, to }),

  toggleFavorite: (trackId: number, favorite: boolean) =>
    send<{ id: number; favorite: boolean }>(`/api/tracks/${trackId}/favorite`, 'POST', { favorite }),

  recordPlay: (trackId: number) =>
    send<{ id: number; playCount: number }>(`/api/tracks/${trackId}/play`, 'POST'),
  /** fa convertire in anticipo un brano: risponde subito, la conversione va in sottofondo */
  prepare: (trackId: number) => send<{ pronto: boolean }>(`/api/tracks/${trackId}/prepare`, 'POST'),
};

export const coverUrl = (albumId: number, coverKey?: string | null): string => {
  const base = getServerUrlSync();
  return `${base}/api/albums/${albumId}/cover${coverKey ? `?v=${coverKey}` : ''}`;
};

export const playlistCoverUrl = (playlistId: number, coverKey?: string | null): string => {
  const base = getServerUrlSync();
  return `${base}/api/playlists/${playlistId}/cover${coverKey ? `?v=${coverKey}` : ''}`;
};

/** `query` sceglie la versione: vuota per l'originale, vedi queryStream() in sorgente.ts. */
export const streamUrl = (trackId: number, query = ''): string => {
  const base = getServerUrlSync();
  return `${base}/api/tracks/${trackId}/stream${query}`;
};

/**
 * Manda al server l'immagine scelta come copertina di una playlist.
 *
 * Il server vuole i byte nudi nel corpo della richiesta (niente multipart) e
 * li converte lui in un JPEG quadrato 640×640; risponde con la nuova
 * impronta, che va nell'URL (vedi playlistCoverUrl).
 *
 * uploadAsync non fallisce da solo su un 4xx/5xx: lo stato si controlla qui,
 * e il motivo che il server scrive in `error` diventa il messaggio.
 */
export async function uploadPlaylistCover(id: number, fileUri: string, mimeType?: string | null): Promise<string> {
  const url = `${getServerUrlSync()}/api/playlists/${id}/cover`;
  const res = await FileSystem.uploadAsync(url, fileUri, {
    httpMethod: 'POST',
    uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
    // In primo piano: si aspetta la risposta con il riquadro aperto, non serve
    // che sopravviva all'app chiusa (e la sessione in background è più lenta a partire).
    sessionType: FileSystem.FileSystemSessionType.FOREGROUND,
    headers: { 'Content-Type': mimeType || 'application/octet-stream' },
  });
  let corpo: { coverKey?: string; error?: string } | null = null;
  try {
    corpo = JSON.parse(res.body) as { coverKey?: string; error?: string };
  } catch {
    corpo = null;
  }
  if (res.status < 200 || res.status >= 300 || !corpo?.coverKey) {
    throw new Error(corpo?.error ?? `${res.status} sul caricamento della copertina`);
  }
  return corpo.coverKey;
}
