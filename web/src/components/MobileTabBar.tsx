/**
 * MobileTabBar.tsx — la barra in fondo al telefono, sul modello di Apple Music.
 *
 * Una pillola con quattro schede (icona sopra, etichetta sotto) e, a parte,
 * un cerchio per la ricerca. Otto etichette in fila stavano nei 393px per un
 * pelo, a 47px l'una: leggibili ma strette, e nessuna gerarchia. Qui le
 * sezioni secondarie stanno dentro "Libreria", come fa Apple.
 */
import type { View } from '../nav.tsx';
import { Icon } from './Icon.tsx';
import type { IconName } from './Icon.tsx';

type Scheda = {
  label: string;
  icon: IconName;
  target: View;
  /** le viste per cui la scheda risulta selezionata */
  attivaPer: View['name'][];
};

const SCHEDE: Scheda[] = [
  { label: 'Album', icon: 'grid', target: { name: 'albums' }, attivaPer: ['albums', 'album'] },
  {
    label: 'Libreria', icon: 'library', target: { name: 'library' },
    attivaPer: ['library', 'artists', 'artist', 'songs', 'listening', 'downloads'],
  },
  { label: 'Playlist', icon: 'playlist', target: { name: 'playlists' }, attivaPer: ['playlists', 'playlist'] },
  { label: 'Preferiti', icon: 'heart', target: { name: 'favorites' }, attivaPer: ['favorites'] },
];

export function MobileTabBar({ view, onNav }: { view: View; onNav: (v: View) => void }) {
  return (
    <nav className="tabbar" aria-label="Sezioni">
      <div className="tabbar-pill">
        {SCHEDE.map((s) => {
          const attiva = s.attivaPer.includes(view.name);
          return (
            <button
              key={s.label}
              className={`tabbar-item ${attiva ? 'is-current' : ''}`}
              onClick={() => onNav(s.target)}
              aria-current={attiva ? 'page' : undefined}
            >
              <Icon name={attiva && s.icon === 'heart' ? 'heartFilled' : s.icon} size={22} />
              <span>{s.label}</span>
            </button>
          );
        })}
      </div>

      <button
        className={`tabbar-search ${view.name === 'search' ? 'is-current' : ''}`}
        onClick={() => onNav({ name: 'search' })}
        aria-label="Cerca"
        aria-current={view.name === 'search' ? 'page' : undefined}
      >
        <Icon name="search" size={22} />
      </button>
    </nav>
  );
}
