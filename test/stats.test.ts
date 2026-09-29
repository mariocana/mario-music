/**
 * Il riepilogo degli ascolti.
 *
 * Due cose vanno protette: che i minuti siano davvero la somma delle durate
 * (e non un conteggio di righe), e che le 24 ore del grafico ci siano tutte
 * anche quando in mezzo non hai ascoltato niente — un grafico che salta le
 * ore vuote racconta una giornata che non esiste.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { openDb } from '../server/db.ts';
import { riepilogo } from '../server/stats.ts';

const GIORNO = 24 * 60 * 60 * 1000;

/** Due artisti, due album, tre brani da 3 minuti l'uno. */
function libreria() {
  const db = openDb(':memory:');
  db.exec(`
    INSERT INTO artists (id, name) VALUES (1, 'Tizio'), (2, 'Caio');
    INSERT INTO albums (id, artist_id, title) VALUES (10, 1, 'Uno'), (20, 2, 'Due');
  `);
  const ins = db.prepare(`
    INSERT INTO tracks (id, album_id, artist_id, title, track_no, disc_no, duration, path, size, mtime, mime)
    VALUES (?, ?, ?, ?, 1, 1, 180, ?, 1000, 1, 'audio/mpeg')
  `);
  ins.run(100, 10, 1, 'A', '/x/100');
  ins.run(101, 10, 1, 'B', '/x/101');
  ins.run(200, 20, 2, 'C', '/x/200');
  return db;
}

/** Un ascolto a un'ora precisa di oggi (ora locale, come li raggruppiamo). */
function ascolto(db: ReturnType<typeof openDb>, trackId: number, ora: number, giorniFa = 0) {
  const d = new Date();
  d.setDate(d.getDate() - giorniFa);
  d.setHours(ora, 30, 0, 0);
  db.prepare('INSERT INTO plays (track_id, played_at) VALUES (?, ?)').run(trackId, d.getTime());
}

test('i minuti sono la somma delle durate, non il numero di ascolti', () => {
  const db = libreria();
  ascolto(db, 100, 10);
  ascolto(db, 100, 11);   // lo stesso brano due volte: contano entrambi
  ascolto(db, 200, 12);
  const r = riepilogo(db);
  assert.equal(r.totali.ascolti, 3);
  assert.equal(r.totali.minuti, 9);       // 3 ascolti × 3 minuti
  assert.equal(r.totali.brani, 2);        // ma i brani diversi sono due
  assert.equal(r.totali.artisti, 2);
});

test('le classifiche sono per numero di ascolti', () => {
  const db = libreria();
  for (let i = 0; i < 4; i++) ascolto(db, 100, 9 + i);
  ascolto(db, 200, 20);
  const r = riepilogo(db);
  assert.deepEqual(r.artisti.map((a) => [a.nome, a.ascolti]), [['Tizio', 4], ['Caio', 1]]);
  assert.deepEqual(r.album.map((a) => [a.titolo, a.ascolti]), [['Uno', 4], ['Due', 1]]);
  assert.deepEqual(r.brani.map((b) => [b.titolo, b.ascolti]), [['A', 4], ['C', 1]]);
});

test('il periodo taglia via quello che sta fuori', () => {
  const db = libreria();
  ascolto(db, 100, 12, 0);    // oggi
  ascolto(db, 101, 12, 40);   // quaranta giorni fa
  assert.equal(riepilogo(db).totali.ascolti, 2);
  assert.equal(riepilogo(db, 30).totali.ascolti, 1);
  assert.equal(riepilogo(db, 7).totali.ascolti, 1);
});

test('le ore del grafico sono sempre ventiquattro, anche quelle vuote', () => {
  const db = libreria();
  ascolto(db, 100, 9);
  ascolto(db, 100, 9);
  ascolto(db, 200, 23);
  const r = riepilogo(db);
  assert.equal(r.ore.length, 24);
  assert.deepEqual(r.ore.map((o) => o.ora), Array.from({ length: 24 }, (_, i) => i));
  assert.equal(r.ore[9].ascolti, 2);
  assert.equal(r.ore[23].ascolti, 1);
  assert.equal(r.ore[3].ascolti, 0);
});

test('la giornata record è quella con più ascolti', () => {
  const db = libreria();
  ascolto(db, 100, 10, 1);
  for (let i = 0; i < 3; i++) ascolto(db, 101, 10 + i, 2);
  const r = riepilogo(db);
  assert.equal(r.record?.ascolti, 3);
  const atteso = new Date();
  atteso.setDate(atteso.getDate() - 2);
  assert.equal(r.record?.data, atteso.toISOString().slice(0, 10));
});

test('senza ascolti non si inventa niente', () => {
  const db = libreria();
  const r = riepilogo(db);
  assert.equal(r.totali.ascolti, 0);
  assert.equal(r.totali.minuti, 0);
  assert.deepEqual(r.artisti, []);
  assert.deepEqual(r.brani, []);
  assert.deepEqual(r.mesi, []);
  assert.equal(r.record, null);
  assert.equal(r.inizio, null);
  // Le ore restano ventiquattro: il grafico esiste, è solo piatto.
  assert.equal(r.ore.length, 24);
});
