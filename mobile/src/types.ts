/**
 * Tipi di dominio condivisi con l'API del server Mario Music.
 */

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
  /** quanto suona forte, in LUFS: serve per livellare il volume */
  loudness: number | null;
  /** picco reale in dBFS */
  peak: number | null;
  /** 0 o 1 (booleano SQLite) */
  favorite: number;
  playCount: number;
};

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

export type AlbumDetail = Omit<Album, 'trackCount' | 'duration'> & { tracks: Track[] };

export type Artist = {
  id: number;
  name: string;
  albumCount: number;
  trackCount: number;
};

export type ArtistDetail = {
  id: number;
  name: string;
  albums: Album[];
  topTracks: Track[];
  cover: { albumId: number; coverKey: string } | null;
};

export type PlaylistSummary = {
  id: number;
  name: string;
  trackCount: number;
  duration: number;
  coverKey: string | null;
  covers: Array<{ albumId: number; coverKey: string | null }>;
};

export type PlaylistDetail = {
  id: number;
  name: string;
  coverKey: string | null;
  tracks: Array<Track & { position: number }>;
};

export type LyricLine = {
  t: number;
  text: string;
};

export type Lyrics = {
  source: 'lrclib' | 'tag' | 'none';
  synced: LyricLine[] | null;
  plain: string | null;
};

/** Il riepilogo degli ascolti (sul modello di Apple Music Replay): tutto ricavato dalla tabella `plays`. */
export type Replay = {
  giorni: number | null;
  totali: { ascolti: number; minuti: number; brani: number; artisti: number; album: number };
  artisti: Array<{ id: number; nome: string; ascolti: number; minuti: number }>;
  album: Array<{ id: number; titolo: string; artista: string; coverKey: string | null; ascolti: number; minuti: number }>;
  brani: Array<{ id: number; titolo: string; artista: string; album: string; albumId: number; coverKey: string | null; ascolti: number }>;
  /** "2026-10" */
  mesi: Array<{ mese: string; ascolti: number; minuti: number }>;
  /** sempre 24 voci, da 0 a 23 */
  ore: Array<{ ora: number; ascolti: number }>;
  /** "2026-11-17" */
  record: { data: string; ascolti: number } | null;
  /** millisecondi del primo ascolto registrato */
  inizio: number | null;
};

export type Home = {
  ripresa: Track | null;
  recenti: Album[];
  aggiunti: Album[];
  riscopri: Album[];
  mai: Album[];
  top: Track[];
};

export type Stats = {
  artists: number;
  albums: number;
  tracks: number;
  duration: number;
};

export type RepeatMode = 'off' | 'all' | 'one';

export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '--:--';
  const s = Math.floor(seconds % 60);
  const m = Math.floor(seconds / 60) % 60;
  const h = Math.floor(seconds / 3600);
  const mm = h > 0 ? String(m).padStart(2, '0') : String(m);
  return `${h > 0 ? `${h}:` : ''}${mm}:${String(s).padStart(2, '0')}`;
}

export function formatLength(seconds: number): string {
  const total = Math.round(seconds / 60);
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m} ${m === 1 ? 'minuto' : 'minuti'}`;
  return `${h} ${h === 1 ? 'ora' : 'ore'} e ${m} ${m === 1 ? 'minuto' : 'minuti'}`;
}
