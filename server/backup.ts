/**
 * backup.ts — mettere al sicuro quello che non si può ricostruire.
 *
 * La libreria musicale ha 6 GB di file audio: non è questo il problema, quelli
 * esistono già altrove (o si ricomprano). Il problema è `data/`: playlist,
 * preferiti, ascolti e copertine caricate a mano. Non stanno dentro i file
 * audio, non si rigenerano con uno scan, e se il disco muore sono persi.
 *
 * COSA SI SALVA E COSA NO — la regola è una sola: si salva ciò che non si può
 * ricostruire.
 *   library.db          sì, è il contenitore di tutto
 *   playlist-covers/    sì, le hai caricate tu
 *   covers/             no, si riestraggono dai file audio con uno scan
 *   transcoded/         no, si riconverte
 *   media/library/      no, sono i tuoi file: vanno salvati a parte, non qui
 *
 * DUE FORMATI, NON UNO. Il `.db` è la copia completa e si ripristina in un
 * secondo. I JSON servono al caso peggiore: database illeggibile, versione di
 * SQLite che non apre più il file, o semplicemente una libreria ricostruita da
 * zero dove gli id sono tutti diversi. Per questo nei JSON i brani NON sono
 * indicati per id, ma per impronta del contenuto e percorso relativo: sono due
 * riferimenti che sopravvivono a una ricostruzione, l'id no.
 */
import { DatabaseSync } from 'node:sqlite';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { DATA_DIR, DB_PATH, openDb } from './db.ts';

export const BACKUP_DIR = process.env.BACKUP_DIR ?? path.join(DATA_DIR, 'backups');
/** Quanti backup tenere: i più vecchi si cancellano da soli. */
export const BACKUP_KEEP = Number(process.env.BACKUP_KEEP ?? 7);
const PREFISSO = 'mario-music-';

export type BackupOptions = {
  dir?: string;
  dbPath?: string;
  /** cartelle di dati da copiare così come sono (le copertine delle playlist) */
  dataDir?: string;
  keep?: number;
  /** per i test: l'istante da usare nel nome della cartella */
  now?: Date;
};

export type BackupResult = {
  dir: string;
  bytes: number;
  tracce: number;
  playlist: number;
  preferiti: number;
  ascolti: number;
  eliminati: string[];
  ms: number;
};

/** 2026-09-23T14:05:09Z → 2026-09-23_1405 : ordinabile e leggibile. */
function etichetta(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

/** Il percorso di un brano relativo alla libreria: più corto e più portatile. */
function relativo(file: string): string {
  const radice = path.resolve('media/library');
  return file.startsWith(radice) ? path.relative(radice, file) : file;
}

function pesoCartella(dir: string): number {
  let somma = 0;
  for (const voce of readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, voce.name);
    somma += voce.isDirectory() ? pesoCartella(p) : statSync(p).size;
  }
  return somma;
}

/** I backup esistenti, dal più recente. */
export function elencoBackup(dir = BACKUP_DIR): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((n) => n.startsWith(PREFISSO))
    .sort()
    .reverse();
}

/** Quando è stato fatto l'ultimo backup, o null se non ce ne sono. */
export function ultimoBackup(dir = BACKUP_DIR): number | null {
  const ultimo = elencoBackup(dir)[0];
  if (!ultimo) return null;
  return statSync(path.join(dir, ultimo)).mtimeMs;
}

