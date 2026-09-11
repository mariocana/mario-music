/**
 * AddMenu.tsx — il menù "⋯" sui brani e sugli album.
 *
 * Sostituisce il pulsante "riproduci dopo" invece di affiancarsi: una riga a
 * 375px non regge un'altra colonna, e raccogliere le azioni in un menù ne fa
 * stare quante se ne vuole senza rubare spazio al titolo.
 *
 * Il pannello è `position: fixed` con le coordinate prese dal pulsante: dentro
 * una lista che scorre, un pannello in posizione assoluta verrebbe tagliato
 * dal contenitore.
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Track } from '../api.ts';
import { usePlayer } from '../player.tsx';
import { usePlaylists } from '../playlists.tsx';
import { useListening } from '../listening.tsx';
import { useNavigate } from '../nav.tsx';
import { Icon } from './Icon.tsx';
import type { IconName } from './Icon.tsx';

/** Voce extra del menù, fornita da chi usa la lista (es. una playlist). */
export type VoceMenu = {
  label: string;
  icon: IconName;
  onClick: () => void;
  disabled?: boolean;
};

type Props = {
  tracks: Track[];
  /**
   * Azioni proprie del contesto, in cima al menù. Stanno qui e non come
   * pulsanti in riga: cinque simboli affiancati su ogni traccia erano
   * troppi, e in un menù ce ne stanno quanti se ne vuole.
   */
  voci?: VoceMenu[];
  /**
   * Se mostrare "Aggiungi a playlist". Ha senso per brani e album; per una
   * playlist no — e "aggiungi a se stessa" è proprio senza senso.
   */
  playlistTarget?: boolean;
  /**
   * Vero quando il menù è quello di UNA riga di brano: mostra preferiti e
   * "vai a…". Si dichiara, non si deduce dal numero di tracce — un album da
   * un brano solo veniva scambiato per una traccia, con "Vai all'album"
   * dentro l'album stesso.
   */
  singleTrack?: boolean;
  /** 'icon' per le righe dei brani, 'button' per la testata dell'album */
  variant?: 'icon' | 'button';
  label?: string;
};

