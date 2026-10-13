/**
 * Test della ricerca full-text.
 *
 * `buildMatchQuery` è la parte che va sbagliata per prima: FTS5 ha una
 * sintassi con operatori, e il testo digitato dall'utente arriva così com'è.
 * Una virgoletta spaiata o un "AND" fanno fallire l'intera query.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { openDb } from '../server/db.ts';
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

/**
 * Lo schema vero, non una copia scritta a mano.
 *
 * Prima qui c'era un `CREATE TABLE tracks` ridotto all'osso, e ogni colonna
 * aggiunta altrove (l'impronta, la data di ingresso, il loudness) rompeva
 * questi test senza che ci fosse niente di rotto nella ricerca. Con openDb lo
 * schema è uno solo e non può andare fuori sincrono.
 */
function dbDiProva() {
  const db = openDb(':memory:');
  db.exec(`
    INSERT INTO artists (id, name) VALUES (1,'Café del Mar'), (2,'883');
    INSERT INTO albums (id, artist_id, title) VALUES (1,1,'Terrace Mix'), (2,2,'Nord Sud Ovest Est');
    INSERT INTO tracks (id, album_id, artist_id, title, track_no, disc_no, duration, path, size, mtime, mime, codec)
    VALUES
      (1,1,1,'Feeling Good',1,1,200,'/x/1',100,1,'audio/mpeg','mp3'),
      (2,2,2,'Come mai',2,1,210,'/x/2',100,1,'audio/mpeg','mp3');
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
