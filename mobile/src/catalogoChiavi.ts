/**
 * catalogoChiavi.ts — quali risposte del server tenere per l'uso offline, e
 * con che nome di file. Solo conti, niente disco: si prova con i test.
 */

/**
 * Le risposte che servono a sfogliare la libreria. La ricerca no: ogni testo
 * cercato sarebbe un file in più, per sempre, e offline la schermata Cerca
 * guarda già nei brani scaricati.
 */
export function daMettereInCache(path: string): boolean {
  if (!path.startsWith('/api/')) return false;
  if (path.startsWith('/api/search')) return false;
  return true;
}

/**
 * Da un percorso a un nome di file. Ogni carattere che non sia lettera, cifra,
 * punto o trattino diventa `_` seguito dal suo codice: niente collisioni
 * (`/api/top?days=7` e `/api/top_days_7` restano diversi) e niente caratteri
 * che un file system potrebbe non gradire.
 */
export function nomeSicuro(testo: string): string {
  return testo.replace(/[^A-Za-z0-9.-]/g, (c) => `_${c.charCodeAt(0).toString(16)}`);
}

export function nomeFile(path: string): string {
  return `${nomeSicuro(path)}.json`;
}

/**
 * Una cartella per server: cambiando indirizzo nelle Impostazioni non si
 * mescolano i cataloghi di due librerie diverse.
 */
export function cartellaServer(base: string): string {
  return nomeSicuro(base.replace(/\/+$/, ''));
}
