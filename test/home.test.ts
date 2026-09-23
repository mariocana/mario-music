/**
 * "Per te": cosa finisce in ogni scaffale.
 *
 * C'è anche un test che sembra pedante — trackCount — e invece protegge da
 * un errore facilissimo: contare le tracce con un JOIN su `plays` moltiplica
 * le righe, e un album ascoltato molte volte risulterebbe lungo il doppio.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { openDb } from '../server/db.ts';
import { recentAlbums, addedAlbums, rediscoverAlbums, neverPlayedAlbums } from '../server/home.ts';

const GIORNO = 24 * 60 * 60 * 1000;

type Riga = { id: number; title: string; trackCount: number; plays: number };
const titoli = (righe: unknown[]) => (righe as Riga[]).map((r) => r.title);

/**
 * Quattro album: uno ascoltato ieri, uno ascoltato tanto ma sei mesi fa, uno
 * provato una volta sola e mai più, uno mai aperto.
 */
function libreria() {
  const db = openDb(':memory:');
  const ora = Date.now();
  db.exec(`
    INSERT INTO artists (id, name) VALUES (1, 'Tizio');
    INSERT INTO albums (id, artist_id, title, year) VALUES
      (10, 1, 'Ieri', 2020), (11, 1, 'Vecchio Amore', 2010),
      (12, 1, 'Provato', 2015), (13, 1, 'Intonso', 2024);
  `);
  const ins = db.prepare(`
    INSERT INTO tracks (id, album_id, artist_id, title, track_no, disc_no, duration, path, size, mtime, mime, added_at)
    VALUES (?, ?, 1, ?, 1, 1, 200, ?, 1000, 1, 'audio/mpeg', ?)
  `);
  //        id   album  titolo          path      aggiunto
  ins.run(100, 10, 'A', '/x/100', ora - 30 * GIORNO);
  ins.run(101, 10, 'B', '/x/101', ora - 30 * GIORNO);
  ins.run(110, 11, 'C', '/x/110', ora - 300 * GIORNO);
  ins.run(120, 12, 'D', '/x/120', ora - 100 * GIORNO);
  ins.run(130, 13, 'E', '/x/130', ora - 1 * GIORNO);

  const play = db.prepare('INSERT INTO plays (track_id, played_at) VALUES (?, ?)');
  play.run(100, ora - 1 * GIORNO);                       // 'Ieri'
  for (let i = 0; i < 9; i++) play.run(110, ora - 180 * GIORNO); // 'Vecchio Amore', tanto ma vecchio
  play.run(120, ora - 200 * GIORNO);                     // 'Provato', una volta sola
  return db;
}

test('ascoltati di recente: solo quelli con ascolti, dal più recente', () => {
  const db = libreria();
  assert.deepEqual(titoli(recentAlbums(db)), ['Ieri', 'Vecchio Amore', 'Provato']);
});

test('aggiunti di recente: conta quando è entrato in libreria', () => {
  const db = libreria();
  assert.deepEqual(titoli(addedAlbums(db)), ['Intonso', 'Ieri', 'Provato', 'Vecchio Amore']);
});

test('riscopri: tanto ascoltato ma non di recente — non quello provato una volta', () => {
  const db = libreria();
  assert.deepEqual(titoli(rediscoverAlbums(db)), ['Vecchio Amore']);
});

test('riscopri: chi è stato ascoltato ieri non è una riscoperta', () => {
  const db = libreria();
  assert.ok(!titoli(rediscoverAlbums(db)).includes('Ieri'));
});

test('mai ascoltati: solo gli album che non hai mai aperto', () => {
  const db = libreria();
  assert.deepEqual(titoli(neverPlayedAlbums(db)), ['Intonso']);
});

test('il conteggio delle tracce non si gonfia con gli ascolti', () => {
  const db = libreria();
  const righe = recentAlbums(db) as Riga[];
  const ieri = righe.find((r) => r.title === 'Ieri')!;
  const vecchio = righe.find((r) => r.title === 'Vecchio Amore')!;
  assert.equal(ieri.trackCount, 2);
  // Una traccia, nove ascolti: un JOIN ingenuo direbbe 9.
  assert.equal(vecchio.trackCount, 1);
  assert.equal(vecchio.plays, 9);
});

test('limite: si chiede uno scaffale, non il catalogo', () => {
  const db = libreria();
  assert.equal(addedAlbums(db, 2).length, 2);
});