export function creaBackup(opts: BackupOptions = {}): BackupResult {
  const t0 = Date.now();
  const dir = opts.dir ?? BACKUP_DIR;
  const dbPath = opts.dbPath ?? DB_PATH;
  const dataDir = opts.dataDir ?? DATA_DIR;
  const keep = opts.keep ?? BACKUP_KEEP;

  const dest = path.join(dir, PREFISSO + etichetta(opts.now ?? new Date()));
  mkdirSync(dest, { recursive: true });

  const db = openDb(dbPath);

  // VACUUM INTO scrive una copia compatta e coerente del database mentre il
  // server continua a usarlo. Copiare il file con cp sarebbe sbagliato: in
  // modalità WAL le ultime scritture stanno ancora nel file -wal, e la copia
  // arriverebbe monca senza dire niente.
  const copia = path.join(dest, 'library.db');
  db.prepare('VACUUM INTO ?').run(copia);

  const dati = esportaDati(db);
  writeFileSync(path.join(dest, 'playlists.json'), JSON.stringify(dati.playlists, null, 2));
  writeFileSync(path.join(dest, 'preferiti.json'), JSON.stringify(dati.preferiti, null, 2));
  writeFileSync(path.join(dest, 'ascolti.json'), JSON.stringify(dati.ascolti, null, 2));

  // Le copertine caricate a mano: le uniche immagini non rigenerabili.
  const copertine = path.join(dataDir, 'playlist-covers');
  if (existsSync(copertine)) cpSync(copertine, path.join(dest, 'playlist-covers'), { recursive: true });

  const tracce = (db.prepare('SELECT COUNT(*) AS n FROM tracks').get() as { n: number }).n;
  db.close();

  // Un backup che non si sa se è leggibile non è un backup: si apre la copia
  // appena scritta e le si chiede se sta bene.
  verificaBackup(dest, tracce);

  writeFileSync(path.join(dest, 'LEGGIMI.txt'), manifesto(dati, tracce, opts.now ?? new Date()));

  const eliminati = ruota(dir, keep);
  return {
    dir: dest,
    bytes: pesoCartella(dest),
    tracce,
    playlist: dati.playlists.length,
    preferiti: dati.preferiti.length,
    ascolti: dati.ascolti.length,
    eliminati,
    ms: Date.now() - t0,
  };
}

export class BackupCorrottoError extends Error {}

/** Apre la copia e verifica che sia integra e completa. */
export function verificaBackup(dir: string, tracceAttese?: number): { tracce: number } {
  const copia = path.join(dir, 'library.db');
  if (!existsSync(copia)) throw new BackupCorrottoError(`Manca library.db in ${dir}`);

  const db = new DatabaseSync(copia, { readOnly: true });
  try {
    const esito = db.prepare('PRAGMA integrity_check').get() as { integrity_check: string };
    if (esito.integrity_check !== 'ok') {
      throw new BackupCorrottoError(`Database di backup danneggiato: ${esito.integrity_check}`);
    }
    const tracce = (db.prepare('SELECT COUNT(*) AS n FROM tracks').get() as { n: number }).n;
    if (tracceAttese !== undefined && tracce !== tracceAttese) {
      throw new BackupCorrottoError(`La copia ha ${tracce} tracce invece di ${tracceAttese}`);
    }
    return { tracce };
  } finally {
    db.close();
  }
}

type Brano = { fingerprint: string | null; file: string };
type Esportazione = {
  playlists: Array<{ nome: string; creata: number; copertina: string | null; brani: Brano[] }>;
  preferiti: Array<Brano & { aggiunto: number }>;
  ascolti: Array<Brano & { quando: number }>;
};

/** Playlist, preferiti e ascolti in una forma che sopravvive agli id. */
export function esportaDati(db: DatabaseSync): Esportazione {
  const brani = db.prepare(`
    SELECT pt.playlist_id AS pid, t.fingerprint, t.path
    FROM playlist_tracks pt JOIN tracks t ON t.id = pt.track_id
    ORDER BY pt.playlist_id, pt.position
  `).all() as Array<{ pid: number; fingerprint: string | null; path: string }>;

  const playlists = (db.prepare(
    'SELECT id, name, created_at, cover_path FROM playlists ORDER BY created_at',
  ).all() as Array<{ id: number; name: string; created_at: number; cover_path: string | null }>).map((p) => ({
    nome: p.name,
    creata: p.created_at,
    copertina: p.cover_path ? path.basename(p.cover_path) : null,
    brani: brani.filter((b) => b.pid === p.id).map((b) => ({ fingerprint: b.fingerprint, file: relativo(b.path) })),
  }));

  const preferiti = (db.prepare(`
    SELECT t.fingerprint, t.path, f.added_at FROM favorites f JOIN tracks t ON t.id = f.track_id
    ORDER BY f.added_at
  `).all() as Array<{ fingerprint: string | null; path: string; added_at: number }>)
    .map((r) => ({ fingerprint: r.fingerprint, file: relativo(r.path), aggiunto: r.added_at }));

  const ascolti = (db.prepare(`
    SELECT t.fingerprint, t.path, p.played_at FROM plays p JOIN tracks t ON t.id = p.track_id
    ORDER BY p.played_at
  `).all() as Array<{ fingerprint: string | null; path: string; played_at: number }>)
    .map((r) => ({ fingerprint: r.fingerprint, file: relativo(r.path), quando: r.played_at }));

  return { playlists, preferiti, ascolti };
}

