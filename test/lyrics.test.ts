/**
 * Test della sincronizzazione dei testi.
 *
 * Sono le due funzioni pure dietro il pannello: leggere il formato LRC e
 * decidere quale verso è in corso a un dato secondo. L'evidenziazione a
 * schermo dipende da requestAnimationFrame, che non gira in un test — ma la
 * logica che decide "quale riga" è tutta qui.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { parseLrc } from '../server/lyrics.ts';
import { indiceAttivo } from '../web/src/lyricsSync.ts';

const LRC = [
  '[ti:Esempio]',
  '[00:13.06] Prima riga',
  '[00:16.75] Seconda riga',
  '[01:02.50] Terza riga',
  '[02:00.00]',
].join('\n');

test('parseLrc: legge i tempi e scarta le intestazioni', () => {
  const righe = parseLrc(LRC);
  assert.equal(righe.length, 4);
  assert.deepEqual(righe[0], { t: 13.06, text: 'Prima riga' });
  assert.deepEqual(righe[2], { t: 62.5, text: 'Terza riga' });
});

test('parseLrc: una riga vuota resta, è una pausa strumentale', () => {
  assert.deepEqual(parseLrc(LRC).at(-1), { t: 120, text: '' });
});

test('parseLrc: marcatori multipli sulla stessa riga (ritornello ripetuto)', () => {
  const righe = parseLrc('[00:10.00][01:30.00] Ritornello');
  assert.equal(righe.length, 2);
  assert.deepEqual(righe.map((r) => r.t), [10, 90]);
  assert.equal(righe[1].text, 'Ritornello');
});

test('parseLrc: le righe escono in ordine di tempo', () => {
  const righe = parseLrc('[00:30.00] Dopo\n[00:10.00] Prima');
  assert.deepEqual(righe.map((r) => r.text), ['Prima', 'Dopo']);
});

test('parseLrc: testo senza tempi → nessuna riga sincronizzata', () => {
  assert.deepEqual(parseLrc('Solo testo semplice\nsenza marcatori'), []);
});

const righe = parseLrc(LRC);

test('indiceAttivo: prima che inizi il canto nessun verso è acceso', () => {
  assert.equal(indiceAttivo(righe, 0), -1);
  assert.equal(indiceAttivo(righe, 5), -1);
});

test('indiceAttivo: si accende il verso già cominciato', () => {
  assert.equal(indiceAttivo(righe, 13.5), 0);
  assert.equal(indiceAttivo(righe, 16.8), 1);
  assert.equal(indiceAttivo(righe, 61), 1, 'resta sul secondo finché non parte il terzo');
  assert.equal(indiceAttivo(righe, 63), 2);
});

test('indiceAttivo: il piccolo anticipo evita il verso sempre in ritardo', () => {
  // 12.99 è dentro la tolleranza di 0.12s prima di 13.06
  assert.equal(indiceAttivo(righe, 12.99), 0);
  assert.equal(indiceAttivo(righe, 12.5), -1);
});

test('indiceAttivo: dopo l\'ultimo verso resta acceso l\'ultimo', () => {
  assert.equal(indiceAttivo(righe, 500), righe.length - 1);
});

test('indiceAttivo: senza testo sincronizzato non esplode', () => {
  assert.equal(indiceAttivo(null, 30), -1);
  assert.equal(indiceAttivo([], 30), -1);
});