export function AddMenu({ tracks, voci = [], playlistTarget = true, singleTrack = false, variant = 'icon', label = 'Aggiungi' }: Props) {
  const player = usePlayer();
  const playlists = usePlaylists();
  const navigate = useNavigate();
  const ascolti = useListening();
  const [aperto, setAperto] = useState(false);
  const [nuova, setNuova] = useState(false);
  const [nome, setNome] = useState('');
  const [esito, setEsito] = useState<string | null>(null);
  const [posizione, setPosizione] = useState({ top: 0, left: 0 });

  const bottoneRef = useRef<HTMLButtonElement>(null);
  const pannelloRef = useRef<HTMLDivElement>(null);

  // Si posiziona sotto al pulsante, rientrando se sborda dallo schermo.
  useLayoutEffect(() => {
    if (!aperto || !bottoneRef.current) return;
    const b = bottoneRef.current.getBoundingClientRect();
    const larghezza = 240;
    const altezzaStimata = 260;
    const sotto = b.bottom + altezzaStimata < window.innerHeight;
    setPosizione({
      top: sotto ? b.bottom + 6 : Math.max(8, b.top - altezzaStimata - 6),
      left: Math.min(Math.max(8, b.right - larghezza), window.innerWidth - larghezza - 8),
    });
  }, [aperto]);

  useEffect(() => {
    if (!aperto) return;
    const fuori = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!pannelloRef.current?.contains(t) && !bottoneRef.current?.contains(t)) chiudi();
    };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') chiudi(); };
    document.addEventListener('pointerdown', fuori);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('pointerdown', fuori);
      document.removeEventListener('keydown', esc);
    };
  }, [aperto]);

  function chiudi() {
    setAperto(false);
    setNuova(false);
    setNome('');
  }

  /** Mostra per un attimo cos'è successo, poi chiude. */
  async function aggiungiA(id: number, nomePlaylist: string) {
    try {
      const quanti = await playlists.addTracks(id, tracks.map((t) => t.id));
      setEsito(`${quanti === 1 ? 'Aggiunto' : `Aggiunti ${quanti}`} a ${nomePlaylist}`);
      setTimeout(() => { setEsito(null); chiudi(); }, 900);
    } catch (err) {
      setEsito(err instanceof Error ? err.message : 'Errore');
    }
  }

  async function creaEAggiungi() {
    const pulito = nome.trim();
    if (!pulito) return;
    const creata = await playlists.create(pulito);
    if (creata) await aggiungiA(creata.id, creata.name);
  }

  // Senza tracce il menù ha senso solo se chi lo usa gli dà delle voci sue:
  // una playlist vuota deve comunque potersi rinominare o eliminare.
  if (tracks.length === 0 && voci.length === 0) return null;
  const conTracce = tracks.length > 0;

  return (
    <>
      <button
        ref={bottoneRef}
        className={variant === 'icon' ? 'icon track-menu' : 'ghost'}
        onClick={() => setAperto((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={aperto}
        title={variant === 'icon' ? 'Altre azioni' : label}
      >
        {variant === 'icon' ? <Icon name="more" size={16} /> : <><Icon name="plus" size={15} /> {label}</>}
      </button>

      {aperto && (
        <div
          ref={pannelloRef}
          className="menu"
          role="menu"
          style={{ top: posizione.top, left: posizione.left }}
        >
          {esito ? (
            <p className="menu-esito">{esito}</p>
          ) : (
            <>
              {singleTrack && tracks.length === 1 && (
                <button
                  className="menu-voce"
                  onClick={() => { void ascolti.toggleFavorite(tracks[0]); chiudi(); }}
                >
                  <Icon name={ascolti.isFavorite(tracks[0].id) ? 'heartFilled' : 'heart'} size={15} />
                  {ascolti.isFavorite(tracks[0].id) ? 'Togli dai preferiti' : 'Aggiungi ai preferiti'}
                </button>
              )}

              {voci.map((v) => (
                <button
                  key={v.label}
                  className="menu-voce"
                  disabled={v.disabled}
                  onClick={() => { v.onClick(); chiudi(); }}
                >
                  <Icon name={v.icon} size={15} /> {v.label}
                </button>
              ))}
              {voci.length > 0 && conTracce && <div className="menu-separatore" />}

              {conTracce && (
              <button
                className="menu-voce"
                onClick={() => { tracks.forEach((t) => player.playNext(t)); chiudi(); }}
              >
                <Icon name="queueNext" size={15} /> Riproduci dopo
              </button>
              )}

              {singleTrack && tracks.length === 1 && (
                <>
                  <button
                    className="menu-voce"
                    onClick={() => { navigate({ name: 'album', id: tracks[0].albumId }); chiudi(); }}
                  ><Icon name="queue" size={15} /> Vai all'album</button>
                  <button
                    className="menu-voce"
                    onClick={() => { navigate({ name: 'artist', id: tracks[0].artistId }); chiudi(); }}
                  ><Icon name="playlist" size={15} /> Vai all'artista</button>
                </>
              )}

              {conTracce && playlistTarget && (<>
              <div className="menu-titolo">Aggiungi a playlist</div>

              <div className="menu-lista">
                {playlists.items.length === 0 && !nuova && (
                  <p className="menu-vuoto">Nessuna playlist</p>
                )}
                {playlists.items.map((p) => (
                  <button key={p.id} className="menu-voce" onClick={() => void aggiungiA(p.id, p.name)}>
                    <Icon name="playlist" size={15} />
                    <span className="menu-nome">{p.name}</span>
                    <span className="dim">{p.trackCount}</span>
                  </button>
                ))}
              </div>

              {nuova ? (
                <form
                  className="menu-nuova"
                  onSubmit={(e) => { e.preventDefault(); void creaEAggiungi(); }}
                >
                  <input
                    autoFocus
                    className="search"
                    placeholder="Nome della playlist"
                    value={nome}
                    onChange={(e) => setNome(e.target.value)}
                  />
                  <button className="primary" type="submit" disabled={!nome.trim()}>Crea</button>
                </form>
              ) : (
                <button className="menu-voce menu-nuova-avvia" onClick={() => setNuova(true)}>
                  <Icon name="plus" size={15} /> Nuova playlist…
                </button>
              )}
              </>)}
            </>
          )}
        </div>
      )}
    </>
  );
}
