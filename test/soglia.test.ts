/**
 * Test della soglia oltre cui un brano conta come ascoltato.
 *
 * È la regola che decide se "i più ascoltati" hanno senso: contare all'avvio
 * riempirebbe l'elenco di pezzi saltati dopo tre secondi.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { sogliaAscolto } from '../web/src/soglia.ts';

test('brano corto: conta a metà', () => {
  assert.equal(sogliaAscolto(180), 90);
  assert.equal(sogliaAscolto(60), 30);
});

test('brano lungo: si fermano a quattro minuti, non serve la metà', () => {
  // Un pezzo da 20 minuti non deve richiederne 10 per contare.
  assert.equal(sogliaAscolto(1200), 240);
  assert.equal(sogliaAscolto(600), 240);
});

test('il confine è esattamente a otto minuti di durata', () => {
  assert.equal(sogliaAscolto(480), 240, 'a 8 minuti metà e tetto coincidono');
  assert.equal(sogliaAscolto(479), 239.5);
  assert.equal(sogliaAscolto(481), 240);
});

test('durata sconosciuta o assurda: si ripiega sul tetto', () => {
  assert.equal(sogliaAscolto(0), 240);
  assert.equal(sogliaAscolto(-5), 240);
  assert.equal(sogliaAscolto(NaN), 240);
  assert.equal(sogliaAscolto(Infinity), 240);
});
