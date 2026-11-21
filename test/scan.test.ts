/**
 * Il risultato di "Aggiorna libreria" in parole.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { avvisiScan, catalogoCambiato, riepilogoScan, type ScanResult } from '../mobile/src/scan.ts';

const vuoto: ScanResult = {
  added: 0, updated: 0, skipped: 1956, failed: 0, moved: 0, removed: 0, refused: 0, total: 1956, ms: 1043,
};

test('nessuna novità, detta come tale', () => {
  assert.equal(riepilogoScan(vuoto), 'Nessuna novità: 1956 brani in libreria.');
  assert.equal(catalogoCambiato(vuoto), false);
  assert.deepEqual(avvisiScan(vuoto), []);
});

test('solo le voci che contano, al singolare quando serve', () => {
  const r = { ...vuoto, added: 12, updated: 1, removed: 2, total: 1966 };
  assert.equal(riepilogoScan(r), '12 brani aggiunti, 1 aggiornato, 2 rimossi. Ora 1966 brani in libreria.');
  assert.equal(catalogoCambiato(r), true);
});

test('uno spostamento cambia il catalogo anche senza aggiunte', () => {
  assert.equal(catalogoCambiato({ ...vuoto, moved: 3 }), true);
});

test('file illeggibili e cancellazioni rifiutate diventano avvisi', () => {
  const avvisi = avvisiScan({ ...vuoto, failed: 1, refused: 40 });
  assert.equal(avvisi.length, 2);
  assert.match(avvisi[0], /^1 file non leggibile/);
  assert.match(avvisi[1], /^40 brani sembrano spariti/);
});
