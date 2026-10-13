/**
 * Volume uniforme: la lettura della misura di ffmpeg e il calcolo del volume.
 *
 * Il test che vale per tutti è "il volume non si alza mai": `audio.volume`
 * non può superare 1, e un calcolo che chiedesse 1.4 verrebbe troncato a 1
 * dal browser — con il risultato che i brani sommessi resterebbero sommessi
 * e quelli forti non verrebbero abbassati, cioè il contrario di quello che
 * serve.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { leggiMisura, misuraFile } from '../server/loudness.ts';
import { guadagnoDb, fattoreVolume, RIFERIMENTO } from '../web/src/loudness.ts';

const RIASSUNTO = `
[Parsed_ebur128_0 @ 0x7f8] Summary:

  Integrated loudness:
    I:         -22.8 LUFS
    Threshold: -33.2 LUFS

  True peak:
    Peak:       -1.8 dBFS
`;

test('si legge il riassunto di ebur128', () => {
  assert.deepEqual(leggiMisura(RIASSUNTO), { loudness: -22.8, peak: -1.8 });
});

test('un brano di puro silenzio non produce una misura', () => {
  // ffmpeg scrive -inf: un guadagno calcolato su meno infinito sarebbe infinito.
  assert.equal(leggiMisura(RIASSUNTO.replace('-22.8 LUFS', '-inf LUFS')), null);
});

test('senza riassunto non si inventa un valore', () => {
  assert.equal(leggiMisura('ffmpeg: file non leggibile'), null);
  assert.equal(leggiMisura(''), null);
});

test('il picco manca? la misura resta valida', () => {
  // `peak=true` potrebbe non essere disponibile: il loudness da solo basta.
  const senzaPicco = RIASSUNTO.split('True peak')[0];
  assert.deepEqual(leggiMisura(senzaPicco), { loudness: -22.8, peak: 0 });
});

test('il volume si abbassa, mai si alza', () => {
  // Un brano moderno, masterizzato forte: va abbassato.
  assert.equal(guadagnoDb(-8), RIFERIMENTO + 8);     // -10 dB
  assert.ok(fattoreVolume(-8) < 1);

  // Un brano più sommesso del riferimento: resta com'è. Alzarlo non si può,
  // perché audio.volume si ferma a 1.
  assert.equal(guadagnoDb(-24), 0);
  assert.equal(fattoreVolume(-24), 1);
});

test('il fattore di volume segue i decibel', () => {
  // -6 dB è circa metà ampiezza: un brano a -12 LUFS con riferimento -18.
  const f = fattoreVolume(-12);
  assert.ok(Math.abs(f - 0.5) < 0.01, `atteso ~0.5, trovato ${f}`);
  // Il doppio di distanza, un quarto di ampiezza.
  assert.ok(Math.abs(fattoreVolume(-6) - 0.25) < 0.01);
});

test('senza misura non si tocca niente', () => {
  assert.equal(fattoreVolume(null), 1);
  assert.equal(fattoreVolume(undefined), 1);
  assert.equal(fattoreVolume(NaN), 1);
  // 0 è il valore che scriviamo quando la misura fallisce: significa
  // "lascialo com'è", non "silenzio".
  assert.equal(fattoreVolume(0), 1);
});

test('una misura assurda non rende il brano inudibile', () => {
  // Un file rotto letto come fortissimo chiederebbe -42 dB: si taglia.
  assert.ok(fattoreVolume(-200) >= 0.05);
});

test('con ffmpeg vero: un tono misurato ha il loudness che ci si aspetta', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'mario-music-loudness-'));
  try {
    // Una sinusoide a volume dimezzato: deve risultare più sommessa di una a
    // volume pieno, e il picco deve rifletterlo.
    const forte = path.join(dir, 'forte.flac');
    const piano = path.join(dir, 'piano.flac');
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'lavfi',
      '-i', 'sine=frequency=1000:duration=4', '-c:a', 'flac', forte]);
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'lavfi',
      '-i', 'sine=frequency=1000:duration=4', '-af', 'volume=-10dB', '-c:a', 'flac', piano]);

    const a = await misuraFile(forte);
    const b = await misuraFile(piano);
    assert.ok(a && b, 'entrambe le misure devono riuscire');
    assert.ok(Math.abs((a.loudness - b.loudness) - 10) < 0.5,
      `la differenza doveva essere ~10 dB, è ${(a.loudness - b.loudness).toFixed(1)}`);
    assert.ok(a.peak > b.peak);

    // Nessuno dei due viene toccato: una sinusoide di ffmpeg sta a -21 LUFS,
    // cioè già più sommessa del riferimento. Serve qualcosa di davvero forte.
    assert.equal(fattoreVolume(a.loudness), 1);
    const forteDavvero = path.join(dir, 'fortissimo.flac');
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', forte,
      '-af', 'volume=+15dB', '-c:a', 'flac', forteDavvero]);
    const c = await misuraFile(forteDavvero);
    assert.ok(c && c.loudness > RIFERIMENTO, `doveva superare il riferimento, è ${c?.loudness}`);
    assert.ok(fattoreVolume(c.loudness) < 1, 'questo sì che va abbassato');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('un file che non esiste non fa esplodere niente', async () => {
  assert.equal(await misuraFile('/non/esisto.flac'), null);
});
