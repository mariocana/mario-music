/**
 * restore.ts — `npm run restore <cartella-di-backup>`.
 *
 * Non rimpiazza il database: ci riattacca dentro playlist, preferiti e
 * ascolti, riconoscendo i brani dall'impronta del contenuto. Serve quando la
 * libreria è stata ricostruita da zero e gli id non sono più quelli.
 *
 * Per il ripristino completo (database perso) non serve un comando: si copia
 * library.db dalla cartella di backup a data/. Le istruzioni sono nel
 * LEGGIMI.txt di ogni backup.
 */
import { openDb } from '../server/db.ts';
import { leggiBackup, ripristinaDati, elencoBackup, BACKUP_DIR } from '../server/backup.ts';
import path from 'node:path';

const argomento = process.argv[2];
if (!argomento) {
  const disponibili = elencoBackup();
  console.error(
    'Uso: npm run restore <cartella-di-backup>\n' +
    (disponibili.length
      ? `\nBackup disponibili in ${BACKUP_DIR}:\n` + disponibili.map((n) => `  ${n}`).join('\n')
      : `\nNessun backup in ${BACKUP_DIR}. Lancia prima: npm run backup`),
  );
  process.exit(1);
}

// Si accetta sia il percorso completo sia il solo nome della cartella.
const dir = path.isAbsolute(argomento) || argomento.includes('/')
  ? argomento
  : path.join(BACKUP_DIR, argomento);

try {
  const dati = leggiBackup(dir);
  const db = openDb();
  const r = ripristinaDati(db, dati, { da: dir });
  db.close();
  console.log(
    `Ripristinati da ${dir}\n` +
    `  ${r.playlist} playlist · ${r.preferiti} preferiti · ${r.ascolti} ascolti`,
  );
  if (r.mancanti) {
    console.log(
      `  ⚠ ${r.mancanti} riferimenti a brani che non sono più in libreria: ignorati.\n` +
      `    Se la musica c'è ma non è indicizzata, lancia "npm run scan" e ripeti.`,
    );
  }
  console.log('\nIl ripristino è ripetibile: preferiti e ascolti già presenti non si duplicano.');
} catch (err) {
  console.error('Ripristino fallito:', err instanceof Error ? err.message : err);
  process.exit(1);
}