function manifesto(dati: Esportazione, tracce: number, quando: Date): string {
  return `Backup di mario-music — ${quando.toISOString()}

Contenuto
  library.db          il database completo (${tracce} tracce)
  playlists.json      ${dati.playlists.length} playlist, brani indicati per impronta e percorso
  preferiti.json      ${dati.preferiti.length} preferiti
  ascolti.json        ${dati.ascolti.length} ascolti
  playlist-covers/    le copertine caricate a mano

NON c'è la musica: i file audio vanno salvati a parte. Non ci sono le
copertine degli album né i file convertiti in AAC: si rigenerano da soli
con "npm run scan".

Ripristino completo (il caso normale)
  1. npm run stop
  2. copia library.db su data/library.db, e cancella data/library.db-wal
     e data/library.db-shm se ci sono
  3. copia playlist-covers/ su data/playlist-covers/
  4. npm start

Ripristino dei soli dati personali (database perso o libreria ricostruita)
  npm run restore <questa cartella>
  Riattacca playlist, preferiti e ascolti al database attuale, riconoscendo
  i brani dall'impronta del contenuto — quindi anche se i file sono stati
  spostati, rinominati o reimportati con id diversi.
`;
}

/** Tiene gli ultimi `keep` backup e cancella i più vecchi. */
function ruota(dir: string, keep: number): string[] {
  if (keep <= 0) return [];
  const vecchi = elencoBackup(dir).slice(keep);
  for (const nome of vecchi) rmSync(path.join(dir, nome), { recursive: true, force: true });
  return vecchi;
}

/* ────────────────────────── ripristino ────────────────────────── */

export type RipristinoResult = {
  playlist: number;
  preferiti: number;
  ascolti: number;
  /** brani del backup che non esistono più in libreria */
  mancanti: number;
};

/**
 * Riattacca playlist, preferiti e ascolti al database attuale.
 *
 * L'abbinamento va per **impronta del contenuto** e solo dopo per percorso:
 * è la stessa idea del riconoscimento degli spostamenti nello scanner. Un
 * brano rinominato o finito in un'altra cartella ha ancora la sua impronta;
 * il percorso invece cambia di continuo, ed è solo un ripiego per le tracce
 * indicizzate prima che le impronte esistessero.
 *
 * L'operazione è additiva e idempotente: i preferiti e gli ascolti già
 * presenti non si duplicano, le playlist con lo stesso nome non si
 * sovrascrivono — ne nasce una nuova con "(ripristinata)" nel nome, così un
 * ripristino sbagliato non cancella il lavoro di oggi.
 */
export type RipristinoOptions = {
  /** la cartella del backup, da cui recuperare le copertine delle playlist */
  da?: string;
  /** dove vivono le copertine nell'installazione attuale */
  versoCopertine?: string;
};

