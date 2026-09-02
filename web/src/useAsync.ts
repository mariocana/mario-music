import { useEffect, useState } from 'react';

type Result<T> = { data: T | null; error: string | null; loading: boolean };

/**
 * Carica dati asincroni con protezione dalle risposte fuori ordine: se
 * l'utente cambia schermata mentre una fetch è in volo, la risposta vecchia
 * viene ignorata invece di sovrascrivere quella nuova.
 */
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[]): Result<T> {
  const [state, setState] = useState<Result<T>>({ data: null, error: null, loading: true });

  useEffect(() => {
    let stale = false;
    setState((s) => ({ ...s, loading: true, error: null }));
    fn().then(
      (data) => { if (!stale) setState({ data, error: null, loading: false }); },
      (err: Error) => { if (!stale) setState({ data: null, error: err.message, loading: false }); },
    );
    return () => { stale = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return state;
}
