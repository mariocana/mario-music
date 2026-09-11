/**
 * Test della ricerca full-text.
 *
 * `buildMatchQuery` è la parte che va sbagliata per prima: FTS5 ha una
 * sintassi con operatori, e il testo digitato dall'utente arriva così com'è.
 * Una virgoletta spaiata o un "AND" fanno fallire l'intera query.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { buildMatchQuery, searchTracks } from '../server/search.ts';

test('buildMatchQuery: ogni parola diventa un prefisso fra virgolette', () => {
  assert.equal(buildMatchQuery('beatles'), '"beatles"*');
  assert.equal(buildMatchQuery('abbey road'), '"abbey"* "road"*');
});

test('buildMatchQuery: gli operatori FTS5 sono neutralizzati, non interpretati', () => {
  // Senza virgolette, "AND"/"OR"/"NOT" sarebbero operatori e cambierebbero il senso.
  assert.equal(buildMatchQuery('rock AND roll'), '"rock"* "AND"* "roll"*');
  // Una virgoletta spaiata farebbe fallire la query con un errore di sintassi.
  assert.equal(buildMatchQuery('rock " roll'), '"rock"* "roll"*');
  assert.equal(buildMatchQuery('-live ^start col:onna'), '"live"* "start"* "col"* "onna"*');
});

test('buildMatchQuery: senza lettere né numeri non si cerca', () => {
  assert.equal(buildMatchQuery(''), null);
  assert.equal(buildMatchQuery('   '), null);
  assert.equal(buildMatchQuery('***'), null);
});

test('buildMatchQuery: numeri e lettere accentate sono parole valide', () => {
  assert.equal(buildMatchQuery('883'), '"883"*');
  assert.equal(buildMatchQuery('Café'), '"Café"*');
});

test('buildMatchQuery: si ferma a otto parole', () => {
  const molte = 'a b c d e f g h i j k';
  assert.equal(buildMatchQuery(molte)?.split(' ').length, 8);
});

/* ── la ricerca vera, su un database in memoria ── */

function dbDiProva() {
  const db = new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE artists (id INTEGER PRIMARY KEY, name TEXT);
    CREATE TABLE albums (id INTEGER PRIMARY KEY, title TEXT, cover_key TEXT);
    CREATE TABLE tracks (
      id INTEGER PRIMARY KEY, title TEXT, track_no INTEGER, disc_no INTEGER,
      duration REAL, codec TEXT, bitrate INTEGER, sample_rate INTEGER,
      channels INTEGER, size INTEGER, album_id INTEGER, artist_id INTEGER
    );
    -- Le colonne condivise delle tracce leggono anche preferiti e ascolti:
    -- servono qui, anche se questi test riguardano solo la ricerca.
    CREATE TABLE favorites (track_id INTEGER PRIMARY KEY, added_at INTEGER);
    CREATE TABLE plays (id INTEGER PRIMARY KEY, track_id INTEGER, played_at INTEGER);
    CREATE VIRTUAL TABLE tracks_fts USING fts5(
      title, artist, album, tokenize='unicode61 remove_diacritics 2'
    );
    INSERT INTO artists VALUES (1,'Café del Mar'), (2,'883');
    INSERT INTO albums VALUES (1,'Terrace Mix',NULL), (2,'Nord Sud Ovest Est',NULL);
    INSERT INTO tracks VALUES
      (1,'Feeling Good',1,1,200,'mp3',320,44100,2,100,1,1),
      (2,'Come mai',2,1,210,'mp3',320,44100,2,100,2,2);
    INSERT INTO tracks_fts (rowid,title,artist,album)
      SELECT t.id, t.title, ar.name, al.title
      FROM tracks t JOIN artists ar ON ar.id=t.artist_id JOIN albums al ON al.id=t.album_id;
  `);
  return db;
}

test('ricerca: trova per titolo, artista e album', () => {
  const db = dbDiProva();
  const titoli = (q: string) => (searchTracks(db, q) as Array<{ title: string }>).map((r) => r.title);
  assert.deepEqual(titoli('feeling'), ['Feeling Good']);
  assert.deepEqual(titoli('883'), ['Come mai']);
  assert.deepEqual(titoli('terrace'), ['Feeling Good']);
});

test('ricerca: gli accenti non contano — "cafe" trova "Café"', () => {
  const db = dbDiProva();
  assert.equal((searchTracks(db, 'cafe') as unknown[]).length, 1);
});

test('ricerca: basta il prefisso, si cerca mentre si scrive', () => {
  const db = dbDiProva();
  assert.equal((searchTracks(db, 'feel') as unknown[]).length, 1);
  assert.equal((searchTracks(db, 'fee') as unknown[]).length, 1);
});

test('ricerca: input che romperebbe FTS5 non solleva errori', () => {
  const db = dbDiProva();
  for (const brutto of ['"', 'AND', '*', 'a OR', 'NOT NOT', '((', 'col:']) {
    assert.doesNotThrow(() => searchTracks(db, brutto), `input: ${brutto}`);
  }
});

test('ricerca: senza riscontri torna vuoto, non tutto', () => {
  const db = dbDiProva();
  assert.deepEqual(searchTracks(db, 'zzzzzz'), []);
});
