import { useEffect, useState } from 'react';
import { getServerUrlSync } from './config';
import type {
  Album,
  AlbumDetail,
  Artist,
  ArtistDetail,
  Home,
  Lyrics,
  PlaylistDetail,
  PlaylistSummary,
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

async function get<T>(path: string, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<T> {
  const base = getServerUrlSync();
  const url = `${base}${path.startsWith('/') ? path : `/${path}`}`;
  const res = await fetchWithTimeout(url, undefined, timeoutMs);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} su ${path}`);
  }
  return res.json() as Promise<T>;
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
  home: () => get<Home>('/api/home'),
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
};

export const coverUrl = (albumId: number, coverKey?: string | null): string => {
  const base = getServerUrlSync();
  return `${base}/api/albums/${albumId}/cover${coverKey ? `?v=${coverKey}` : ''}`;
};

export const playlistCoverUrl = (playlistId: number, coverKey?: string | null): string => {
  const base = getServerUrlSync();
  return `${base}/api/playlists/${playlistId}/cover${coverKey ? `?v=${coverKey}` : ''}`;
};

export const streamUrl = (trackId: number): string => {
  const base = getServerUrlSync();
  return `${base}/api/tracks/${trackId}/stream`;
};
