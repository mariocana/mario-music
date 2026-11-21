/**
 * HLS: la playlist calcolata dalla durata deve annunciare esattamente i pezzi
 * che ffmpeg scriverà, una conversione per brano anche con richieste insieme,
 * e chi chiede un pezzo aspetta che arrivi invece di ricevere un 404.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  attendiFile, avviaHls, hlsPronto, NOME_FILE, numeroSegmenti, playlistCalcolata, playlistPer,
} from '../server/hls.ts';

function cartella() {
  const dir = mkdtempSync(path.join(tmpdir(), 'mario-music-hls-'));
  return { dir, pulisci: () => rmSync(dir, { recursive: true, force: true }) };
}

const brano = (dir: string, fingerprint = 'abc123') => {
  const p = path.join(dir, `${fingerprint}.flac`);
  writeFileSync(p, 'non importa');
  return { path: p, size: 11, fingerprint };
};

const pausa = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Un finto ffmpeg che scrive i pezzi uno alla volta, come quello vero. */
function convertitoreFinto({ pezzi = 3, ritardo = 15, fallisci = false } = {}) {
  let chiamate = 0;
  const converti = async (_input: string, out: string) => {
    chiamate++;
    await writeFile(path.join(out, 'init.mp4'), 'init');
    for (let i = 0; i < pezzi; i++) {
      await pausa(ritardo);
      if (fallisci && i === 1) throw new Error('ffmpeg rotto');
      await writeFile(path.join(out, `${i}.m4s`), `pezzo ${i}`);
    }
    await writeFile(path.join(out, 'ffmpeg.m3u8'), '#EXTM3U\n#EXT-X-ENDLIST\n');
  };
  return { converti, chiamate: () => chiamate };
}

/* ── la playlist calcolata ── */

test('numero di pezzi: un pezzo ogni sei secondi, l\'ultimo più corto', () => {
  assert.equal(numeroSegmenti(213.67), 36);   // il FLAC provato: anche ffmpeg 36
  assert.equal(numeroSegmenti(6), 1);
  assert.equal(numeroSegmenti(6.5), 2);
  assert.equal(numeroSegmenti(1), 1);
});

test('numero di pezzi: casi di confine e valori non validi', () => {
  assert.equal(numeroSegmenti(12), 2);
  assert.equal(numeroSegmenti(12.01), 3);
  assert.equal(numeroSegmenti(0), 0);
  assert.equal(numeroSegmenti(Number.NaN), 0);
});

