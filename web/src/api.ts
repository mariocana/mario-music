/** Tipi e chiamate verso il server. Rispecchiano 1:1 le query in server/index.ts. */

export type Album = {
  id: number;
  title: string;
  year: number | null;
  genre: string | null;
  artistId: number;
  artist: string;
  coverKey: string | null;
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
  coverKey: string | null;
  artistId: number;
  artist: string;
  /** 0 o 1: SQLite non ha il tipo booleano */
  favorite: number;
  playCount: number;
};

export type AlbumDetail = Omit<Album, 'trackCount' | 'duration'> & { tracks: Track[] };
export type Artist = { id: number; name: string; albumCount: number; trackCount: number };
export type ArtistDetail = {
  id: number;
  name: string;
  albums: Album[];
  /** i più ascoltati, al massimo cinque; vuoto se l'artista non è mai partito */
  topTracks: Track[];
  /** l'album che fa da immagine alla testata: non abbiamo foto degli artisti */
  cover: { albumId: number; coverKey: string } | null;
};
export type PlaylistSummary = {
  id: number;
  name: string;
  trackCount: number;
  duration: number;
  /** copertina scelta dall'utente; se manca si ripiega sul mosaico */
  coverKey: string | null;
  covers: Array<{ albumId: number; coverKey: string | null }>;
};

export type PlaylistDetail = {
  id: number;
  name: string;
  coverKey: string | null;
  /** ogni traccia porta la sua posizione: serve per riordino e rimozione */
  tracks: Array<Track & { position: number }>;
};

export type LyricLine = { t: number; text: string };
export type Lyrics = {
  source: 'lrclib' | 'tag' | 'none';
  synced: LyricLine[] | null;
  plain: string | null;
};

/** "Per te": ogni sezione può essere vuota, e allora non si disegna. */
export type Home = {
  /** l'ultimo brano ascoltato, per il riquadro "Riprendi" */
  ripresa: Track | null;
  recenti: Album[];
  aggiunti: Album[];
  riscopri: Album[];
  mai: Album[];
  top: Track[];
};

export type Stats = { artists: number; albums: number; tracks: number; duration: number };

async function get<T>(path: string): Promise<T> {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`${res.status} su ${path}`);
  return res.json() as Promise<T>;
}

export const api = {
  stats: () => get<Stats>('/api/stats'),
  home: () => get<Home>('/api/home'),
  albums: () => get<Album[]>('/api/albums'),
  album: (id: number) => get<AlbumDetail>(`/api/albums/${id}`),
  artists: () => get<Artist[]>('/api/artists'),
  artist: (id: number) => get<ArtistDetail>(`/api/artists/${id}`),
  /** a parte: serve solo al tasto Riproduci/Casuale, non a disegnare la pagina */
  artistTracks: (id: number) => get<Track[]>(`/api/artists/${id}/tracks`),
  tracks: () => get<Track[]>('/api/tracks'),
  search: (q: string) => get<Track[]>(`/api/search?q=${encodeURIComponent(q)}`),
  lyrics: (trackId: number) => get<Lyrics>(`/api/tracks/${trackId}/lyrics`),

  favorites: () => get<Track[]>('/api/favorites'),
  recent: () => get<Track[]>('/api/recent'),
  top: (days?: number) => get<Track[]>(`/api/top${days ? `?days=${days}` : ''}`),

  playlists: () => get<PlaylistSummary[]>('/api/playlists'),
  playlist: (id: number) => get<PlaylistDetail>(`/api/playlists/${id}`),
};

/**
 * L'impronta del contenuto va nell'URL, non solo negli header.
 *
 * Senza, l'indirizzo resta `/api/albums/33/cover` anche quando la copertina
 * cambia: browser e service worker continuano a mostrare la vecchia finché
 * non scade la cache. Con ?v=<impronta>, una copertina diversa è un URL
 * diverso — e quello vecchio può restare in cache per sempre senza danni.
 */
/** Richiesta che modifica qualcosa: manda JSON e riporta l'errore del server. */
export async function send<T>(path: string, method: 'POST' | 'PATCH' | 'DELETE', body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) {
    // Il server spiega sempre il perché in `error`: meglio quello di "HTTP 400".
    const dettaglio = await res.json().catch(() => null) as { error?: string } | null;
    throw new Error(dettaglio?.error ?? `${res.status} su ${path}`);
  }
  return res.json() as Promise<T>;
}

export const coverUrl = (albumId: number, coverKey?: string | null) =>
  `/api/albums/${albumId}/cover${coverKey ? `?v=${coverKey}` : ''}`;

/** Stessa regola delle copertine degli album: l'impronta sta nell'URL. */
export const playlistCoverUrl = (playlistId: number, coverKey: string) =>
  `/api/playlists/${playlistId}/cover?v=${coverKey}`;
export const streamUrl = (trackId: number) => `/api/tracks/${trackId}/stream`;

/**
 * Lo stesso brano, ma chiesto alla copia scaricata. Il service worker
 * interviene SOLO su questo URL; senza `?offline` l'audio non lo attraversa
 * nemmeno, e il browser lo carica da solo come farebbe con qualunque <audio>.
 * Al server la query non interessa: se il worker non c'è, risponde lui.
 */
export const offlineUrl = (trackId: number) => `${streamUrl(trackId)}?offline`;

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
