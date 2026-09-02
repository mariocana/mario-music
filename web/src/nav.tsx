import { createContext, useContext } from 'react';

export type View =
  | { name: 'albums' }
  | { name: 'album'; id: number }
  | { name: 'artists' }
  | { name: 'artist'; id: number }
  | { name: 'songs' }
  | { name: 'downloads' }
  | { name: 'search'; q: string };

/** Navigazione minimale: niente router, solo uno stato in App più questo context. */
export const NavContext = createContext<(view: View) => void>(() => {});
export const useNavigate = () => useContext(NavContext);
