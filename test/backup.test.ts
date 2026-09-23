/**
 * Backup e ripristino.
 *
 * Il test che vale per tutti è l'ultimo: si fa un backup, si butta via il
 * database, si ricostruisce la libreria da zero con id diversi e percorsi
 * cambiati, e si verifica che playlist, preferiti e ascolti tornino al loro
 * posto. Un backup che non è mai stato ripristinato non si sa se funziona.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, mkdirSync, rmSync, existsSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { openDb } from '../server/db.ts';
import {
  creaBackup, verificaBackup, leggiBackup, ripristinaDati, esportaDati,
  elencoBackup, BackupCorrottoError,
} from '../server/backup.ts';

function ambiente() {
  const radice = mkdtempSync(path.join(tmpdir(), 'mario-music-backup-'));
  const dbPath = path.join(radice, 'library.db');
  const backups = path.join(radice, 'backups');
  return { radice, dbPath, backups, pulisci: () => rmSync(radice, { recursive: true, force: true }) };
}

/** Una libreria con due brani, una playlist, un preferito e tre ascolti. */
function popola(dbPath: string, percorsi = ['/musica/uno.mp3', '/musica/due.mp3']) {
  const db = openDb(dbPath);
  db.exec(`
    INSERT INTO artists (id, name) VALUES (1, 'Tizio');
    INSERT INTO albums (id, artist_id, title) VALUES (10, 1, 'Album');
  `);
  const ins = db.prepare(`
    INSERT INTO tracks (album_id, artist_id, title, track_no, disc_no, duration, path, size, mtime, mime, fingerprint)
    VALUES (10, 1, ?, ?, 1, 200, ?, 1000, 1, 'audio/mpeg', ?)
  `);
  const a = Number(ins.run('Uno', 1, percorsi[0], 'impronta-uno').lastInsertRowid);
  const b = Number(ins.run('Due', 2, percorsi[1], 'impronta-due').lastInsertRowid);

  db.prepare('INSERT INTO playlists (id, name, created_at, updated_at) VALUES (1, ?, 100, 100)').run('La mia');
  db.prepare('INSERT INTO playlist_tracks (playlist_id, track_id, position) VALUES (1, ?, 0)').run(b);
  db.prepare('INSERT INTO playlist_tracks (playlist_id, track_id, position) VALUES (1, ?, 1)').run(a);
  db.prepare('INSERT INTO favorites (track_id, added_at) VALUES (?, 500)').run(a);
  for (const t of [1000, 2000, 3000]) db.prepare('INSERT INTO plays (track_id, played_at) VALUES (?, ?)').run(a, t);
  return { db, a, b };
}

test('il backup contiene database, JSON e istruzioni, ed è verificato', () => {
  const env = ambiente();
  try {
    popola(env.dbPath).db.close();
    const r = creaBackup({ dir: env.backups, dbPath: env.dbPath, dataDir: env.radice });

    const dentro = readdirSync(r.dir).sort();
    assert.deepEqual(dentro, ['LEGGIMI.txt', 'ascolti.json', 'library.db', 'playlists.json', 'preferiti.json']);
    assert.equal(r.tracce, 2);
    assert.equal(r.playlist, 1);
    assert.equal(r.preferiti, 1);
    assert.equal(r.ascolti, 3);
    assert.equal(verificaBackup(r.dir).tracce, 2);
  } finally { env.pulisci(); }
});

test('nei JSON i brani sono indicati per impronta, non per id', () => {
  const env = ambiente();
  try {
    const { db } = popola(env.dbPath);
    const dati = esportaDati(db);
    db.close();
    assert.deepEqual(dati.playlists[0].brani.map((b) => b.fingerprint), ['impronta-due', 'impronta-uno']);
    assert.ok(!JSON.stringify(dati).includes('"id"'));
  } finally { env.pulisci(); }
});

test('un backup danneggiato viene riconosciuto, non servito come buono', () => {
  const env = ambiente();
  try {
    popola(env.dbPath).db.close();
    const r = creaBackup({ dir: env.backups, dbPath: env.dbPath, dataDir: env.radice });
    writeFileSync(path.join(r.dir, 'library.db'), 'non sono un database');
    assert.throws(() => verificaBackup(r.dir), /danneggiato|file is not a database|Database/i);
  } finally { env.pulisci(); }
});

test('la rotazione tiene i più recenti e cancella i più vecchi', () => {
  const env = ambiente();
  try {
    popola(env.dbPath).db.close();
    const fatti = [1, 2, 3, 4].map((giorno) => creaBackup({
      dir: env.backups, dbPath: env.dbPath, dataDir: env.radice, keep: 2,
      now: new Date(2026, 0, giorno, 12, 0, 0),
    }));
    const rimasti = elencoBackup(env.backups);
    assert.equal(rimasti.length, 2);
    assert.ok(existsSync(fatti[3].dir));
    assert.ok(existsSync(fatti[2].dir));
    assert.ok(!existsSync(fatti[0].dir), 'il più vecchio doveva sparire');
  } finally { env.pulisci(); }
});

