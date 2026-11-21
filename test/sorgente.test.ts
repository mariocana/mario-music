/**
 * Quale versione di un brano chiedere al server, dal telefono.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { convertibile, percorsoAscolto, qualitaEffettiva, usaConversione } from '../mobile/src/sorgente.ts';

test('in qualità originale un FLAC arriva così com\'è', () => {
  assert.equal(percorsoAscolto('flac', 'originale'), 'stream');
});

test('in risparmio un FLAC si ascolta convertito, a pezzi HLS', () => {
  assert.equal(percorsoAscolto('flac', 'risparmio'), 'hls/index.m3u8');
  assert.equal(percorsoAscolto('alac', 'risparmio'), 'hls/index.m3u8');
});

test('MP3 e AAC non si riconvertono mai', () => {
  for (const codec of ['mp3', 'aac']) {
    assert.equal(convertibile(codec), false);
    assert.equal(percorsoAscolto(codec, 'risparmio'), 'stream');
    assert.equal(percorsoAscolto(codec, 'originale'), 'stream');
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
