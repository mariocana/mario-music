/**
 * Le scritte del riepilogo ascolti.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  altezzaBarra, dataLunga, meseBreve, meseLungo, oreMinuti, riproduzioni,
} from '../mobile/src/replay.ts';

test('oreMinuti: minuti, ore, e ore tonde', () => {
  assert.equal(oreMinuti(45), '45 min');
  assert.equal(oreMinuti(784), '13 h 4 min');
  assert.equal(oreMinuti(120), '2 h');
  assert.equal(oreMinuti(0), '0 min');
  // 59,6 minuti si arrotondano a un'ora tonda, non a "0 h 60 min"
  assert.equal(oreMinuti(59.6), '1 h');
});

test('mesi in italiano, qualunque lingua sappia il telefono', () => {
  assert.equal(meseBreve('2026-09'), 'set');
  assert.equal(meseBreve('2026-01'), 'gen');
  assert.equal(meseLungo('2026-12'), 'dicembre 2026');
  assert.equal(meseBreve('boh'), 'boh');
});

test('dataLunga: "17 novembre 2026"', () => {
  assert.equal(dataLunga('2026-11-17'), '17 novembre 2026');
  assert.equal(dataLunga('2026-03-01'), '1 marzo 2026');
  assert.equal(dataLunga('rotta'), 'rotta');
});

test('riproduzioni: singolare e plurale', () => {
  assert.equal(riproduzioni(1), '1 riproduzione');
  assert.equal(riproduzioni(0), '0 riproduzioni');
  assert.equal(riproduzioni(62), '62 riproduzioni');
});

test('altezzaBarra: proporzionale, ma una barra con ascolti si vede sempre', () => {
  assert.equal(altezzaBarra(50, 100), 0.5);
  assert.equal(altezzaBarra(100, 100), 1);
  assert.equal(altezzaBarra(0, 100), 0);
  assert.equal(altezzaBarra(1, 1000), 0.03);
  assert.equal(altezzaBarra(5, 0), 0);
});
