/**
 * Test dello scanner su una libreria vera, in una cartella temporanea.
 *
 * I file audio li genera ffmpeg (mezzo secondo di sinusoide, frequenze
 * diverse, tag diversi): servono file leggibili da ffprobe con contenuti
 * distinti fra loro. Database in memoria e cartella copertine temporanea,
 * così non si tocca nulla della libreria reale.
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, renameSync, rmSync, unlinkSync, readdirSync, statSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { openDb } from '../server/db.ts';
import { scanLibrary, fingerprintFile } from '../server/scanner.ts';

type Ambiente = { lib: string; covers: string; db: ReturnType<typeof openDb>; scan: () => Promise<Awaited<ReturnType<typeof scanLibrary>>>; pulisci: () => void };

function brano(dest: string, hz: number, titolo: string, artista: string) {
  execFileSync('ffmpeg', [
    '-y', '-loglevel', 'error',
    '-f', 'lavfi', '-i', `sine=frequency=${hz}:duration=0.5`,
    '-metadata', `title=${titolo}`, '-metadata', `artist=${artista}`, '-metadata', `album=Prova`,
    '-c:a', 'libmp3lame', '-b:a', '64k', dest,
  ]);
}

function ambiente(): Ambiente {
  const radice = mkdtempSync(path.join(tmpdir(), 'mario-music-test-'));
  const lib = path.join(radice, 'library');
  const covers = path.join(radice, 'covers');
  mkdirSync(lib);
  brano(path.join(lib, 'uno.mp3'), 220, 'Uno', 'Artista');
  brano(path.join(lib, 'due.mp3'), 330, 'Due', 'Artista');
  brano(path.join(lib, 'tre.mp3'), 440, 'Tre', 'Artista');
  const db = openDb(':memory:');
  return {
    lib, covers, db,
    scan: () => scanLibrary({ libraryDir: lib, coversDir: covers, db }),
    pulisci: () => { db.close(); rmSync(radice, { recursive: true, force: true }); },
  };
}

const idDi = (a: Ambiente, titolo: string) =>
  (a.db.prepare('SELECT id FROM tracks WHERE title = ?').get(titolo) as { id: number } | undefined)?.id;

test('impronta: file diversi hanno impronte diverse, lo stesso file la stessa', async () => {
  const a = ambiente();
  try {
    const size = (f: string) => statSync(f).size;
    const uno = await fingerprintFile(path.join(a.lib, 'uno.mp3'), size(path.join(a.lib, 'uno.mp3')));
    const due = await fingerprintFile(path.join(a.lib, 'due.mp3'), size(path.join(a.lib, 'due.mp3')));
    const unoBis = await fingerprintFile(path.join(a.lib, 'uno.mp3'), size(path.join(a.lib, 'uno.mp3')));
    assert.notEqual(uno, due);
    assert.equal(uno, unoBis);
  } finally { a.pulisci(); }
});

test('primo scan: tre tracce, tutte con impronta', async () => {
  const a = ambiente();
  try {
    const r = await a.scan();
    assert.equal(r.added, 3);
    assert.equal(r.total, 3);
    const senza = (a.db.prepare('SELECT COUNT(*) n FROM tracks WHERE fingerprint IS NULL').get() as { n: number }).n;
    assert.equal(senza, 0);
  } finally { a.pulisci(); }
});

test('file spostato: stessa traccia, stesso id, preferito e ascolti intatti', async () => {
  const a = ambiente();
  try {
    await a.scan();
    const id = idDi(a, 'Due')!;
    a.db.prepare('INSERT INTO favorites (track_id, added_at) VALUES (?, ?)').run(id, Date.now());
    a.db.prepare('INSERT INTO plays (track_id, played_at) VALUES (?, ?)').run(id, Date.now());

    // lo si sposta in una sottocartella, con un altro nome
    mkdirSync(path.join(a.lib, 'Artista'));
    renameSync(path.join(a.lib, 'due.mp3'), path.join(a.lib, 'Artista', 'rinominato.mp3'));

    const r = await a.scan();
    assert.equal(r.moved, 1, 'deve riconoscerlo come spostamento');
    assert.equal(r.added, 0);
    assert.equal(r.removed, 0);
    assert.equal(r.total, 3);
    assert.equal(idDi(a, 'Due'), id, 'l\'id non cambia');
    assert.ok(a.db.prepare('SELECT 1 FROM favorites WHERE track_id = ?').get(id), 'il preferito resta');
    assert.equal((a.db.prepare('SELECT COUNT(*) n FROM plays WHERE track_id = ?').get(id) as { n: number }).n, 1);
    const percorso = (a.db.prepare('SELECT path FROM tracks WHERE id = ?').get(id) as { path: string }).path;
    assert.ok(percorso.endsWith(path.join('Artista', 'rinominato.mp3')), 'il percorso è quello nuovo');
  } finally { a.pulisci(); }
});

test('file duplicato (stesso contenuto in due posti): due tracce, nessuno spostamento', async () => {
  const a = ambiente();
  try {
    await a.scan();
    copyFileSync(path.join(a.lib, 'uno.mp3'), path.join(a.lib, 'uno-copia.mp3'));
    const r = await a.scan();
    assert.equal(r.moved, 0, 'l\'originale esiste ancora: non è uno spostamento');
    assert.equal(r.added, 1);
    assert.equal(r.total, 4);
  } finally { a.pulisci(); }
});

test('file cancellato: la traccia sparisce, e a cascata il suo preferito', async () => {
  const a = ambiente();
  try {
    await a.scan();
    const id = idDi(a, 'Tre')!;
    a.db.prepare('INSERT INTO favorites (track_id, added_at) VALUES (?, ?)').run(id, Date.now());
    unlinkSync(path.join(a.lib, 'tre.mp3'));
    const r = await a.scan();
    assert.equal(r.removed, 1);
    assert.equal(r.refused, 0);
    assert.equal(r.total, 2);
    assert.equal(a.db.prepare('SELECT 1 FROM favorites WHERE track_id = ?').get(id), undefined);
  } finally { a.pulisci(); }
});

test('freno: se sparisce (quasi) tutto, non cancella niente', async () => {
  const a = ambiente();
  try {
    // dieci tracce, perché sotto le dieci il freno non interviene
    for (let i = 4; i <= 10; i++) brano(path.join(a.lib, `n${i}.mp3`), 200 + i * 37, `N${i}`, 'Artista');
    await a.scan();
    assert.equal((a.db.prepare('SELECT COUNT(*) n FROM tracks').get() as { n: number }).n, 10);

    // "disco non montato": la cartella si svuota
    for (const f of readdirSync(a.lib)) unlinkSync(path.join(a.lib, f));

    const r = await a.scan();
    assert.equal(r.refused, 10, 'tutte e dieci le cancellazioni vanno rifiutate');
    assert.equal(r.removed, 0);
    assert.equal(r.total, 10, 'le tracce sono ancora lì');
  } finally { a.pulisci(); }
});

test('freno disattivato (maxRemovalRatio = 1): le cancellazioni passano', async () => {
  const a = ambiente();
  try {
    for (let i = 4; i <= 10; i++) brano(path.join(a.lib, `n${i}.mp3`), 200 + i * 37, `N${i}`, 'Artista');
    await a.scan();
    for (const f of readdirSync(a.lib)) unlinkSync(path.join(a.lib, f));
    const r = await scanLibrary({ libraryDir: a.lib, coversDir: a.covers, db: a.db, maxRemovalRatio: 1 });
    assert.equal(r.refused, 0);
    assert.equal(r.removed, 10);
    assert.equal(r.total, 0);
  } finally { a.pulisci(); }
});