test('giro completo: backup, libreria persa e ricostruita altrove, ripristino', () => {
  const env = ambiente();
  try {
    popola(env.dbPath).db.close();
    const r = creaBackup({ dir: env.backups, dbPath: env.dbPath, dataDir: env.radice });

    // Il disastro: database perso. Si ricostruisce da zero, e nel frattempo
    // i file sono stati riorganizzati in altre cartelle — quindi id diversi
    // E percorsi diversi. Resta solo l'impronta del contenuto.
    rmSync(env.dbPath, { force: true });
    const nuovo = path.join(env.radice, 'ricostruito.db');
    const { db } = popola(nuovo, ['/altrove/Tizio/01 Uno.mp3', '/altrove/Tizio/02 Due.mp3']);
    db.exec('DELETE FROM playlist_tracks; DELETE FROM playlists; DELETE FROM favorites; DELETE FROM plays');

    const esito = ripristinaDati(db, leggiBackup(r.dir));
    assert.deepEqual(
      { playlist: esito.playlist, preferiti: esito.preferiti, ascolti: esito.ascolti, mancanti: esito.mancanti },
      { playlist: 1, preferiti: 1, ascolti: 3, mancanti: 0 },
    );

    // E l'ordine della playlist è quello di prima: 'Due' poi 'Uno'.
    const ordine = db.prepare(`
      SELECT t.title FROM playlist_tracks pt JOIN tracks t ON t.id = pt.track_id ORDER BY pt.position
    `).all() as Array<{ title: string }>;
    assert.deepEqual(ordine.map((r) => r.title), ['Due', 'Uno']);
    db.close();
  } finally { env.pulisci(); }
});

test('ripristinare due volte non raddoppia niente', () => {
  const env = ambiente();
  try {
    const { db } = popola(env.dbPath);
    db.close();
    const r = creaBackup({ dir: env.backups, dbPath: env.dbPath, dataDir: env.radice });
    const dati = leggiBackup(r.dir);

    const db2 = openDb(env.dbPath);
    ripristinaDati(db2, dati);
    ripristinaDati(db2, dati);
    const conta = (t: string) => (db2.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get() as { n: number }).n;
    // I preferiti e gli ascolti restano quelli: già presenti, non si duplicano.
    assert.equal(conta('favorites'), 1);
    assert.equal(conta('plays'), 3);
    // Le playlist invece si affiancano, col nome marcato: un ripristino
    // sbagliato non deve cancellare quella su cui stavi lavorando.
    const nomi = (db2.prepare('SELECT name FROM playlists ORDER BY id').all() as Array<{ name: string }>).map((r) => r.name);
    assert.deepEqual(nomi, ['La mia', 'La mia (ripristinata)', 'La mia (ripristinata)']);
    db2.close();
  } finally { env.pulisci(); }
});

test('un backup senza JSON non si finge ripristinabile', () => {
  const env = ambiente();
  try {
    assert.throws(() => leggiBackup(env.radice), BackupCorrottoError);
  } finally { env.pulisci(); }
});

test('la copertina caricata a mano torna al suo posto', () => {
  const env = ambiente();
  try {
    const { db } = popola(env.dbPath);
    // Una copertina come la salva l'app: il nome del file è la sua chiave.
    const copertine = path.join(env.radice, 'playlist-covers');
    mkdirSync(copertine, { recursive: true });
    writeFileSync(path.join(copertine, 'abc123.jpg'), 'finta immagine');
    db.prepare('UPDATE playlists SET cover_path = ?, cover_key = ? WHERE id = 1')
      .run(path.join(copertine, 'abc123.jpg'), 'abc123');
    db.close();

    const r = creaBackup({ dir: env.backups, dbPath: env.dbPath, dataDir: env.radice });
    assert.ok(existsSync(path.join(r.dir, 'playlist-covers', 'abc123.jpg')), 'la copertina va nel backup');

    // Ripristino su una libreria nuova, con la cartella delle copertine vuota.
    const nuovo = path.join(env.radice, 'nuovo.db');
    const { db: db2 } = popola(nuovo);
    db2.exec('DELETE FROM playlist_tracks; DELETE FROM playlists');
    const destCopertine = path.join(env.radice, 'copertine-nuove');
    ripristinaDati(db2, leggiBackup(r.dir), { da: r.dir, versoCopertine: destCopertine });

    const p = db2.prepare('SELECT cover_key AS k, cover_path AS f FROM playlists').get() as { k: string; f: string };
    assert.equal(p.k, 'abc123');
    assert.ok(existsSync(p.f), 'il file della copertina è stato ricopiato');
    db2.close();
  } finally { env.pulisci(); }
});

test('anche una playlist ancora vuota si ripristina', () => {
  const env = ambiente();
  try {
    const { db } = popola(env.dbPath);
    db.prepare('INSERT INTO playlists (name, created_at, updated_at) VALUES (?, 200, 200)').run('Appena iniziata');
    db.close();
    const r = creaBackup({ dir: env.backups, dbPath: env.dbPath, dataDir: env.radice });

    const nuovo = path.join(env.radice, 'vuoto.db');
    const { db: db2 } = popola(nuovo);
    db2.exec('DELETE FROM playlist_tracks; DELETE FROM playlists');
    ripristinaDati(db2, leggiBackup(r.dir), { da: r.dir });
    const nomi = (db2.prepare('SELECT name FROM playlists ORDER BY id').all() as Array<{ name: string }>).map((x) => x.name);
    assert.deepEqual(nomi, ['La mia', 'Appena iniziata']);
    db2.close();
  } finally { env.pulisci(); }
});
