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

async function get<T>(path: string): Promise<T> {
  const base = getServerUrlSync();
  const url = `${base}${path.startsWith('/') ? path : `/${path}`}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} su ${path}`);
  }
  return res.json() as Promise<T>;
}

async function send<T>(path: string, method: 'POST' | 'PATCH' | 'DELETE', body?: unknown): Promise<T> {
  const base = getServerUrlSync();
  const url = `${base}${path.startsWith('/') ? path : `/${path}`}`;
  const res = await fetch(url, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) {
    const dettaglio = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(dettaglio?.error ?? `HTTP ${res.status} su ${path}`);
  }
  return res.json() as Promise<T>;
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
