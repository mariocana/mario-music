/**
 * Karaoke.tsx — il testo a tutto schermo, con la riga che si riempie.
 *
 * Stessa fonte della vista "Testo" normale, altra resa: una riga sola grande
 * al centro, le vicine più piccole e sbiadite, e il verso in corso che si
 * colora da sinistra a destra mentre lo si canta (vedi karaoke.ts per il
 * calcolo, che è una stima dichiarata: i tempi di LRCLIB sono per riga, non
 * per parola).
 *
 * IL TEMPO SI LEGGE A OGNI FOTOGRAMMA, non dallo stato React. Qui serve
 * davvero: `currentTime` nello stato si aggiorna quattro volte al secondo e
 * il riempimento avanzerebbe a scatti visibilissimi. Il valore sta in un ref
 * e finisce direttamente nello stile, senza passare da un render.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { api, coverUrl } from '../api.ts';
import { useAsync } from '../useAsync.ts';
import { usePlayer } from '../player.tsx';
import { indiceAttivo } from '../lyricsSync.ts';
import { avanzamentoRiga, finestra, parole } from '../karaoke.ts';
import { Icon } from './Icon.tsx';

export function Karaoke({ onClose }: { onClose: () => void }) {
  const p = usePlayer();
  const trackId = p.current?.id ?? null;
  const { data, loading } = useAsync(
    () => (trackId === null ? Promise.resolve(null) : api.lyrics(trackId)),
    [trackId],
  );

  const [attiva, setAttiva] = useState(-1);
  const rigaRef = useRef<HTMLParagraphElement>(null);
  const getTime = useRef(p.getTime);
  getTime.current = p.getTime;

  const righe = data?.synced ?? null;
  const durata = p.duration;

  /*
   * Un solo ciclo di animazione per due lavori: cambiare riga quando è ora, e
   * far avanzare il riempimento di quella in corso. Il secondo non passa per
   * lo stato di React — si scrive una variabile CSS sull'elemento — perché
   * sessanta render al secondo per spostare un gradiente sarebbero sprecati.
   */
  useEffect(() => {
    if (!righe?.length) return;
    let frame = 0;
    let ultimaRiga = -2;
    const tick = () => {
      const t = getTime.current();
      const i = indiceAttivo(righe, t);
      if (i !== ultimaRiga) {
        ultimaRiga = i;
        setAttiva(i);
      }
      // Le parole già cantate si accendono qui, scrivendo direttamente nel
      // DOM: sono pochi `classList.toggle` per fotogramma, contro un render
      // di React sessanta volte al secondo.
      const avanti = avanzamentoRiga(righe, i, t, durata);
      const spans = rigaRef.current?.children;
      if (spans) {
        for (const el of spans) {
          const inizio = Number((el as HTMLElement).dataset.inizio ?? 1);
          (el as HTMLElement).classList.toggle('is-detta', avanti >= inizio);
        }
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [righe, durata]);

  // Esc chiude, come ogni schermata a tutto campo.
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onClose]);

  const vista = useMemo(() => finestra(righe, attiva), [righe, attiva]);
  const brano = p.current;

  return (
    <div className="kar" role="dialog" aria-label="Karaoke">
      {brano && (
        <div
          className="kar-sfondo"
          style={{ backgroundImage: `url(${coverUrl(brano.albumId, brano.coverKey)})` }}
          aria-hidden
        />
      )}

      <header className="kar-testa">
        <div className="kar-brano">
          <strong>{brano?.title}</strong>
          <span className="dim">{brano?.artist}</span>
        </div>
        <button className="icon" onClick={onClose} title="Esci dal karaoke" aria-label="Esci dal karaoke">
          <Icon name="close" size={20} />
        </button>
      </header>

      <div className="kar-corpo">
        {loading && <p className="hint">Cerco il testo…</p>}
        {!loading && !righe?.length && (
          <div className="kar-niente">
            <p>Per questo brano non c'è un testo sincronizzato.</p>
            <p className="dim">
              Il karaoke ha bisogno dei tempi di ogni verso: LRCLIB non li ha per tutti i brani.
            </p>
          </div>
        )}

        {righe?.length ? vista.righe.map((riga, k) => {
          const corrente = k === vista.attiva;
          return (
            <p
              key={`${riga.t}-${riga.indice}`}
              ref={corrente ? rigaRef : undefined}
              className={`kar-riga${corrente ? ' is-attiva' : ''}${k < vista.attiva ? ' is-passata' : ''}`}
              onClick={() => p.seek(riga.t)}
            >
              {corrente
                ? parole(riga.text || '♪').map((pa, n) => (
                    <span key={n} className="kar-parola" data-inizio={pa.inizio}>{pa.testo}</span>
                  ))
                : (riga.text || '♪')}
            </p>
          );
        }) : null}
      </div>

      <footer className="kar-piede">
        <button className="icon" onClick={p.previous} title="Precedente" aria-label="Precedente">
          <Icon name="prev" size={22} />
        </button>
        <button className="icon big" onClick={p.toggle} title={p.isPlaying ? 'Pausa' : 'Riproduci'}>
          <Icon name={p.isPlaying ? 'pause' : 'play'} size={26} />
        </button>
        <button className="icon" onClick={p.next} title="Successivo" aria-label="Successivo">
          <Icon name="next" size={22} />
        </button>
      </footer>
    </div>
  );
}
