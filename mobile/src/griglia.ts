/**
 * Misure del layout che dipendono dalla larghezza della finestra.
 *
 * Su iPhone la finestra è larga ~390 punti e due colonne di copertine vanno
 * bene. Su iPad, e soprattutto sul Mac dove la finestra si ridimensiona, due
 * colonne fisse producono copertine da 500 punti: qui si decide quante
 * colonne entrano tenendo ogni copertina fra un minimo e un massimo.
 *
 * Funzioni pure, senza React Native, così i test girano con node:test.
 */

/** Larghezza massima della colonna di contenuto: oltre, le righe dei brani
 *  diventano troppo lunghe da leggere e il contenuto resta centrato. */
export const LARGHEZZA_MASSIMA_CONTENUTO = 960;

/** Il mini player non ha bisogno di tutta la colonna. */
export const LARGHEZZA_MASSIMA_MINI_PLAYER = 640;

/** Larghezza utile per il contenuto, data quella della finestra. */
export function larghezzaContenuto(finestra: number): number {
  if (!Number.isFinite(finestra) || finestra <= 0) return 0;
  return Math.min(finestra, LARGHEZZA_MASSIMA_CONTENUTO);
}

export type OpzioniGriglia = {
  /** Margine a sinistra e a destra della griglia. */
  margine?: number;
  /** Spazio fra una colonna e l'altra. */
  spazio?: number;
  /** Sotto questa larghezza una copertina è troppo piccola: meno colonne. */
  minimo?: number;
  /** Sopra questa larghezza una copertina è troppo grande: più colonne. */
  massimo?: number;
  /** Colonne di partenza, anche se le copertine restano più strette del minimo. */
  colonneMinime?: number;
};

export type Griglia = { colonne: number; larghezzaCella: number };

/**
 * Quante colonne e quanto larga ogni cella.
 *
 * Si parte dal numero di colonne più alto che rispetta il minimo; se anche
 * così le celle superano il massimo (succede solo con finestre enormi e un
 * minimo vicino al massimo) si aggiunge una colonna alla volta.
 */
export function griglia(larghezza: number, opzioni: OpzioniGriglia = {}): Griglia {
  const {
    margine = 16,
    spazio = 16,
    minimo = 150,
    massimo = 220,
    colonneMinime = 2,
  } = opzioni;

  const utile = Math.max(0, larghezza - 2 * margine);
  const cella = (colonne: number) => Math.floor((utile - spazio * (colonne - 1)) / colonne);

  // n colonne entrano se n*minimo + (n-1)*spazio <= utile
  let colonne = Math.max(colonneMinime, Math.floor((utile + spazio) / (minimo + spazio)));
  while (cella(colonne) > massimo) colonne++;

  return { colonne, larghezzaCella: Math.max(0, cella(colonne)) };
}
