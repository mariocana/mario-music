/**
 * db.ts — apertura del database e schema.
 *
 * Usa `node:sqlite`, il driver SQLite incluso in Node: nessuna dipendenza
 * nativa da compilare. Il file vive in data/library.db ed è interamente
 * ricostruibile da `npm run scan`: la sorgente di verità restano i file audio.
 */
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

export const DATA_DIR = path.resolve('data');
export const DB_PATH = path.join(DATA_DIR, 'library.db');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS artists (
  id   INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS albums (
  id         INTEGER PRIMARY KEY,
  artist_id  INTEGER NOT NULL REFERENCES artists(id) ON DELETE CASCADE,
  title      TEXT NOT NULL,
  year       INTEGER,
  genre      TEXT,
  cover_path TEXT,
  -- impronta del contenuto: finisce nell'URL, così la cache si invalida da sé
  cover_key  TEXT,
  UNIQUE (artist_id, title)
);

CREATE TABLE IF NOT EXISTS tracks (
  id          INTEGER PRIMARY KEY,
  album_id    INTEGER NOT NULL REFERENCES albums(id) ON DELETE CASCADE,
  artist_id   INTEGER NOT NULL REFERENCES artists(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  track_no    INTEGER,
  disc_no     INTEGER DEFAULT 1,
  duration    REAL NOT NULL,
  -- percorso assoluto sul disco: è la chiave naturale di un file
  path        TEXT NOT NULL UNIQUE,
  size        INTEGER NOT NULL,
  mtime       INTEGER NOT NULL,
  codec       TEXT,
  mime        TEXT NOT NULL,
  bitrate     INTEGER,
  sample_rate INTEGER,
  channels    INTEGER
);

-- Testi: una riga per traccia, popolata su richiesta e poi riusata.
-- Si registrano anche i tentativi a vuoto (source = 'none'), altrimenti
-- ogni apertura del pannello richiederebbe di nuovo la stessa canzone.
CREATE TABLE IF NOT EXISTS lyrics (
  track_id   INTEGER PRIMARY KEY REFERENCES tracks(id) ON DELETE CASCADE,
  synced     TEXT,
  plain      TEXT,
  source     TEXT NOT NULL,
  fetched_at INTEGER NOT NULL
);

-- Playlist: l'ordine è una colonna esplicita, non l'ordine di inserimento.
-- La chiave primaria è (playlist, posizione) e non (playlist, brano) apposta:
-- lo stesso brano può comparire due volte nella stessa playlist, ed è
-- legittimo (una compilation che ripete un pezzo, un intro e la sua reprise).
CREATE TABLE IF NOT EXISTS playlists (
  id         INTEGER PRIMARY KEY,
  name       TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  -- copertina scelta dall'utente; se manca si usa il mosaico degli album
  cover_path TEXT,
  cover_key  TEXT
);

CREATE TABLE IF NOT EXISTS playlist_tracks (
  playlist_id INTEGER NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
  track_id    INTEGER NOT NULL REFERENCES tracks(id)    ON DELETE CASCADE,
  position    INTEGER NOT NULL,
  PRIMARY KEY (playlist_id, position)
);

CREATE INDEX IF NOT EXISTS idx_playlist_tracks ON playlist_tracks(track_id);

-- Indice full-text per la ricerca. È una tabella a sé, non collegata a
-- tracks, con rowid = tracks.id: artista e album stanno in altre tabelle,
-- quindi non si può usare la modalità "external content" di FTS5.
--
-- remove_diacritics 2: "cafe" trova "Café", che con una libreria italiana
-- (e francese, e spagnola) serve di continuo.
CREATE VIRTUAL TABLE IF NOT EXISTS tracks_fts USING fts5(
  title, artist, album,
  tokenize='unicode61 remove_diacritics 2'
);

CREATE INDEX IF NOT EXISTS idx_tracks_album  ON tracks(album_id, disc_no, track_no);
CREATE INDEX IF NOT EXISTS idx_tracks_artist ON tracks(artist_id);
CREATE INDEX IF NOT EXISTS idx_albums_artist ON albums(artist_id);
`;

export function openDb(): DatabaseSync {
  mkdirSync(DATA_DIR, { recursive: true });
  const db = new DatabaseSync(DB_PATH);

  // WAL: letture e scritture non si bloccano a vicenda. Ci serve perché lo
  // scanner può girare mentre il server sta servendo richieste.
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA foreign_keys = ON');
  db.exec(SCHEMA);

  // Migrazione per i database creati prima che cover_key esistesse.
  try { db.exec('ALTER TABLE albums ADD COLUMN cover_key TEXT'); } catch { /* già presente */ }
  try { db.exec('ALTER TABLE tracks ADD COLUMN embedded_lyrics TEXT'); } catch { /* già presente */ }
  try { db.exec('ALTER TABLE playlists ADD COLUMN cover_path TEXT'); } catch { /* già presente */ }
  try { db.exec('ALTER TABLE playlists ADD COLUMN cover_key TEXT'); } catch { /* già presente */ }

  return db;
}
