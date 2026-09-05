/**
 * scan.ts — il comando `npm run scan`.
 *
 * La logica vera sta in server/scanner.ts, così può girare anche dentro al
 * server (scan periodico e pulsante "Aggiorna libreria") senza duplicazioni.
 */
import { scanLibrary, LibraryMissingError } from '../server/scanner.ts';

try {
  const r = await scanLibrary((line) => process.stdout.write(`${line}\n`));
  console.log(
    `\nAggiunte ${r.added}, aggiornate ${r.updated}, invariate ${r.skipped}, rimosse ${r.removed}.` +
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
