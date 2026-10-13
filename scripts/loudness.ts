/**
 * loudness.ts — il comando `npm run loudness`.
 *
 * Misura in un colpo solo tutti i brani che non hanno ancora un valore. Il
 * server fa lo stesso lavoro da sé, a piccoli lotti: questo serve quando si
 * vuole finire subito, per esempio dopo aver importato un disco intero.
 */
import { openDb } from '../server/db.ts';
import { analizzaMancanti, daMisurare } from '../server/loudness.ts';

const db = openDb();
const totale = daMisurare(db);
if (totale === 0) {
  console.log('Tutti i brani sono già misurati.');
  process.exit(0);
}

console.log(`Da misurare: ${totale} brani. Circa ${Math.ceil((totale * 1.4) / 3 / 60)} minuti.`);
let fatti = 0;
for (;;) {
  const r = await analizzaMancanti(db, { limite: 50 });
  if (r.misurati === 0 && r.falliti === 0) break;
  fatti += r.misurati + r.falliti;
  process.stdout.write(`\r  ${fatti}/${totale} — ${((fatti / totale) * 100).toFixed(0)}%`);
  if (r.restanti === 0) break;
}
process.stdout.write('\n');

const d = db.prepare(`
  SELECT ROUND(MIN(loudness), 1) AS minimo, ROUND(MAX(loudness), 1) AS massimo,
         ROUND(AVG(loudness), 1) AS media, COUNT(*) AS n
  FROM tracks WHERE loudness IS NOT NULL AND loudness < 0
`).get() as { minimo: number; massimo: number; media: number; n: number };
console.log(
  `Fatto. ${d.n} brani misurati: dal più sommesso (${d.minimo} LUFS) al più forte ` +
  `(${d.massimo} LUFS), in media ${d.media} LUFS.`,
);
