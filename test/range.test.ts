/**
 * Test delle regole HTTP Range in server/stream.ts (lato server).
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { parseRange } from '../server/stream.ts';

/* ───────────────────────── lato server ───────────────────────── */

test('parseRange: nessun header → si serve tutto il file', () => {
  assert.equal(parseRange(undefined, 1000), null);
});

test('parseRange: intervallo chiuso', () => {
  assert.deepEqual(parseRange('bytes=0-99', 1000), { start: 0, end: 99 });
});

test('parseRange: intervallo aperto a destra', () => {
  assert.deepEqual(parseRange('bytes=500-', 1000), { start: 500, end: 999 });
});

test('parseRange: suffisso, gli ultimi N byte', () => {
  assert.deepEqual(parseRange('bytes=-50', 1000), { start: 950, end: 999 });
});

test('parseRange: fine oltre il file viene troncata, non è un errore', () => {
  assert.deepEqual(parseRange('bytes=900-99999', 1000), { start: 900, end: 999 });
});

test('parseRange: inizio oltre il file → 416', () => {
  assert.equal(parseRange('bytes=5000-', 1000), 'unsatisfiable');
});

test('parseRange: intervallo rovesciato → 416', () => {
  assert.equal(parseRange('bytes=800-100', 1000), 'unsatisfiable');
});

test('parseRange: header illeggibile → si ignora e si serve tutto', () => {
  assert.equal(parseRange('righe=1-2', 1000), null);
  assert.equal(parseRange('bytes=abc-def', 1000), null);
});
