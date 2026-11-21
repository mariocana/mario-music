/**
 * Ripresa dopo la chiusura: un ricordo vecchio o rovinato non deve mai
 * bloccare l'app, e uno valido deve rimettere la coda dov'era.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { leggiRipresa, scriviCoda, scriviPosizione } from '../mobile/src/ripresa.ts';
import type { Track } from '../mobile/src/types.ts';

const brano = (id: number, duration = 200) => ({ id, title: `b${id}`, duration }) as Track;
const coda = [brano(1), brano(2), brano(3)];

test('coda e posizione tornano come erano', () => {
  const r = leggiRipresa(
    scriviCoda(coda, coda),
    scriviPosizione({ index: 1, id: 2, time: 42.5, shuffle: false, repeat: 'all' }),
  );
  assert.ok(r);
  assert.deepEqual(r.queue.map((t) => t.id), [1, 2, 3]);
  assert.equal(r.index, 1);
  assert.equal(r.time, 42.5);
  assert.equal(r.repeat, 'all');
  assert.equal(r.original, r.queue);
});

test("con lo shuffle si conserva anche l'ordine originale", () => {
  const mescolata = [coda[2], coda[0], coda[1]];
  const r = leggiRipresa(
    scriviCoda(mescolata, coda),
    scriviPosizione({ index: 0, id: 3, time: 0, shuffle: true, repeat: 'off' }),
  );
  assert.ok(r);
  assert.equal(r.shuffle, true);
  assert.deepEqual(r.original.map((t) => t.id), [1, 2, 3]);
});

test('niente coda, o coda illeggibile: niente ripresa', () => {
  assert.equal(leggiRipresa(null, null), null);
  assert.equal(leggiRipresa('{rotto', null), null);
  assert.equal(leggiRipresa(JSON.stringify({ queue: [] }), null), null);
  assert.equal(leggiRipresa(JSON.stringify({ queue: [{ titolo: 'senza id' }] }), null), null);
});

test("se l'indice non punta più al brano salvato, lo si cerca per id", () => {
  const r = leggiRipresa(
    scriviCoda(coda, coda),
    scriviPosizione({ index: 0, id: 3, time: 10, shuffle: false, repeat: 'off' }),
  );
  assert.equal(r?.index, 2);
  assert.equal(r?.time, 10);
});

test('brano sparito dalla coda: si riparte dal primo, da zero', () => {
  const r = leggiRipresa(
    scriviCoda(coda, coda),
    scriviPosizione({ index: 1, id: 99, time: 10, shuffle: false, repeat: 'off' }),
  );
  assert.equal(r?.index, 0);
  assert.equal(r?.time, 0);
});

test('posizione mancante o con valori strani: inizio della coda', () => {
  const r = leggiRipresa(scriviCoda(coda, coda), JSON.stringify({ index: 'x', time: -5, repeat: 'boh' }));
  assert.equal(r?.index, 0);
  assert.equal(r?.time, 0);
  assert.equal(r?.repeat, 'off');
  assert.equal(r?.shuffle, false);
});

test('fermi a due secondi dalla fine: si riprende da capo', () => {
  const r = leggiRipresa(
    scriviCoda(coda, coda),
    scriviPosizione({ index: 0, id: 1, time: 199, shuffle: false, repeat: 'off' }),
  );
  assert.equal(r?.time, 0);
});
