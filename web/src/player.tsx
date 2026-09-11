/**
 * player.tsx — lo stato di riproduzione, condiviso da tutta l'app.
 *
 * Esiste UN SOLO elemento <audio> per l'intera sessione, creato qui e mai
 * smontato. È importante: se ogni schermata creasse il suo, cambiare pagina
 * interromperebbe la musica e il browser ricomincerebbe a scaricare da capo.
 *
 * Cosa fa il browser quando assegniamo `audio.src`:
 *   1. GET con `Range: bytes=0-` → riceve 206 e comincia a riempire il buffer
 *   2. legge l'intestazione del file per ricavare durata e formato (`loadedmetadata`)
 *   3. quando ha abbastanza dati parte (`canplay`) e continua a scaricare a fette
 *   4. se trascini la barra, abbandona la richiesta in corso e ne apre una
 *      nuova con `Range: bytes=<offset>-`
 * Tutta la logica di rete è del browser: a noi basta esporre gli header giusti.
 */
import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
} from 'react';
import type { ReactNode } from 'react';
import type { Track } from './api.ts';
import { streamUrl, coverUrl, send } from './api.ts';
import { sogliaAscolto } from './soglia.ts';

export type RepeatMode = 'off' | 'all' | 'one';

type PlayerState = {
  queue: Track[];
  index: number;
  current: Track | null;
  isPlaying: boolean;
  isLoading: boolean;
  currentTime: number;
  duration: number;
  /** secondi già scaricati a partire dalla posizione corrente */
  buffered: number;
  volume: number;
  muted: boolean;
  shuffle: boolean;
  repeat: RepeatMode;
  error: string | null;
};

type PlayerApi = PlayerState & {
  playQueue: (tracks: Track[], startIndex?: number) => void;
  /** salta a una posizione della coda */
  playAt: (index: number) => void;
  /** infila un brano subito dopo quello in ascolto */
  playNext: (track: Track) => void;
  /** aggiunge in fondo alla coda */
  addToQueue: (track: Track) => void;
  removeAt: (index: number) => void;
  move: (from: number, to: number) => void;
  toggle: () => void;
  next: () => void;
  previous: () => void;
  seek: (seconds: number) => void;
  /**
   * Tempo corrente letto direttamente dall'elemento audio.
   * `currentTime` nello stato si aggiorna ~4 volte al secondo (è la cadenza
   * dell'evento timeupdate): abbastanza per una barra, troppo poco per far
   * scorrere un testo a tempo senza scatti.
   */
  getTime: () => number;
  setVolume: (v: number) => void;
  toggleMute: () => void;
  toggleShuffle: () => void;
  cycleRepeat: () => void;
};

const PlayerContext = createContext<PlayerApi | null>(null);

