/**
 * Test delle misure del layout: quante colonne di copertine entrano.
 *
 * Il caso che conta è il Mac, dove la stessa app iPhone gira in una finestra
 * larga e ridimensionabile: le copertine non devono diventare gigantesche.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  griglia,
  larghezzaContenuto,
  LARGHEZZA_MASSIMA_CONTENUTO,
} from '../mobile/src/griglia.ts';

test('iPhone: due colonne come prima', () => {
  const { colonne, larghezzaCella } = griglia(390);
  assert.equal(colonne, 2);
  // (390 - 32 - 16) / 2
  assert.equal(larghezzaCella, 171);
});

test('iPhone piccolo: restano due colonne anche sotto il minimo', () => {
  const { colonne, larghezzaCella } = griglia(320);
  assert.equal(colonne, 2);
  assert.equal(larghezzaCella, 136);
});

test('finestra larga: più colonne, celle mai oltre il massimo', () => {
  for (const larghezza of [600, 768, 834, 960, 1024, 1440]) {
    const { colonne, larghezzaCella } = griglia(larghezza);
    assert.ok(colonne > 2, `${larghezza}: ${colonne} colonne`);
    assert.ok(larghezzaCella <= 220, `${larghezza}: cella ${larghezzaCella}`);
    assert.ok(larghezzaCella >= 150, `${larghezza}: cella ${larghezzaCella}`);
  }
});

test('le celle e gli spazi stanno nella larghezza', () => {
  for (let larghezza = 300; larghezza <= 1500; larghezza += 37) {
    const { colonne, larghezzaCella } = griglia(larghezza);
    const occupato = 32 + colonne * larghezzaCella + (colonne - 1) * 16;
    assert.ok(occupato <= larghezza, `${larghezza}: occupa ${occupato}`);
  }
});

test('minimo vicino al massimo: aggiunge colonne finché la cella rientra', () => {
  const { larghezzaCella } = griglia(1000, { minimo: 200, massimo: 205 });
  assert.ok(larghezzaCella <= 205);
});

test('larghezza nulla o non valida non rompe i conti', () => {
  assert.deepEqual(griglia(0), { colonne: 2, larghezzaCella: 0 });
  assert.equal(larghezzaContenuto(Number.NaN), 0);
});

test('colonna di contenuto limitata sul Mac, intera su iPhone', () => {
  assert.equal(larghezzaContenuto(390), 390);
  assert.equal(larghezzaContenuto(1600), LARGHEZZA_MASSIMA_CONTENUTO);
});
