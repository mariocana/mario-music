/**
 * scan.ts — il risultato di "Aggiorna libreria" in parole.
 *
 * Il server ripassa la cartella della musica (POST /api/scan) e dice quanti
 * file ha aggiunto, aggiornato, spostato o tolto. `refused` è la sua rete di
 * sicurezza: se sembrano spariti troppi file in un colpo (un disco non montato),
 * non cancella niente dal catalogo e lo segnala.
 */

export type ScanResult = {
  added: number;
  updated: number;
  skipped: number;
  failed: number;
  moved: number;
  removed: number;
  refused: number;
  total: number;
  ms: number;
};

function conta(n: number, uno: string, tanti: string): string {
  return `${n} ${n === 1 ? uno : tanti}`;
}

/** Una riga che riassume cosa è cambiato. */
export function riepilogoScan(r: ScanResult): string {
  const parti: string[] = [];
  if (r.added) parti.push(conta(r.added, 'brano aggiunto', 'brani aggiunti'));
  if (r.updated) parti.push(conta(r.updated, 'aggiornato', 'aggiornati'));
  if (r.moved) parti.push(conta(r.moved, 'spostato', 'spostati'));
  if (r.removed) parti.push(conta(r.removed, 'rimosso', 'rimossi'));
  const totale = conta(r.total, 'brano', 'brani');
  if (parti.length === 0) return `Nessuna novità: ${totale} in libreria.`;
  return `${parti.join(', ')}. Ora ${totale} in libreria.`;
}

/** Le cose andate storte, da mostrare a parte: vuoto se è filato tutto liscio. */
export function avvisiScan(r: ScanResult): string[] {
  const avvisi: string[] = [];
  if (r.failed) avvisi.push(`${conta(r.failed, 'file non leggibile', 'file non leggibili')}: controlla i log del server.`);
  if (r.refused) {
    avvisi.push(
      `${conta(r.refused, 'brano sembra sparito', 'brani sembrano spariti')}, ma non li ho tolti dal catalogo: ` +
      'la cartella della musica è raggiungibile dal server?',
    );
  }
  return avvisi;
}

/** Vale la pena ricaricare le schermate? Solo se il catalogo è cambiato davvero. */
export function catalogoCambiato(r: ScanResult): boolean {
  return r.added + r.updated + r.moved + r.removed > 0;
}
