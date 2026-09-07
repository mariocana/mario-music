/**
 * Lyrics.tsx — il testo del brano, sincronizzato quando disponibile.
 *
 * L'evidenziazione non usa `currentTime` dello stato React: quello si
 * aggiorna quattro volte al secondo, e il verso cambierebbe a scatti fino a
 * un quarto di secondo in ritardo. Qui si legge il tempo vero dall'elemento
 * audio dentro un requestAnimationFrame, e si aggiorna lo stato solo quando
 * la riga attiva cambia davvero — quindi qualche volta al minuto, non 60
 * volte al secondo.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api.ts';
import { useAsync } from '../useAsync.ts';
import { usePlayer } from '../player.tsx';
import { indiceAttivo } from '../lyricsSync.ts';

export function Lyrics() {
  const p = usePlayer();
  const trackId = p.current?.id ?? null;

  const { data, error, loading } = useAsync(
    () => (trackId === null ? Promise.resolve(null) : api.lyrics(trackId)),
    [trackId],
  );

  const [tempo, setTempo] = useState(0);
  const listaRef = useRef<HTMLOListElement>(null);

  // L'identità di p cambia a ogni render: si tiene un riferimento stabile,
  // altrimenti il ciclo di animazione ripartirebbe di continuo.
  const getTime = useRef(p.getTime);
  getTime.current = p.getTime;

  // Due sorgenti per lo stesso valore, apposta:
  //
  // 1. `timeupdate`, quattro volte al secondo, che arriva sempre;
  // 2. requestAnimationFrame, fluido, ma SOSPESO quando la pagina non è in
  //    primo piano — a scheda in secondo piano l'evidenziazione si
  //    congelerebbe, e al ritorno salterebbe di colpo al punto giusto.
  //
  // Con entrambe, la seconda dà la fluidità e la prima garantisce che non si
  // fermi mai.
  useEffect(() => { setTempo(p.currentTime); }, [p.currentTime]);

  useEffect(() => {
    if (!data?.synced?.length) return;
    let frame = 0;
    const tick = () => {
      const t = getTime.current();
      // Si aggiorna solo a scatti di un decimo: bastano per non vedere
      // ritardi, ed evitano sessanta render al secondo.
      setTempo((prima) => (Math.abs(prima - t) > 0.1 ? t : prima));
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [data]);

  const attiva = useMemo(() => indiceAttivo(data?.synced, tempo), [data, tempo]);

  // Porta il verso corrente al centro, senza strappi.
  useEffect(() => {
    if (attiva < 0) return;
    listaRef.current?.children[attiva]?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [attiva]);

  if (!p.current) return <p className="hint">Nessun brano in riproduzione.</p>;
  if (loading) return <p className="hint">Cerco il testo…</p>;
  if (error) return <p className="hint error">Testo non recuperabile: {error}</p>;

  if (!data || data.source === 'none') {
    return (
      <div className="ly-vuoto">
        <p className="hint">Nessun testo trovato per questo brano.</p>
        <p className="dim">Cercato su LRCLIB per titolo, artista e durata.</p>
      </div>
    );
  }

  if (data.synced?.length) {
    return (
      <ol className="ly" ref={listaRef}>
        {data.synced.map((riga, i) => (
          <li
            key={`${riga.t}-${i}`}
            className={`ly-riga ${i === attiva ? 'is-attiva' : ''} ${i < attiva ? 'is-passata' : ''}`}
            // Toccare un verso salta a quel punto del brano.
            onClick={() => p.seek(riga.t)}
          >
            {riga.text || '♪'}
          </li>
        ))}
      </ol>
    );
  }

  return (
    <div className="ly ly-semplice">
      {data.plain?.split('\n').map((riga, i) => <p key={i}>{riga || ' '}</p>)}
      {data.source === 'tag' && <p className="dim ly-fonte">Testo preso dai tag del file, senza tempi.</p>}
    </div>
  );
}
