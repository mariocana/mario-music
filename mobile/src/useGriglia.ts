import { useWindowDimensions } from 'react-native';
import { griglia, larghezzaContenuto, type Griglia, type OpzioniGriglia } from './griglia';

/**
 * Larghezza della colonna di contenuto, aggiornata a ogni ridimensionamento.
 *
 * `Dimensions.get('window')` letto fuori dal componente fotografa la finestra
 * all'avvio: sul Mac, allargando la finestra, le copertine restavano della
 * misura iniziale. `useWindowDimensions` invece fa ridisegnare.
 */
export function useLarghezzaContenuto(): number {
  const { width } = useWindowDimensions();
  return larghezzaContenuto(width);
}

/** Colonne e larghezza delle celle per una griglia di copertine. */
export function useGriglia(opzioni?: OpzioniGriglia): Griglia {
  return griglia(useLarghezzaContenuto(), opzioni);
}