/** Mescola una copia dell'array (Fisher-Yates). */
function shuffled<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function PlayerProvider({ children }: { children: ReactNode }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  if (audioRef.current === null && typeof Audio !== 'undefined') {
    const audio = new Audio();
    // 'metadata' scaricherebbe solo l'intestazione: con 'auto' diciamo al
    // browser che può riempire il buffer in anticipo, come fa Apple Music.
    audio.preload = 'auto';
    audioRef.current = audio;
  }

  // La coda "originale" serve per tornare all'ordine dell'album quando si
  // disattiva lo shuffle.
  const sourceRef = useRef<Track[]>([]);

  // Id della traccia già conteggiata in questa riproduzione: senza, ogni
  // timeupdate oltre la soglia manderebbe una richiesta (quattro al secondo).
  const contatoRef = useRef<number | null>(null);

  /*
   * Ripresa dopo la chiusura dell'app.
   *
   * Coda, brano e posizione vengono salvati in localStorage mentre si
   * ascolta; al riavvio si rimettono nella barra IN PAUSA, al secondo in cui
   * ci si era fermati. Non si fa partire nulla: il browser lo vieterebbe
   * comunque senza un tocco, e comunque riaprire l'app non vuol dire voler
   * sentire subito la musica.
   *
   * La posizione si scrive al massimo ogni 5 secondi, più a ogni pausa e
   * quando l'app va in secondo piano: su iOS una PWA può essere chiusa senza
   * preavviso, e 'visibilitychange' è l'ultimo momento affidabile per farlo.
   */
  const CHIAVE_RIPRESA = 'mario-music.ripresa';
  const ultimoSalvataggio = useRef(0);
  /** posizione da applicare appena l'audio conosce la propria durata */
  const seekInSospeso = useRef<number | null>(null);

  const [state, setState] = useState<PlayerState>({
    queue: [], index: -1, current: null,
    isPlaying: false, isLoading: false,
    currentTime: 0, duration: 0, buffered: 0,
    volume: 1, muted: false,
    shuffle: false, repeat: 'off',
    error: null,
  });

  const patch = useCallback((p: Partial<PlayerState>) => setState((s) => ({ ...s, ...p })), []);

  /** Carica una traccia nell'elemento audio e prova a farla partire. */
  const load = useCallback((queue: Track[], index: number, autoplay: boolean) => {
    const audio = audioRef.current;
    const track = queue[index];
    if (!audio || !track) return;

    audio.src = streamUrl(track.id);
    contatoRef.current = null;
    seekInSospeso.current = null;
    patch({ queue, index, current: track, currentTime: 0, duration: track.duration, buffered: 0, error: null, isLoading: true });

    if (autoplay) {
      // play() è asincrono e può essere rifiutato: i browser bloccano
      // l'audio finché l'utente non ha interagito con la pagina.
      audio.play().catch((err: DOMException) => {
        if (err.name === 'NotAllowedError') {
          patch({ isPlaying: false, error: 'Il browser ha bloccato la riproduzione automatica: premi play.' });
        } else {
          patch({ isPlaying: false, error: `Riproduzione fallita: ${err.message}` });
        }
      });
    }
  }, [patch]);

  const playQueue = useCallback((tracks: Track[], startIndex = 0) => {
    if (tracks.length === 0) return;
    sourceRef.current = tracks;
    if (state.shuffle) {
      // Con lo shuffle attivo il brano scelto resta il primo, gli altri si mescolano.
      const chosen = tracks[startIndex];
      const rest = shuffled(tracks.filter((_, i) => i !== startIndex));
      load([chosen, ...rest], 0, true);
    } else {
      load(tracks, startIndex, true);
    }
  }, [load, state.shuffle]);

  const next = useCallback(() => {
    setState((s) => {
      if (s.index < 0) return s;
      const last = s.index >= s.queue.length - 1;
      if (last && s.repeat !== 'all') {
        audioRef.current?.pause();
        return { ...s, isPlaying: false };
      }
      const nextIndex = last ? 0 : s.index + 1;
      queueMicrotask(() => load(s.queue, nextIndex, true));
      return s;
    });
  }, [load]);

  const previous = useCallback(() => {
    setState((s) => {
      const audio = audioRef.current;
      if (!audio || s.index < 0) return s;
      // Come su Apple Music: entro i primi 3 secondi si torna indietro,
      // dopo si riparte dall'inizio del brano corrente.
      if (audio.currentTime > 3 || s.index === 0) {
        audio.currentTime = 0;
        return s;
      }
      queueMicrotask(() => load(s.queue, s.index - 1, true));
      return s;
    });
  }, [load]);

  // Copia sempre aggiornata dello stato, leggibile dai gestori di eventi
  // senza doverli riagganciare a ogni render.
  const stateRef = useRef(state);
  stateRef.current = state;

  /** Scrive coda, brano e posizione. Senza brano in corso, cancella il ricordo. */
  const salvaRipresa = useCallback(() => {
    const s = stateRef.current;
    const audio = audioRef.current;
    try {
      if (!s.current || !audio) {
        localStorage.removeItem(CHIAVE_RIPRESA);
        return;
      }
      localStorage.setItem(CHIAVE_RIPRESA, JSON.stringify({
        queue: s.queue,
        index: s.index,
        time: audio.currentTime,
        shuffle: s.shuffle,
        repeat: s.repeat,
      }));
    } catch {
      /* localStorage può non esserci (navigazione privata, quota): si fa senza */
    }
  }, []);

  /* ── ripresa: al primo avvio si rimette in barra l'ultimo brano, in pausa ── */
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    let salvato: { queue: Track[]; index: number; time: number; shuffle: boolean; repeat: RepeatMode } | null = null;
    try {
      const grezzo = localStorage.getItem(CHIAVE_RIPRESA);
      salvato = grezzo ? JSON.parse(grezzo) : null;
    } catch { /* ricordo illeggibile: si parte da zero */ }

    if (!salvato || !Array.isArray(salvato.queue) || salvato.queue.length === 0) return;
    const index = Math.min(Math.max(0, salvato.index | 0), salvato.queue.length - 1);
    const track = salvato.queue[index];
    if (!track?.id) return;

    // Non si passa da load(): quello azzera la posizione e prova a suonare.
    audio.src = streamUrl(track.id);
    seekInSospeso.current = Math.max(0, Number(salvato.time) || 0);
    // L'ascolto era già stato conteggiato prima di chiudere: non si riconta.
    contatoRef.current = track.id;
    sourceRef.current = salvato.queue;
    patch({
      queue: salvato.queue,
      index,
      current: track,
      // La barra mostra subito la posizione salvata, senza aspettare i metadati.
      currentTime: seekInSospeso.current,
      duration: track.duration,
      shuffle: Boolean(salvato.shuffle),
      repeat: (['off', 'all', 'one'] as RepeatMode[]).includes(salvato.repeat) ? salvato.repeat : 'off',
      isPlaying: false,
      isLoading: false,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── l'app va in secondo piano o si chiude: ultimo salvataggio utile ── */
  useEffect(() => {
    const quandoNascosta = () => { if (document.visibilityState === 'hidden') salvaRipresa(); };
    document.addEventListener('visibilitychange', quandoNascosta);
    window.addEventListener('pagehide', salvaRipresa);
    return () => {
      document.removeEventListener('visibilitychange', quandoNascosta);
      window.removeEventListener('pagehide', salvaRipresa);
    };
  }, [salvaRipresa]);

  /* ── eventi dell'elemento audio → stato React ── */
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onTime = () => {
      // `buffered` è una lista di intervalli già scaricati: cerchiamo quello
      // che contiene la posizione attuale per disegnare la barra di buffering.
      let ahead = audio.currentTime;
      for (let i = 0; i < audio.buffered.length; i++) {
        if (audio.buffered.start(i) <= audio.currentTime && audio.currentTime <= audio.buffered.end(i)) {
          ahead = audio.buffered.end(i);
          break;
        }
      }
      patch({ currentTime: audio.currentTime, buffered: ahead });

      const adesso = Date.now();
      if (adesso - ultimoSalvataggio.current > 5000) {
        ultimoSalvataggio.current = adesso;
        salvaRipresa();
      }

      // Un ascolto conta solo se il brano è stato davvero ascoltato.
      const corrente = stateRef.current.current;
      if (corrente && contatoRef.current !== corrente.id
          && audio.currentTime >= sogliaAscolto(audio.duration || corrente.duration)) {
        contatoRef.current = corrente.id;
        void send(`/api/tracks/${corrente.id}/play`, 'POST').catch(() => undefined);
      }
    };
    const onMeta = () => {
      // Impostare currentTime prima che l'audio conosca la sua durata non
      // attacca su tutti i browser (iOS in testa): si aspetta questo evento.
      if (seekInSospeso.current !== null) {
        audio.currentTime = Math.min(seekInSospeso.current, audio.duration || Infinity);
        seekInSospeso.current = null;
      }
      patch({ duration: audio.duration, isLoading: false });
    };
    const onPlay = () => patch({ isPlaying: true, error: null });
    const onPause = () => { patch({ isPlaying: false }); salvaRipresa(); };
    const onWaiting = () => patch({ isLoading: true });
    const onPlaying = () => patch({ isLoading: false });
    const onError = () => patch({ isLoading: false, isPlaying: false, error: 'Impossibile leggere questo file audio.' });
    const onEnded = () => {
      if (audioRef.current && stateRef.current.repeat === 'one') {
        audioRef.current.currentTime = 0;
        void audioRef.current.play();
      } else {
        next();
      }
    };

    audio.addEventListener('timeupdate', onTime);
    audio.addEventListener('progress', onTime);
    audio.addEventListener('loadedmetadata', onMeta);
    audio.addEventListener('durationchange', onMeta);
    audio.addEventListener('play', onPlay);
    audio.addEventListener('pause', onPause);
    audio.addEventListener('waiting', onWaiting);
    audio.addEventListener('playing', onPlaying);
    audio.addEventListener('error', onError);
    audio.addEventListener('ended', onEnded);
    return () => {
      audio.removeEventListener('timeupdate', onTime);
      audio.removeEventListener('progress', onTime);
      audio.removeEventListener('loadedmetadata', onMeta);
      audio.removeEventListener('durationchange', onMeta);
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('pause', onPause);
      audio.removeEventListener('waiting', onWaiting);
      audio.removeEventListener('playing', onPlaying);
      audio.removeEventListener('error', onError);
      audio.removeEventListener('ended', onEnded);
    };
  }, [next, patch]);

  /* ── controlli del sistema operativo (barra multimediale, cuffie, lock screen) ── */
  useEffect(() => {
    if (!('mediaSession' in navigator) || !state.current) return;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: state.current.title,
      artist: state.current.artist,
      album: state.current.album,
      artwork: [{ src: coverUrl(state.current.albumId, state.current.coverKey), sizes: '640x640', type: 'image/jpeg' }],
    });
    navigator.mediaSession.setActionHandler('play', () => void audioRef.current?.play());
    navigator.mediaSession.setActionHandler('pause', () => audioRef.current?.pause());
    navigator.mediaSession.setActionHandler('nexttrack', next);
    navigator.mediaSession.setActionHandler('previoustrack', previous);
  }, [state.current, next, previous]);

  const value: PlayerApi = useMemo(() => ({
    ...state,
    playQueue,
    next,
    previous,
    toggle: () => {
      const audio = audioRef.current;
      if (!audio || !stateRef.current.current) return;
      if (audio.paused) void audio.play().catch(() => patch({ error: 'Riproduzione bloccata dal browser.' }));
      else audio.pause();
    },
    playAt: (index) => {
      const s = stateRef.current;
      if (index >= 0 && index < s.queue.length) load(s.queue, index, true);
    },
    playNext: (track) => {
      setState((s) => {
        if (s.index < 0) {
          queueMicrotask(() => load([track], 0, true));
          return s;
        }
        // Se è già in coda più avanti lo si sposta, invece di duplicarlo.
        const without = s.queue.filter((t, i) => !(t.id === track.id && i !== s.index));
        const at = without.findIndex((t, i) => t.id === s.queue[s.index].id && i >= 0);
        const q = [...without];
        q.splice(at + 1, 0, track);
        sourceRef.current = q;
        return { ...s, queue: q, index: at };
      });
    },
    addToQueue: (track) => {
      setState((s) => {
        if (s.index < 0) {
          queueMicrotask(() => load([track], 0, true));
          return s;
        }
        const q = [...s.queue, track];
        sourceRef.current = q;
        return { ...s, queue: q };
      });
    },
    removeAt: (index) => {
      setState((s) => {
        if (index < 0 || index >= s.queue.length) return s;
        const q = s.queue.filter((_, i) => i !== index);
        sourceRef.current = q;

        if (q.length === 0) {
          const audio = audioRef.current;
          audio?.pause();
          if (audio) audio.removeAttribute('src');
          return { ...s, queue: [], index: -1, current: null, isPlaying: false, currentTime: 0 };
        }
        if (index < s.index) return { ...s, queue: q, index: s.index - 1 };
        if (index > s.index) return { ...s, queue: q };

        // Tolta quella in ascolto: suona chi prende il suo posto.
        const nextIndex = Math.min(index, q.length - 1);
        const wasPlaying = s.isPlaying;
        queueMicrotask(() => load(q, nextIndex, wasPlaying));
        return { ...s, queue: q };
      });
    },
    move: (from, to) => {
      setState((s) => {
        if (from === to || from < 0 || to < 0 || from >= s.queue.length || to >= s.queue.length) return s;
        const q = [...s.queue];
        const [moved] = q.splice(from, 1);
        q.splice(to, 0, moved);
        sourceRef.current = q;

        // L'indice deve continuare a puntare al brano in ascolto, che
        // potrebbe essersi spostato per effetto del riordino.
        let index = s.index;
        if (from === s.index) index = to;
        else if (from < s.index && to >= s.index) index = s.index - 1;
        else if (from > s.index && to <= s.index) index = s.index + 1;
        return { ...s, queue: q, index };
      });
    },
    getTime: () => audioRef.current?.currentTime ?? 0,
    seek: (seconds) => {
      const audio = audioRef.current;
      if (!audio) return;
      // Assegnare currentTime fa partire una nuova richiesta HTTP con Range:
      // è letteralmente questa riga a innescare il seek lato rete.
      audio.currentTime = Math.max(0, Math.min(seconds, audio.duration || 0));
      patch({ currentTime: audio.currentTime });
    },
    setVolume: (v) => {
      const audio = audioRef.current;
      if (!audio) return;
      audio.volume = v;
      audio.muted = false;
      patch({ volume: v, muted: false });
    },
    toggleMute: () => {
      const audio = audioRef.current;
      if (!audio) return;
      audio.muted = !audio.muted;
      patch({ muted: audio.muted });
    },
    toggleShuffle: () => {
      setState((s) => {
        const on = !s.shuffle;
        if (s.index < 0) return { ...s, shuffle: on };
        const current = s.queue[s.index];
        if (on) {
          const rest = shuffled(s.queue.filter((_, i) => i !== s.index));
          return { ...s, shuffle: on, queue: [current, ...rest], index: 0 };
        }
        // Ritorno all'ordine originale, restando sul brano in ascolto.
        const restored = sourceRef.current.length ? sourceRef.current : s.queue;
        return { ...s, shuffle: on, queue: restored, index: Math.max(0, restored.findIndex((t) => t.id === current.id)) };
      });
    },
    cycleRepeat: () => setState((s) => ({
      ...s,
      repeat: s.repeat === 'off' ? 'all' : s.repeat === 'all' ? 'one' : 'off',
    })),
  }), [state, playQueue, next, previous, patch]);

  return <PlayerContext.Provider value={value}>{children}</PlayerContext.Provider>;
}

export function usePlayer(): PlayerApi {
  const ctx = useContext(PlayerContext);
  if (!ctx) throw new Error('usePlayer va usato dentro <PlayerProvider>');
  return ctx;
}
