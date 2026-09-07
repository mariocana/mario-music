/**
 * Test del ripiego sui percorsi.
 *
 * Vale solo per i file senza tag — i tag vincono sempre — ma è proprio lì
 * che non c'è nient'altro su cui contare, quindi deve essere giusto.
 *
 * `haSottocartelle` è passato come funzione apposta: così questi test non
 * toccano il disco e possono descrivere qualsiasi disposizione.
 */
import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { fromPath } from '../server/scanner.ts';

const LIB = path.resolve('media/library');
const f = (...segmenti: string[]) => path.join(LIB, ...segmenti);

/** Finto filesystem: elenca quali cartelle ne contengono altre. */
const conSottocartelle = (...dirs: string[]) => (dir: string) => dirs.includes(dir);
const nessuna = () => false;

test('file sciolto nella radice → Singoli', () => {
  assert.deepEqual(fromPath(f('canzone.mp3'), nessuna), { album: 'Singoli', disc: undefined });
});

test('cartella singola senza sottocartelle → è un album', () => {
  assert.deepEqual(fromPath(f('Nevermind', '01.mp3'), nessuna),
    { album: 'Nevermind', disc: undefined });
});

test("l'anno in coda al nome della cartella viene tolto", () => {
  assert.equal(fromPath(f('Nevermind (1991)', '01.mp3'), nessuna).album, 'Nevermind');
  assert.equal(fromPath(f('Nevermind [1991]', '01.mp3'), nessuna).album, 'Nevermind');
});

test('Artista/Album/brano → entrambi dal percorso', () => {
  assert.deepEqual(fromPath(f('Nirvana', 'Nevermind', '01.mp3'), nessuna),
    { album: 'Nevermind', artist: 'Nirvana', disc: undefined });
});

test('singolo dentro la cartella artista → Singoli di quell\'artista', () => {
  // "Nirvana" contiene altre cartelle: è un artista, non un album.
  const ha = conSottocartelle(f('Nirvana'));
  assert.deepEqual(fromPath(f('Nirvana', 'brano-sciolto.mp3'), ha),
    { album: 'Singoli', artist: 'Nirvana', disc: undefined });
});

test('cofanetto con CD1/CD2 nella radice → un solo album, con i dischi', () => {
  // "Cofanetto" contiene CD1 e CD2, quindi ha sottocartelle: ma è un album,
  // non un artista. Lo si sa perché la cartella scartata era un disco.
  const ha = conSottocartelle(f('Cofanetto'));
  assert.deepEqual(fromPath(f('Cofanetto', 'CD2', '01.mp3'), ha),
    { album: 'Cofanetto', disc: 2 });
});

test('Artista/Album/CD2/brano → artista, album e disco', () => {
  const ha = conSottocartelle(f('Bob Dylan'), f('Bob Dylan', 'Cofanetto'));
  assert.deepEqual(fromPath(f('Bob Dylan', 'Cofanetto', 'CD2', '01.mp3'), ha),
    { album: 'Cofanetto', artist: 'Bob Dylan', disc: 2 });
});

test('cartelle disco scritte in modi diversi', () => {
  for (const nome of ['CD1', 'cd 1', 'Disc 1', 'Disco 1', 'disk-1']) {
    assert.equal(fromPath(f('Album', nome, '01.mp3'), conSottocartelle(f('Album'))).disc, 1, nome);
  }
});