test('la playlist calcolata è un VOD completo, con pezzi relativi', () => {
  const pl = playlistCalcolata(14);
  assert.match(pl, /^#EXTM3U\n/);
  assert.match(pl, /#EXT-X-PLAYLIST-TYPE:VOD/);
  assert.match(pl, /#EXT-X-MAP:URI="init.mp4"/);
  assert.match(pl, /#EXT-X-ENDLIST\n$/);
  const pezzi = pl.split('\n').filter((r) => r.endsWith('.m4s'));
  assert.deepEqual(pezzi, ['0.m4s', '1.m4s', '2.m4s']);
  const durate = [...pl.matchAll(/#EXTINF:([\d.]+),/g)].map((m) => Number(m[1]));
  assert.deepEqual(durate, [6, 6, 2]);
});

test('la somma delle durate è la durata del brano', () => {
  for (const d of [3.2, 59.9, 213.67, 600]) {
    const somma = [...playlistCalcolata(d).matchAll(/#EXTINF:([\d.]+),/g)]
      .reduce((s, m) => s + Number(m[1]), 0);
    assert.ok(Math.abs(somma - d) < 0.01, `${d}: somma ${somma}`);
  }
});

test('solo init e pezzi numerati si possono chiedere', () => {
  assert.ok(NOME_FILE.test('init.mp4'));
  assert.ok(NOME_FILE.test('12.m4s'));
  for (const nome of ['../library.db', 'completo.m3u8', 'ffmpeg.m3u8', '1.m4s.tmp', 'x.m4s']) {
    assert.ok(!NOME_FILE.test(nome), nome);
  }
});

/* ── la conversione ── */

test('richieste insieme: una conversione sola', async () => {
  const { dir, pulisci } = cartella();
  try {
    const f = convertitoreFinto();
    const t = brano(dir);
    const [a, b] = await Promise.all([
      avviaHls(t, { dir, converti: f.converti }),
      avviaHls(t, { dir, converti: f.converti }),
    ]);
    await Promise.all([a.fine, b.fine]);
    assert.equal(f.chiamate(), 1);
    assert.equal(await hlsPronto(t, dir), true);
  } finally { pulisci(); }
});

test('il pezzo chiesto prima che esista arriva appena ffmpeg lo scrive', async () => {
  const { dir, pulisci } = cartella();
  try {
    const f = convertitoreFinto({ pezzi: 4, ritardo: 20 });
    const lavoro = await avviaHls(brano(dir), { dir, converti: f.converti });
    const file = await attendiFile(lavoro, '3.m4s', { attesa: 5 });
    assert.ok(file && existsSync(file));
  } finally { pulisci(); }
});

test('init.mp4 si consegna solo quando c\'è anche il primo pezzo', async () => {
  const { dir, pulisci } = cartella();
  try {
    const f = convertitoreFinto({ pezzi: 2, ritardo: 30 });
    const lavoro = await avviaHls(brano(dir), { dir, converti: f.converti });
    const file = await attendiFile(lavoro, 'init.mp4', { attesa: 5 });
    assert.ok(file);
    assert.ok(existsSync(path.join(lavoro.cartella, '0.m4s')));
  } finally { pulisci(); }
});

test('un pezzo oltre la fine: null, non un\'attesa infinita', async () => {
  const { dir, pulisci } = cartella();
  try {
    const f = convertitoreFinto({ pezzi: 2, ritardo: 5 });
    const lavoro = await avviaHls(brano(dir), { dir, converti: f.converti });
    assert.equal(await attendiFile(lavoro, '9.m4s', { attesa: 5 }), null);
  } finally { pulisci(); }
});

test('ffmpeg che fallisce: errore a chi aspetta, cartella pulita, si può riprovare', async () => {
  const { dir, pulisci } = cartella();
  try {
    const t = brano(dir);
    const rotto = convertitoreFinto({ fallisci: true });
    const lavoro = await avviaHls(t, { dir, converti: rotto.converti });
    await assert.rejects(attendiFile(lavoro, '2.m4s', { attesa: 5 }), /ffmpeg rotto/);
    await assert.rejects(lavoro.fine);
    assert.equal(existsSync(lavoro.cartella), false);

    const buono = convertitoreFinto();
    await (await avviaHls(t, { dir, converti: buono.converti })).fine;
    assert.equal(await hlsPronto(t, dir), true);
  } finally { pulisci(); }
});

test('conversione già fatta: niente ffmpeg, playlist esatta di ffmpeg', async () => {
  const { dir, pulisci } = cartella();
  try {
    const t = brano(dir);
    await (await avviaHls(t, { dir, converti: convertitoreFinto().converti })).fine;
    const f = convertitoreFinto();
    const lavoro = await avviaHls(t, { dir, converti: f.converti });
    await lavoro.fine;
    assert.equal(f.chiamate(), 0);
    const pl = await playlistPer(lavoro, 18);
    assert.ok('file' in pl && pl.file.endsWith('completo.m3u8'));
  } finally { pulisci(); }
});

test('durante la conversione la playlist è quella calcolata', async () => {
  const { dir, pulisci } = cartella();
  try {
    const lavoro = await avviaHls(brano(dir), { dir, converti: convertitoreFinto({ ritardo: 30 }).converti });
    const pl = await playlistPer(lavoro, 18);
    assert.ok('testo' in pl && pl.testo.includes('2.m4s'));
    await lavoro.fine;
  } finally { pulisci(); }
});

test('pezzi rimasti da un lavoro interrotto: si buttano e si rifà', async () => {
  const { dir, pulisci } = cartella();
  try {
    const t = brano(dir);
    const vecchia = path.join(dir, t.fingerprint);
    await mkdir(vecchia, { recursive: true });
    await writeFile(path.join(vecchia, '0.m4s'), 'mozzo');
    await writeFile(path.join(vecchia, '7.m4s'), 'di un altro giro');

    const f = convertitoreFinto({ pezzi: 2 });
    const lavoro = await avviaHls(t, { dir, converti: f.converti });
    // Il vecchio 0.m4s non deve uscire: la cartella è già stata svuotata.
    assert.equal(existsSync(path.join(vecchia, '7.m4s')), false);
    await lavoro.fine;
    assert.deepEqual(readdirSync(vecchia).sort(), ['0.m4s', '1.m4s', 'completo.m3u8', 'init.mp4']);
  } finally { pulisci(); }
});

/* ── con ffmpeg vero, se c'è ── */

const haFfmpeg = (() => {
  try { execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' }); return true; } catch { return false; }
})();

// La garanzia che conta: ogni pezzo annunciato dalla playlist calcolata
// esiste davvero. Le durate sono quelle dove ffmpeg aggiunge un pezzo quasi
// vuoto (i multipli esatti di sei) e una normale.
for (const durata of [12, 14, 18]) {
  test(`ffmpeg vero, ${durata} s: ogni pezzo annunciato viene scritto`, { skip: !haFfmpeg }, async () => {
    const { dir, pulisci } = cartella();
    try {
      const sorgente = path.join(dir, 'tono.flac');
      execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', `sine=frequency=440:duration=${durata}`, sorgente]);
      const lavoro = await avviaHls({ path: sorgente, size: 1, fingerprint: `tono${durata}` }, { dir });
      await lavoro.fine;
      const scritti = new Set(readdirSync(lavoro.cartella));
      for (const pezzo of playlistCalcolata(durata).split('\n').filter((r) => r.endsWith('.m4s'))) {
        assert.ok(scritti.has(pezzo), `${pezzo} annunciato ma non scritto`);
      }
    } finally { pulisci(); }
  });
}
