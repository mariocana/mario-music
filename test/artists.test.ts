/**
 * La pagina dell'artista: quali brani finiscono in "Top brani", in che
 * ordine, e quale copertina lo rappresenta.
 *
 * La regola da proteggere è una: senza ascolti la sezione resta vuota. È
 * facile, un domani, "sistemarla" facendole restituire i primi cinque brani
 * qualunque — e da quel momento la classifica mentirebbe.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { openDb } from '../server/db.ts';
import { albumsOfArtist, topTracksOfArtist, tracksOfArtist, coverOfArtist } from '../server/artists.ts';

type Riga = { id: number; title: string; playCount: number; album: string; trackCount?: number };

function libreria() {
  const db = openDb(':memory:');
  db.exec(`
    INSERT INTO artists (id, name) VALUES (1, 'Tizio'), (2, 'Caio');
    INSERT INTO albums (id, artist_id, title, year, cover_key) VALUES
      (10, 1, 'Esordio',  2001, 'aaa'),
      (11, 1, 'Maturità', 2010, 'bbb'),
      (12, 1, 'Singolo',  2015, NULL),
      (20, 2, 'Altrove',  2005, 'ccc');
  `);
  const traccia = db.prepare(`
    INSERT INTO tracks (id, album_id, artist_id, title, track_no, disc_no, duration, path, size, mtime, mime)
    VALUES (?, ?, ?, ?, ?, 1, 200, ?, 1000, 1, 'audio/mpeg')
  `);
  traccia.run(100, 10, 1, 'Prima', 1, '/x/100');
  traccia.run(101, 10, 1, 'Seconda', 2, '/x/101');
  traccia.run(102, 11, 1, 'Terza', 1, '/x/102');
  traccia.run(103, 11, 1, 'Quarta', 2, '/x/103');
  traccia.run(104, 12, 1, 'Il singolo', 1, '/x/104');
  traccia.run(200, 20, 2, 'Di Caio', 1, '/x/200');

  const ascolta = (trackId: number, volte: number) => {
    for (let i = 0; i < volte; i++) {
      db.prepare('INSERT INTO plays (track_id, played_at) VALUES (?, ?)').run(trackId, Date.now());
    }
  };
  return { db, ascolta };
}

test('top brani: in ordine di ascolti, e chi non è mai partito non compare', () => {
  const { db, ascolta } = libreria();
  ascolta(102, 5);
  ascolta(100, 2);
  ascolta(104, 1);

  const top = topTracksOfArtist(db, 1) as Riga[];
  assert.deepEqual(top.map((t) => t.title), ['Terza', 'Prima', 'Il singolo']);
  assert.deepEqual(top.map((t) => t.playCount), [5, 2, 1]);
  // 'Seconda' e 'Quarta' esistono ma non sono mai state ascoltate.
  assert.equal(top.length, 3);
});

test('top brani: artista mai ascoltato → elenco vuoto, non cinque brani a caso', () => {
  const { db } = libreria();
  assert.deepEqual(topTracksOfArtist(db, 1), []);
});

test('top brani: si fermano a cinque', () => {
  const { db, ascolta } = libreria();
  for (const id of [100, 101, 102, 103, 104]) ascolta(id, 1);
  ascolta(200, 1);
  assert.equal((topTracksOfArtist(db, 1) as Riga[]).length, 5);
  // E restano dentro i confini dell'artista: 'Di Caio' è di un altro.
  assert.ok(!(topTracksOfArtist(db, 1) as Riga[]).some((t) => t.title === 'Di Caio'));
});

test('tutti i brani: ordine cronologico, album per album', () => {
  const { db } = libreria();
  const tutti = tracksOfArtist(db, 1) as Riga[];
  assert.deepEqual(tutti.map((t) => t.title), ['Prima', 'Seconda', 'Terza', 'Quarta', 'Il singolo']);
});

test('album: ognuno sa quante tracce ha, ed è così che si riconosce un singolo', () => {
  const { db } = libreria();
  const album = albumsOfArtist(db, 1) as Riga[];
  assert.deepEqual(album.map((a) => [a.title, a.trackCount]), [
    ['Singolo', 1], ['Maturità', 2], ['Esordio', 2],
  ]);
});

/** I record di node:sqlite hanno prototipo null: deepEqual li rifiuterebbe. */
const semplice = (v: unknown) => (v === null ? null : { ...(v as object) });

test('copertina: quella dell\'album più ascoltato', () => {
  const { db, ascolta } = libreria();
  ascolta(102, 3); // 'Maturità'
  ascolta(100, 1); // 'Esordio'
  assert.deepEqual(semplice(coverOfArtist(db, 1)), { albumId: 11, coverKey: 'bbb' });
});

test('copertina: senza ascolti vince l\'album più corposo; senza copertine è null', () => {
  const { db } = libreria();
  // Esordio e Maturità hanno due tracce: a parità decide l'anno più recente.
  assert.deepEqual(semplice(coverOfArtist(db, 1)), { albumId: 11, coverKey: 'bbb' });

  db.exec('UPDATE albums SET cover_key = NULL WHERE artist_id = 1');
  assert.equal(coverOfArtist(db, 1), null);
});
