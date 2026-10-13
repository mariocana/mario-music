/**
 * Gapless e dissolvenza incrociata: i conti che decidono quando parte il
 * brano dopo e con che volume.
 *
 * Il test da leggere è quello sulla potenza costante: è la ragione per cui la
 * dissolvenza usa coseno e seno invece di due rampe dritte.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  durataEffettiva, istanteTransizione, deveIniziare, devePrecaricare,
  guadagni, volumeControllabile, ANTICIPO_CARICAMENTO,
} from '../web/src/gapless.ts';

test('senza dissolvenza il passaggio è alla fine esatta: è questo il gapless', () => {
  assert.equal(istanteTransizione(180, 0), 180);
  assert.equal(deveIniziare(179.9, 180, 0), false);
  assert.equal(deveIniziare(180, 180, 0), true);
});

test('con la dissolvenza il passaggio comincia prima della fine', () => {
  assert.equal(istanteTransizione(180, 6), 174);
  assert.equal(deveIniziare(173, 180, 6), false);
  assert.equal(deveIniziare(174, 180, 6), true);
});

test('la dissolvenza non supera mai metà del brano', () => {
  // Un intermezzo di 20 secondi con 12 di dissolvenza comincerebbe a sfumare
  // prima di essere cominciato.
  assert.equal(durataEffettiva(12, 20), 10);
  assert.equal(istanteTransizione(20, 12), 10);
  // Su un brano di durata normale la richiesta è rispettata.
  assert.equal(durataEffettiva(12, 300), 12);
});

test('durata sconosciuta: non si decide niente', () => {
  // Capita davvero: finché l'audio non ha letto l'intestazione, duration è NaN.
  assert.equal(durataEffettiva(6, NaN), 0);
  assert.equal(deveIniziare(10, NaN, 6), false);
  assert.equal(deveIniziare(10, 0, 6), false);
  assert.equal(devePrecaricare(10, Infinity, 6), false);
});

test('il brano dopo si mette in carica molto prima della transizione', () => {
  const durata = 200;
  assert.equal(devePrecaricare(durata - ANTICIPO_CARICAMENTO - 1, durata, 0), false);
  assert.equal(devePrecaricare(durata - ANTICIPO_CARICAMENTO, durata, 0), true);
  // Con la dissolvenza il caricamento si sposta indietro insieme a lei: il
  // file deve essere pronto PRIMA che cominci a sfumare, non durante.
  assert.equal(devePrecaricare(durata - 10 - ANTICIPO_CARICAMENTO, durata, 10), true);
});

test('su un brano più corto dell\'anticipo si carica subito', () => {
  assert.equal(devePrecaricare(0, 10, 0), true);
});

test('la dissolvenza mantiene costante la POTENZA, non l\'ampiezza', () => {
  // È il punto di tutta la curva: due rampe dritte darebbero 0.5² + 0.5² = 0.5
  // a metà strada, cioè un avvallamento di volume in mezzo alla transizione.
  for (const p of [0, 0.1, 0.25, 0.5, 0.75, 0.9, 1]) {
    const g = guadagni(p);
    const potenza = g.uscente ** 2 + g.entrante ** 2;
    assert.ok(Math.abs(potenza - 1) < 1e-9, `a p=${p} la potenza è ${potenza}`);
  }
});

test('la dissolvenza parte dal vecchio e finisce sul nuovo', () => {
  const inizio = guadagni(0);
  assert.equal(inizio.uscente, 1);
  assert.equal(inizio.entrante, 0);

  const fine = guadagni(1);
  assert.ok(Math.abs(fine.uscente) < 1e-9);
  assert.equal(fine.entrante, 1);
});

test('un avanzamento fuori scala non manda i volumi fuori range', () => {
  // currentTime può superare la durata di un soffio: p arriva a 1.02.
  for (const p of [-1, 1.5, NaN]) {
    const g = guadagni(Number.isNaN(p) ? 0 : p);
    assert.ok(g.uscente >= 0 && g.uscente <= 1);
    assert.ok(g.entrante >= 0 && g.entrante <= 1);
  }
});

test('il volume si prova, non si indovina dal nome del browser', () => {
  // Un elemento normale: la scrittura attacca.
  const normale = { volume: 1 };
  assert.equal(volumeControllabile(normale), true);
  assert.equal(normale.volume, 1, 'il valore di partenza va rimesso com\'era');

  // iOS: la proprietà esiste, si scrive, e resta com\'era.
  const iphone = { _v: 1, get volume() { return this._v; }, set volume(_: number) { /* ignorato */ } };
  assert.equal(volumeControllabile(iphone), false);
});
