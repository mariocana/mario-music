/**
 * Transcodifica: cache per impronta, una conversione sola per brano anche
 * con richieste concorrenti, niente file mozzi in caso di errore, e la scelta
 * dell'URL lato client (sorgente.ts).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { transcodedFile, giaPronto, vaTranscodificato, percorsoTranscodificato } from '../server/transcode.ts';
import { urlBrano, leggibile } from '../web/src/sorgente.ts';

function cartella() {
  const dir = mkdtempSync(path.join(tmpdir(), 'mario-music-transcode-'));
  return { dir, pulisci: () => rmSync(dir, { recursive: true, force: true }) };
}

/** Un finto ffmpeg: scrive "output" e conta quante volte è stato chiamato. */
function convertitoreFinto() {
  let chiamate = 0;
  const converti = async (_input: string, output: string) => {
    chiamate++;
    await new Promise((r) => setTimeout(r, 20));
    await writeFile(output, 'aac finto');
  };
  return { converti, chiamate: () => chiamate };
}

const brano = (dir: string) => {
  const p = path.join(dir, 'brano.flac');
  writeFileSync(p, 'non importa cosa c\'è dentro');
  return { path: p, size: 5, fingerprint: 'abc123' };
};

test('vaTranscodificato: MP3 e AAC no, tutto il resto sì', () => {
  assert.equal(vaTranscodificato('mp3'), false);
  assert.equal(vaTranscodificato('aac'), false);
  assert.equal(vaTranscodificato('flac'), true);
  assert.equal(vaTranscodificato('alac'), true);
  assert.equal(vaTranscodificato('vorbis'), true);
  assert.equal(vaTranscodificato(null), true);
});

test('il file convertito prende il nome dall\'impronta, non dal percorso', async () => {
  const { dir, pulisci } = cartella();
  try {
    const t = brano(dir);
    assert.equal(await percorsoTranscodificato(t, dir), path.join(dir, 'abc123.m4a'));
    // Stesso contenuto altrove → stesso file in cache.
    assert.equal(await percorsoTranscodificato({ ...t, path: '/altrove/x.flac' }, dir), path.join(dir, 'abc123.m4a'));
  } finally { pulisci(); }
});

test('prima volta converte, seconda volta legge dalla cache', async () => {
  const { dir, pulisci } = cartella();
  try {
    const t = brano(dir);
    const f = convertitoreFinto();
    assert.equal(await giaPronto(t, dir), false);
    const out = await transcodedFile(t, { dir, converti: f.converti });
    assert.equal(out, path.join(dir, 'abc123.m4a'));
    assert.equal(await giaPronto(t, dir), true);
    await transcodedFile(t, { dir, converti: f.converti });
    assert.equal(f.chiamate(), 1, 'la seconda richiesta non deve riconvertire');
    // Niente file provvisori lasciati in giro.
    assert.deepEqual(readdirSync(dir).filter((n) => n.endsWith('.tmp')), []);
  } finally { pulisci(); }
});

test('due richieste insieme → una conversione sola', async () => {
  const { dir, pulisci } = cartella();
  try {
    const t = brano(dir);
    const f = convertitoreFinto();
    const a = transcodedFile(t, { dir, converti: f.converti });
    const b = transcodedFile(t, { dir, converti: f.converti });
    assert.equal(a, b, 'la seconda deve agganciarsi alla promise della prima');
    assert.equal(await a, await b);
    assert.equal(f.chiamate(), 1);
  } finally { pulisci(); }
});

test('se la conversione fallisce non resta nessun file, e si può riprovare', async () => {
  const { dir, pulisci } = cartella();
  try {
    const t = brano(dir);
    let volte = 0;
    const converti = async (_i: string, output: string) => {
      volte++;
      if (volte === 1) { await writeFile(output, 'mezzo'); throw new Error('ffmpeg finto: errore'); }
      await writeFile(output, 'intero');
    };
    await assert.rejects(transcodedFile(t, { dir, converti }), /errore/);
    assert.equal(readdirSync(dir).filter((n) => n !== 'brano.flac').length, 0, 'né .m4a né .tmp');
    const out = await transcodedFile(t, { dir, converti });
    assert.ok(existsSync(out));
    assert.equal(volte, 2);
  } finally { pulisci(); }
});

test('con ffmpeg vero: un FLAC diventa un AAC leggibile', async () => {
  const { dir, pulisci } = cartella();
  try {
    const src = path.join(dir, 'vero.flac');
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=1', '-c:a', 'flac', src]);
    const out = await transcodedFile({ path: src, size: 0, fingerprint: 'vero' }, { dir });
    const codec = execFileSync('ffprobe', [
      '-v', 'error', '-select_streams', 'a:0', '-show_entries', 'stream=codec_name', '-of', 'csv=p=0', out,
    ]).toString().trim();
    assert.equal(codec, 'aac');
  } finally { pulisci(); }
});

/* ── lato client: quale URL chiedere ── */

const chrome = (mime: string) => (mime.includes('alac') || mime.includes('wma') ? '' : 'probably');
const safari = (mime: string) => (mime.includes('ogg') ? '' : 'maybe');

test('urlBrano: scaricato batte tutto', () => {
  assert.equal(urlBrano(7, 'flac', { scaricato: true, qualita: 'risparmio', canPlay: chrome }), '/api/tracks/7/stream?offline');
});

test('urlBrano: originale se il browser lo legge e l\'utente non chiede risparmio', () => {
  assert.equal(urlBrano(7, 'flac', { scaricato: false, qualita: 'originale', canPlay: chrome }), '/api/tracks/7/stream');
});

test('urlBrano: risparmio dati → si chiede AAC (poi decide il server)', () => {
  assert.equal(urlBrano(7, 'flac', { scaricato: false, qualita: 'risparmio', canPlay: chrome }), '/api/tracks/7/stream?format=aac');
  assert.equal(urlBrano(7, 'mp3', { scaricato: false, qualita: 'risparmio', canPlay: chrome }), '/api/tracks/7/stream?format=aac');
});

test('urlBrano: formato illeggibile per QUESTO browser → AAC anche in qualità originale', () => {
  assert.equal(leggibile('alac', chrome), false);
  assert.equal(leggibile('alac', safari), true);
  assert.equal(leggibile('opus', safari), false);
  assert.equal(urlBrano(7, 'alac', { scaricato: false, qualita: 'originale', canPlay: chrome }), '/api/tracks/7/stream?format=aac');
  assert.equal(urlBrano(7, 'alac', { scaricato: false, qualita: 'originale', canPlay: safari }), '/api/tracks/7/stream');
});

test('urlBrano: codec sconosciuto → si prova l\'originale', () => {
  assert.equal(leggibile('boh', chrome), true);
  assert.equal(leggibile(null, chrome), true);
});
