/**
 * backup.ts — il comando `npm run backup`.
 *
 * La logica sta in server/backup.ts, così lo stesso codice gira anche dal
 * server per il backup automatico giornaliero.
 */
import path from 'node:path';
import { creaBackup, elencoBackup, BACKUP_DIR, BACKUP_KEEP } from '../server/backup.ts';

const mb = (b: number) => `${(b / 1024 / 1024).toFixed(1)} MB`;

try {
  const r = creaBackup();
  console.log(
    `Backup in ${r.dir}\n` +
    `  ${r.tracce} tracce · ${r.playlist} playlist · ${r.preferiti} preferiti · ${r.ascolti} ascolti\n` +
    `  ${mb(r.bytes)} · verificato · ${(r.ms / 1000).toFixed(1)}s` +
    (r.eliminati.length ? `\n  eliminati i più vecchi: ${r.eliminati.join(', ')}` : '') +
    `\n  ne tengo ${BACKUP_KEEP}, adesso ce ne sono ${elencoBackup().length}`,
  );

  // L'avviso che conta: un backup sullo stesso disco muore con il disco.
  if (path.resolve(BACKUP_DIR).startsWith(path.resolve('data'))) {
    console.log(
      `\n⚠ Questo backup sta dentro data/, cioè sullo stesso disco dell'originale.\n` +
      `  Protegge da un errore tuo (una playlist cancellata per sbaglio), non da un\n` +
      `  disco rotto. Per quello serve un'altra destinazione — un disco esterno,\n` +
      `  un NAS, una cartella sincronizzata sul cloud:\n` +
      `    BACKUP_DIR=/percorso/su/un/altro/disco npm run backup`,
    );
  }
} catch (err) {
  console.error('Backup fallito:', err instanceof Error ? err.message : err);
  process.exit(1);
}