export function ripristinaDati(db: DatabaseSync, dati: Esportazione, opts: RipristinoOptions = {}): RipristinoResult {
  const perImpronta = new Map<string, number>();
  const perPercorso = new Map<string, number>();
  for (const r of db.prepare('SELECT id, fingerprint, path FROM tracks').all() as Array<{ id: number; fingerprint: string | null; path: string }>) {
    if (r.fingerprint) perImpronta.set(r.fingerprint, r.id);
    perPercorso.set(relativo(r.path), r.id);
  }
  let mancanti = 0;
  const trova = (b: Brano): number | null => {
    const id = (b.fingerprint ? perImpronta.get(b.fingerprint) : undefined) ?? perPercorso.get(b.file);
    if (id === undefined) { mancanti++; return null; }
    return id;
  };

  let playlist = 0;
  let preferiti = 0;
  let ascolti = 0;

  db.exec('BEGIN');
  try {
    const nomiEsistenti = new Set((db.prepare('SELECT name FROM playlists').all() as Array<{ name: string }>).map((r) => r.name));
    for (const p of dati.playlists) {
      // Anche le playlist vuote si ricreano: una playlist appena iniziata,
      // magari con la sua copertina, è lavoro tuo quanto le altre.
      const brani = p.brani.map(trova).filter((id): id is number => id !== null);
      const nome = nomiEsistenti.has(p.nome) ? `${p.nome} (ripristinata)` : p.nome;
      const id = Number(db.prepare(
        'INSERT INTO playlists (name, created_at, updated_at) VALUES (?, ?, ?)',
      ).run(nome, p.creata, Date.now()).lastInsertRowid);
      const ins = db.prepare('INSERT INTO playlist_tracks (playlist_id, track_id, position) VALUES (?, ?, ?)');
      brani.forEach((trackId, i) => ins.run(id, trackId, i));
      ripristinaCopertina(db, id, p.copertina, opts);
      playlist++;
    }

    const insPref = db.prepare('INSERT OR IGNORE INTO favorites (track_id, added_at) VALUES (?, ?)');
    for (const f of dati.preferiti) {
      const id = trova(f);
      if (id !== null) preferiti += insPref.run(id, f.aggiunto).changes ? 1 : 0;
    }

    // Un ascolto è una riga senza chiave naturale: per non raddoppiare la
    // cronologia rieseguendo il ripristino, si salta se esiste già un ascolto
    // dello stesso brano nello stesso istante.
    const esiste = db.prepare('SELECT 1 FROM plays WHERE track_id = ? AND played_at = ?');
    const insPlay = db.prepare('INSERT INTO plays (track_id, played_at) VALUES (?, ?)');
    for (const a of dati.ascolti) {
      const id = trova(a);
      if (id === null || esiste.get(id, a.quando)) continue;
      insPlay.run(id, a.quando);
      ascolti++;
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }

  return { playlist, preferiti, ascolti, mancanti };
}

/**
 * Rimette al suo posto la copertina caricata a mano. Il nome del file È la
 * sua chiave (`<impronta>.jpg`, vedi playlists.ts): basta ricopiarlo e
 * riscrivere le due colonne, senza rielaborare l'immagine con ffmpeg.
 */
function ripristinaCopertina(db: DatabaseSync, id: number, nomeFile: string | null, opts: RipristinoOptions) {
  if (!nomeFile || !opts.da) return;
  const origine = path.join(opts.da, 'playlist-covers', nomeFile);
  if (!existsSync(origine)) return;
  const dir = opts.versoCopertine ?? path.join(DATA_DIR, 'playlist-covers');
  mkdirSync(dir, { recursive: true });
  const dest = path.join(dir, nomeFile);
  if (!existsSync(dest)) cpSync(origine, dest);
  db.prepare('UPDATE playlists SET cover_path = ?, cover_key = ? WHERE id = ?')
    .run(dest, path.parse(nomeFile).name, id);
}

/** Legge i JSON di una cartella di backup. */
export function leggiBackup(dir: string): Esportazione {
  const leggi = <T>(nome: string): T => {
    const file = path.join(dir, nome);
    if (!existsSync(file)) throw new BackupCorrottoError(`Manca ${nome} in ${dir}`);
    return JSON.parse(readFileSync(file, 'utf8')) as T;
  };
  return {
    playlists: leggi('playlists.json'),
    preferiti: leggi('preferiti.json'),
    ascolti: leggi('ascolti.json'),
  };
}
