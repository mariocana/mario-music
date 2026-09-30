/**
 * Le due operazioni sulla coda.
 *
 * Il test che conta è quello sull'ordine: "riproduci dopo" su un album
 * intero, fatto un brano alla volta, infilava ogni traccia subito dopo
 * quella in ascolto — e l'album partiva dall'ultima canzone.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { accoda, inserisciDopo } from '../web/src/coda.ts';
import type { Track } from '../web/src/api.ts';

/** Una traccia finta: dei suoi campi qui interessa solo l'id. */
const brano = (id: number): Track => ({
  id, title: `Brano ${id}`, trackNo: id, discNo: 1, duration: 180,
  codec: 'mp3', bitrate: 320, sampleRate: 44100, channels: 2, size: 1000,
  albumId: 1, album: 'Album', coverKey: null, artistId: 1, artist: 'Tizio',
  favorite: 0, playCount: 0,
});

const ids = (c: { queue: Track[] }) => c.queue.map((t) => t.id);

test('accoda: in fondo, nell\'ordine in cui arrivano', () => {
  const coda = { queue: [brano(1), brano(2)], index: 0 };
  const dopo = accoda(coda, [brano(3), brano(4)]);
  assert.deepEqual(ids(dopo), [1, 2, 3, 4]);
  assert.equal(dopo.index, 0, 'chi sta suonando continua a suonare');
});

test('accoda: gli stessi brani si possono accodare due volte', () => {
  // Un album messo in coda due volte lo si vuole sentire due volte: qui,
  // a differenza di "riproduci dopo", il doppione è voluto.
  const coda = { queue: [brano(1)], index: 0 };
  assert.deepEqual(ids(accoda(accoda(coda, [brano(2)]), [brano(2)])), [1, 2, 2]);
});

test('inserisciDopo: subito dopo quello in ascolto', () => {
  const coda = { queue: [brano(1), brano(2), brano(3)], index: 1 };
  const dopo = inserisciDopo(coda, [brano(9)]);
  assert.deepEqual(ids(dopo), [1, 2, 9, 3]);
  assert.equal(dopo.index, 1);
});

test('inserisciDopo: un album intero mantiene il suo ordine', () => {
  const coda = { queue: [brano(1), brano(2)], index: 0 };
  const dopo = inserisciDopo(coda, [brano(10), brano(11), brano(12)]);
  assert.deepEqual(ids(dopo), [1, 10, 11, 12, 2], 'non 12, 11, 10');
});

test('inserisciDopo: un brano già in coda si sposta, non si duplica', () => {
  const coda = { queue: [brano(1), brano(2), brano(3)], index: 0 };
  const dopo = inserisciDopo(coda, [brano(3)]);
  assert.deepEqual(ids(dopo), [1, 3, 2]);
});

test('inserisciDopo: il brano in ascolto non si tocca mai', () => {
  // Chiedere "riproduci dopo" proprio su quello che sta suonando non deve
  // toglierlo da sotto i piedi: resta dov\'è, e se ne mette una copia dopo.
  const coda = { queue: [brano(1), brano(2)], index: 0 };
  const dopo = inserisciDopo(coda, [brano(1)]);
  assert.equal(dopo.queue[dopo.index].id, 1);
  assert.deepEqual(ids(dopo), [1, 1, 2]);
});

test('inserisciDopo: l\'indice segue il brano in ascolto quando la coda si accorcia', () => {
  // Il 3 viene tolto da prima del brano in ascolto per essere rimesso dopo:
  // senza aggiornare l\'indice, si finirebbe a puntare al brano sbagliato.
  const coda = { queue: [brano(3), brano(1), brano(2)], index: 1 };
  const dopo = inserisciDopo(coda, [brano(3)]);
  assert.deepEqual(ids(dopo), [1, 3, 2]);
  assert.equal(dopo.queue[dopo.index].id, 1);
});

test('una lista vuota non cambia niente', () => {
  const coda = { queue: [brano(1)], index: 0 };
  assert.deepEqual(accoda(coda, []), coda);
  assert.deepEqual(inserisciDopo(coda, []), coda);
});
