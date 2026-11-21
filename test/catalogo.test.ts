/**
 * Il catalogo offline: cosa si salva e con che nome.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { cartellaServer, daMettereInCache, nomeFile } from '../mobile/src/catalogoChiavi.ts';

test('si salva quello che serve a sfogliare, non la ricerca', () => {
  for (const p of ['/api/albums', '/api/albums/33', '/api/artists/2/tracks', '/api/top?days=7', '/api/replay', '/api/tracks/5/lyrics']) {
    assert.equal(daMettereInCache(p), true, p);
  }
  assert.equal(daMettereInCache('/api/search?q=queen'), false);
  assert.equal(daMettereInCache('/altro'), false);
});

test('nomi di file sicuri e senza collisioni', () => {
  assert.match(nomeFile('/api/top?days=7'), /^[A-Za-z0-9._-]+$/);
  assert.notEqual(nomeFile('/api/top?days=7'), nomeFile('/api/top_days_7'));
  assert.notEqual(nomeFile('/api/albums/3'), nomeFile('/api/albums3'));
  assert.equal(nomeFile('/api/albums'), nomeFile('/api/albums'), 'stesso percorso, stesso file');
});

test('una cartella per server, la barra finale non conta', () => {
  assert.equal(cartellaServer('http://192.168.1.10:4000/'), cartellaServer('http://192.168.1.10:4000'));
  assert.notEqual(cartellaServer('http://192.168.1.10:4000'), cartellaServer('http://192.168.1.11:4000'));
});
