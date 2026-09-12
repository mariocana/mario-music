/**
 * scan.ts — il comando `npm run scan`.
 *
 * La logica vera sta in server/scanner.ts, così può girare anche dentro al
 * server (scan periodico e pulsante "Aggiorna libreria") senza duplicazioni.
 */
import { scanLibrary, LibraryMissingError } from '../server/scanner.ts';

try {
  const r = await scanLibrary({
    onFile: (line) => process.stdout.write(`${line}\n`),
    // SCAN_MAX_REMOVAL=1 disattiva il freno: serve quando la cancellazione
    // massiccia è davvero voluta (hai tolto mezza libreria di proposito).
    maxRemovalRatio: process.env.SCAN_MAX_REMOVAL ? Number(process.env.SCAN_MAX_REMOVAL) : undefined,
  });
  console.log(
    `\nAggiunte ${r.added}, aggiornate ${r.updated}, invariate ${r.skipped}, rimosse ${r.removed}` +
    (r.moved ? `, spostate ${r.moved}` : '') +
    (r.failed ? `, saltate ${r.failed}` : '') + '.' +
    (r.refused ? `\n⚠ ${r.refused} cancellazioni rifiutate: troppe in un colpo solo.` : '') +
    `\nIn libreria: ${r.total} tracce. (${(r.ms / 1000).toFixed(1)}s)`,
  );
} catch (err) {
  if (err instanceof LibraryMissingError) {
    console.error(`${err.message}. Lancia prima: npm run seed`);
    process.exit(1);
  }
  console.error(err);
  process.exit(1);
}
