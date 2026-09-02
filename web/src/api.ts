/** Tipi e chiamate verso il server. Rispecchiano 1:1 le query in server/index.ts. */

export type Album = {
  id: number;
  title: string;
  year: number | null;
  genre: string | null;
  artistId: number;
  artist: string;
  trackCount: number;
  duration: number;
  hasCover: boolean;
};

export type Track = {
  id: number;
  title: string;
  trackNo: number | null;
  discNo: number | null;
  duration: number;
  codec: string | null;
  bitrate: number | null;
  sampleRate: number | null;
  channels: number | null;
  size: number;
  albumId: number;
  album: string;
  artistId: number;
  artist: string;
};

export type AlbumDetail = Omit<Album, 'trackCount' | 'duration'> & { tracks: Track[] };
export type Artist = { id: number; name: string; albumCount: number; trackCount: number };
export type ArtistDetail = { id: number; name: string; albums: Album[] };
export type Stats = { artists: number; albums: number; tracks: number; duration: number };

async function get<T>(path: string): Promise<T> {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`${res.status} su ${path}`);
  return res.json() as Promise<T>;
}

export const api = {
  stats: () => get<Stats>('/api/stats'),
  albums: () => get<Album[]>('/api/albums'),
  album: (id: number) => get<AlbumDetail>(`/api/albums/${id}`),
  artists: () => get<Artist[]>('/api/artists'),
  artist: (id: number) => get<ArtistDetail>(`/api/artists/${id}`),
  tracks: () => get<Track[]>('/api/tracks'),
  search: (q: string) => get<Track[]>(`/api/search?q=${encodeURIComponent(q)}`),
};

export const coverUrl = (albumId: number) => `/api/albums/${albumId}/cover`;
export const streamUrl = (trackId: number) => `/api/tracks/${trackId}/stream`;

/** 214 → "3:34" ; 5400 → "1:30:00" */
export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '--:--';
  const s = Math.floor(seconds % 60);
  const m = Math.floor(seconds / 60) % 60;
  const h = Math.floor(seconds / 3600);
  const mm = h > 0 ? String(m).padStart(2, '0') : String(m);
  return `${h > 0 ? `${h}:` : ''}${mm}:${String(s).padStart(2, '0')}`;
}

/** Durata complessiva in forma discorsiva: "1 ora e 12 minuti". */
export function formatLength(seconds: number): string {
  const total = Math.round(seconds / 60);
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m} ${m === 1 ? 'minuto' : 'minuti'}`;
  return `${h} ${h === 1 ? 'ora' : 'ore'} e ${m} ${m === 1 ? 'minuto' : 'minuti'}`;
}
