/**
 * Quale versione di un brano chiedere al server, dal telefono.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { convertibile, qualitaEffettiva, queryStream, usaConversione } from '../mobile/src/sorgente.ts';

test('in qualità originale un FLAC arriva così com\'è', () => {
  assert.equal(queryStream('flac', 'originale'), '');
});

test('in risparmio un FLAC si chiede convertito, e completo', () => {
  assert.equal(queryStream('flac', 'risparmio'), '?format=aac&full=1');
  assert.equal(queryStream('alac', 'risparmio'), '?format=aac&full=1');
});

test('MP3 e AAC non si riconvertono mai', () => {
  for (const codec of ['mp3', 'aac']) {
    assert.equal(convertibile(codec), false);
    assert.equal(queryStream(codec, 'risparmio'), '');
    assert.equal(queryStream(codec, 'originale'), '');
  }
});

test('un formato che il telefono non legge passa dalla conversione anche in originale', () => {
  assert.equal(usaConversione('vorbis', 'originale'), true);
  assert.equal(usaConversione('wmav2', 'originale'), true);
});

test('codec sconosciuto: in originale si prova il file vero', () => {
  assert.equal(usaConversione(null, 'originale'), false);
  assert.equal(usaConversione(null, 'risparmio'), true);
});

test('automatica: originale in Wi-Fi e via cavo, risparmio altrove', () => {
  assert.equal(qualitaEffettiva('automatica', 'WIFI'), 'originale');
  assert.equal(qualitaEffettiva('automatica', 'ETHERNET'), 'originale');
  assert.equal(qualitaEffettiva('automatica', 'CELLULAR'), 'risparmio');
});

test('automatica: nel dubbio si risparmiano dati', () => {
  for (const rete of ['VPN', 'BLUETOOTH', 'UNKNOWN', 'NONE', undefined]) {
    assert.equal(qualitaEffettiva('automatica', rete), 'risparmio', String(rete));
  }
});

test('originale e risparmio restano quello che sono, su qualunque rete', () => {
  assert.equal(qualitaEffettiva('originale', 'CELLULAR'), 'originale');
  assert.equal(qualitaEffettiva('risparmio', 'WIFI'), 'risparmio');
});
