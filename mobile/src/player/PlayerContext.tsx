import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { AppState, Platform } from 'react-native';
import {
  createAudioPlayer,
  requestNotificationPermissionsAsync,
  setAudioModeAsync,
  type AudioPlayer,
  type AudioStatus,
} from 'expo-audio';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api, coverUrl, streamUrl } from '../api';
import { accoda, inserisciDopo, sposta, togli } from '../coda';
import {
  CHIAVE_CROSSFADE,
  DURATE_CROSSFADE,
  devePrecaricare,
  deveIniziare,
  durataEffettiva,
  guadagni,
  type Crossfade,
} from '../gapless';
import { CHIAVE_NORMALIZZA, leggiNormalizza, volumeDelBrano } from '../loudness';
import {
  CHIAVE_CODA,
  CHIAVE_POSIZIONE,
  INTERVALLO_SALVATAGGIO_MS,
  leggiRipresa,
  scriviCoda,
  scriviPosizione,
} from '../ripresa';
import { sogliaAscolto } from '../soglia';
import { CHIAVE_QUALITA, QUALITA, queryStream, usaConversione, type Qualita } from '../sorgente';
import type { RepeatMode, Track } from '../types';

type PlayerState = {
  queue: Track[];
  index: number;
  current: Track | null;
  isPlaying: boolean;
  isLoading: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  shuffle: boolean;
  repeat: RepeatMode;
  error: string | null;
};

type PlayerContextApi = PlayerState & {
  playQueue: (tracks: Track[], startIndex?: number) => void;
  playNext: (tracks: Track | Track[]) => void;
  /** salta al brano in quella posizione della coda */
  playAt: (index: number) => void;
  /** toglie dalla coda; se è il brano in ascolto, al suo posto va il successivo */
  removeAt: (index: number) => void;
  /** riordina la coda: il brano in ascolto continua a suonare */
  move: (from: number, to: number) => void;
  addToQueue: (tracks: Track | Track[]) => void;
  toggle: () => void;
  next: () => void;
  previous: () => void;
  seek: (seconds: number) => void;
  setVolume: (v: number) => void;
  toggleShuffle: () => void;
  cycleRepeat: () => void;
  toggleFavorite: (trackId?: number) => Promise<void>;
  /** secondi di dissolvenza incrociata tra un brano e l'altro; 0 = gapless puro */
  crossfade: Crossfade;
  setCrossfade: (secondi: Crossfade) => void;
  /** originale, o AAC convertito dal server per consumare meno dati */
  qualita: Qualita;
  setQualita: (q: Qualita) => void;
  /** "Volume uniforme": abbassa i brani più forti a RIFERIMENTO LUFS */
  normalizza: boolean;
  setNormalizza: (on: boolean) => void;
};

const PlayerContext = createContext<PlayerContextApi | null>(null);

function shuffleArray<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function PlayerProvider({
  children,
  getOfflineUri,
}: {
  children: React.ReactNode;
  getOfflineUri?: (trackId: number) => string | null;
}) {
  /*
   * DUE player, non uno — come faceva il web con i due elementi <audio>.
   *
   * Mentre il primo suona, il secondo ha già in carica il brano successivo:
   * quando è il momento parte subito, senza il silenzio che serviva per
   * chiedere il file alla rete e leggerne l'intestazione (vedi gapless.ts).
   * A fine transizione i due si scambiano i ruoli.
   *
   * `attivoRef` dice quale dei due sta suonando adesso. Gli eventi del player
   * in attesa (o di quello che sta sfumando via) non toccano lo stato:
   * barra, lock screen e conteggio ascolti guardano solo quello attivo.
   */
  const playersRef = useRef<[AudioPlayer, AudioPlayer] | null>(null);
  const attivoRef = useRef(0);
  const subscriptionsRef = useRef<Array<{ remove: () => void }>>([]);
  const advancingRef = useRef(false);
  const nextRef = useRef<() => void>(() => {});
  const statusRef = useRef<(player: AudioPlayer, status: AudioStatus) => void>(() => {});
  const originalQueueRef = useRef<Track[]>([]);
  const contatoRef = useRef<number | null>(null);
  /** quale posizione della coda sta nel player in attesa: dopo un cambio di coda non è più "il prossimo" */
  const precaricatoRef = useRef<{ index: number; id: number } | null>(null);
  /** il timer della dissolvenza, da fermare se l'utente interviene a metà */
  const rampaRef = useRef<ReturnType<typeof setInterval> | null>(null);
  /** il brano entrante ha già suonato durante la dissolvenza in corso? (vedi il gestore degli stati) */
  const rampaPartitaRef = useRef(false);
  const crossfadeRef = useRef<Crossfade>(0);
  /*
   * Ripresa dopo la chiusura (vedi ripresa.ts). Il brano ritrovato torna nel
   * mini player IN PAUSA, ma il file non si carica finché non si preme play:
   * riaprire l'app non vuol dire voler sentire subito la musica, e così
   * all'avvio non si consuma rete (né si fallisce, se si è offline).
   */
  const sorgentePendenteRef = useRef(false);
  /** posizione da raggiungere appena il player ha caricato il brano ripreso */
  const seekPendenteRef = useRef<number | null>(null);
  const ultimoSalvataggioRef = useRef(0);
  const [crossfade, setCrossfadeState] = useState<Crossfade>(0);
  const qualitaRef = useRef<Qualita>('originale');
  const normalizzaRef = useRef(true);
  const [normalizza, setNormalizzaState] = useState(true);
  const [qualita, setQualitaState] = useState<Qualita>('originale');

  const [state, setState] = useState<PlayerState>({
    queue: [],
    index: -1,
    current: null,
    isPlaying: false,
    isLoading: false,
    currentTime: 0,
    duration: 0,
    volume: 1,
    shuffle: false,
    repeat: 'off',
    error: null,
  });

  const stateRef = useRef(state);
  stateRef.current = state;

  // Inizializza la modalità audio background
  useEffect(() => {
    void setAudioModeAsync({
      playsInSilentMode: true,
      shouldPlayInBackground: true,
      interruptionMode: 'doNotMix',
      shouldRouteThroughEarpiece: false,
    }).catch(() => undefined);

    if (Platform.OS === 'android') {
      void requestNotificationPermissionsAsync().catch(() => undefined);
    }
  }, []);

  // La durata della dissolvenza è una preferenza: sopravvive al riavvio.
  useEffect(() => {
    void AsyncStorage.getItem(CHIAVE_CROSSFADE).then((raw) => {
      const n = Number(raw);
      if ((DURATE_CROSSFADE as readonly number[]).includes(n)) {
        crossfadeRef.current = n as Crossfade;
        setCrossfadeState(n as Crossfade);
      }
    }).catch(() => undefined);
  }, []);

  const setCrossfade = useCallback((secondi: Crossfade) => {
    crossfadeRef.current = secondi;
    setCrossfadeState(secondi);
    void AsyncStorage.setItem(CHIAVE_CROSSFADE, String(secondi)).catch(() => undefined);
  }, []);

  useEffect(() => {
    void AsyncStorage.getItem(CHIAVE_QUALITA).then((raw) => {
      if (QUALITA.includes(raw as Qualita)) {
        qualitaRef.current = raw as Qualita;
        setQualitaState(raw as Qualita);
      }
    }).catch(() => undefined);
  }, []);

  /**
   * Il brano in corso continua com'è; dal prossimo si usa la qualità nuova.
   * Quello già precaricato aveva l'URL vecchio: lo si dimentica, e
   * precarica() lo richiederà giusto.
   */
  useEffect(() => {
    void AsyncStorage.getItem(CHIAVE_NORMALIZZA).then((raw) => {
      const on = leggiNormalizza(raw);
      normalizzaRef.current = on;
      setNormalizzaState(on);
      // Se la ripresa ha già caricato un brano, il volume va ricalcolato.
      const player = playersRef.current?.[attivoRef.current];
      if (player && !rampaRef.current) player.volume = calculateVolumeFor(stateRef.current.current);
    }).catch(() => undefined);
    // calculateVolumeFor è stabile (deps vuote): basta leggerlo una volta.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setQualita = useCallback((q: Qualita) => {
    qualitaRef.current = q;
    setQualitaState(q);
    precaricatoRef.current = null;
    void AsyncStorage.setItem(CHIAVE_QUALITA, q).catch(() => undefined);
  }, []);

  /** Scrive dove si è arrivati. Leggera: si chiama spesso. */
  const salvaPosizione = useCallback(() => {
    const s = stateRef.current;
    if (!s.current || s.index < 0) return;
    ultimoSalvataggioRef.current = Date.now();
    void AsyncStorage.setItem(CHIAVE_POSIZIONE, scriviPosizione({
      index: s.index,
      id: s.current.id,
      time: s.currentTime,
      shuffle: s.shuffle,
      repeat: s.repeat,
    })).catch(() => undefined);
  }, []);

  // La coda si riscrive solo quando cambia: può essere lunga migliaia di brani.
  useEffect(() => {
    if (state.queue.length === 0) return;
    void AsyncStorage.setItem(CHIAVE_CODA, scriviCoda(state.queue, originalQueueRef.current))
      .catch(() => undefined);
  }, [state.queue]);

  // Cambio di brano, pausa, shuffle o ripetizione: la posizione si salva subito.
  useEffect(() => {
    salvaPosizione();
  }, [state.index, state.current?.id, state.isPlaying, state.shuffle, state.repeat, salvaPosizione]);

  // In background iOS può chiudere l'app senza preavviso: è l'ultimo momento sicuro.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (stato) => {
      if (stato !== 'active') salvaPosizione();
    });
    return () => sub.remove();
  }, [salvaPosizione]);

  // All'avvio: si rimette la coda dov'era, in pausa.
  useEffect(() => {
    void Promise.all([AsyncStorage.getItem(CHIAVE_CODA), AsyncStorage.getItem(CHIAVE_POSIZIONE)])
      .then(([coda, posizione]) => {
        const r = leggiRipresa(coda, posizione);
        // Se nel frattempo l'utente ha già fatto partire qualcosa, vince lui.
        if (!r || stateRef.current.index >= 0) return;
        const track = r.queue[r.index];
        originalQueueRef.current = r.original;
        sorgentePendenteRef.current = true;
        // Oltre la soglia l'ascolto era già stato contato prima di chiudere.
        contatoRef.current = r.time >= sogliaAscolto(track.duration) ? track.id : null;
        setState((s) => ({
          ...s,
          queue: r.queue,
          index: r.index,
          current: track,
          currentTime: r.time,
          duration: track.duration,
          shuffle: r.shuffle,
          repeat: r.repeat,
          isPlaying: false,
          isLoading: false,
        }));
      })
      .catch(() => undefined);
  }, []);

  const calculateVolumeFor = useCallback((track: Track | null, baseVolume = stateRef.current.volume) => {
    if (!track) return baseVolume;
    return baseVolume * volumeDelBrano(track.loudness, normalizzaRef.current);
  }, []);

  /**
   * Vale subito, anche per il brano in corso: è un interruttore che si prova
   * ascoltando. Durante una dissolvenza ci pensa la rampa, al giro dopo.
   */
  const setNormalizza = useCallback((on: boolean) => {
    normalizzaRef.current = on;
    setNormalizzaState(on);
    const player = playersRef.current?.[attivoRef.current];
    if (player && !rampaRef.current) player.volume = calculateVolumeFor(stateRef.current.current);
    void AsyncStorage.setItem(CHIAVE_NORMALIZZA, on ? '1' : '0').catch(() => undefined);
  }, [calculateVolumeFor]);

  // La copia scaricata vince sempre: non costa rete, qualunque sia la qualità.
  const urlDi = useCallback(
    (track: Track) => getOfflineUri?.(track.id) || streamUrl(track.id, queryStream(track.codec, qualitaRef.current)),
    [getOfflineUri],
  );

  /** I due player nascono insieme, la prima volta che servono, e non muoiono più. */
  const getPlayers = useCallback((): [AudioPlayer, AudioPlayer] => {
    if (!playersRef.current) {
      const crea = () => {
        const player = createAudioPlayer(null, {
          keepAudioSessionActive: true,
          updateInterval: 250,
        });
        subscriptionsRef.current.push(
          player.addListener('playbackStatusUpdate', (status: AudioStatus) => statusRef.current(player, status)),
        );
        return player;
      };
      playersRef.current = [crea(), crea()];
    }
    return playersRef.current;
  }, []);

  const attivo = useCallback((): AudioPlayer | null => playersRef.current?.[attivoRef.current] ?? null, []);
  const inAttesa = useCallback((): AudioPlayer | null => playersRef.current?.[1 - attivoRef.current] ?? null, []);

  const mostraSuLockScreen = useCallback((player: AudioPlayer, track: Track) => {
    try {
      player.setActiveForLockScreen(
        true,
        {
          title: track.title,
          artist: track.artist,
          albumTitle: track.album,
          artworkUrl: track.coverKey ? coverUrl(track.albumId, track.coverKey) : undefined,
        },
        {
          showNextTrack: true,
          showPreviousTrack: true,
          showSeekForward: true,
          showSeekBackward: true,
        },
      );
    } catch {
      // Ignora se non supportato nel runtime corrente
    }
  }, []);

  const fermaRampa = useCallback(() => {
    if (rampaRef.current) {
      clearInterval(rampaRef.current);
      rampaRef.current = null;
    }
  }, []);

  /**
   * Chiude in anticipo una dissolvenza in corso: spegne il brano uscente e
   * riporta quello nuovo a volume pieno.
   *
   * Serve ogni volta che la dissolvenza viene interrotta da fuori — una
   * pausa, un salto, un cambio di brano. Senza, i volumi resterebbero
   * congelati a metà strada e il brano suonerebbe per sempre attenuato.
   */
  const concludiTransizione = useCallback(() => {
    if (!rampaRef.current) return;
    fermaRampa();
    inAttesa()?.pause();
    const player = attivo();
    if (player) player.volume = calculateVolumeFor(stateRef.current.current);
  }, [attivo, inAttesa, fermaRampa, calculateVolumeFor]);

  /** Qual è il brano dopo, tenendo conto della ripetizione. -1 se non c'è. */
  const indiceProssimo = useCallback((s: PlayerState): number => {
    if (s.index < 0 || s.repeat === 'one') return -1;
    if (s.index < s.queue.length - 1) return s.index + 1;
    return s.repeat === 'all' ? 0 : -1;
  }, []);

  /**
   * Fa convertire al server, adesso, il brano che verrà dopo `index`: quando
   * toccherà a lui (o quando precarica() lo chiederà, ~25 s prima) il file
   * sarà già pronto e non si aspetteranno i secondi della conversione.
   */
  const preparaProssimo = useCallback((queue: Track[], index: number) => {
    const i = indiceProssimo({ ...stateRef.current, queue, index });
    const track = i >= 0 ? queue[i] : undefined;
    if (!track || getOfflineUri?.(track.id)) return;
    if (!usaConversione(track.codec, qualitaRef.current)) return;
    void api.prepare(track.id).catch(() => undefined);
  }, [indiceProssimo, getOfflineUri]);

  /**
   * Dopo un cambio di coda il brano già caricato nel player in attesa può
   * essere ancora "il prossimo", ma a un indice diverso: lo si riallinea
   * invece di ricaricarlo dalla rete. Se non è più il prossimo lo si
   * dimentica, e precarica() caricherà quello giusto.
   */
  const riallineaPrecaricato = useCallback((queue: Track[], index: number) => {
    const p = precaricatoRef.current;
    if (!p) return;
    const i = indiceProssimo({ ...stateRef.current, queue, index });
    precaricatoRef.current = i >= 0 && queue[i]?.id === p.id ? { index: i, id: p.id } : null;
  }, [indiceProssimo]);

  /** Mette il brano successivo nel player fermo e lo lascia caricare. */
  const precarica = useCallback(() => {
    // Durante la dissolvenza il player "in attesa" è quello che sta
    // sfumando: sostituirgli il brano lo zittirebbe di colpo.
    if (rampaRef.current) return;
    const s = stateRef.current;
    const i = indiceProssimo(s);
    const track = i >= 0 ? s.queue[i] : undefined;
    const altro = inAttesa();
    if (!altro || !track) return;
    if (precaricatoRef.current?.index === i && precaricatoRef.current.id === track.id) return;

    altro.pause();
    altro.replace(urlDi(track));
    precaricatoRef.current = { index: i, id: track.id };
  }, [indiceProssimo, inAttesa, urlDi]);

  /**
   * Il passaggio vero e proprio al brano `i` della coda, già caricato nel
   * player in attesa: quello parte, l'altro si spegne — di colpo se non c'è
   * dissolvenza, con la curva equal-power se c'è (vedi guadagni()).
   *
   * Restituisce false se il brano in attesa non è quello giusto: chi chiama
   * ripiega allora sul caricamento normale.
   */
  const transisci = useCallback((i: number, dissolvi: boolean): boolean => {
    const s = stateRef.current;
    const track = i >= 0 ? s.queue[i] : undefined;
    const uscente = attivo();
    const entrante = inAttesa();
    if (!uscente || !entrante || !track) return false;
    if (precaricatoRef.current?.index !== i || precaricatoRef.current.id !== track.id) return false;

    concludiTransizione();
    const durataUscente = uscente.duration > 0 ? uscente.duration : (s.current?.duration ?? 0);
    // Stessa durata usata da deveIniziare() per decidere quando cominciare:
    // altrimenti la rampa finirebbe prima del brano uscente e ne taglierebbe la coda.
    const cf = dissolvi ? durataEffettiva(crossfadeRef.current, durataUscente) : 0;
    const trackUscente = s.current;

    // Il brano entrante parte dal suo volume, non da quello del precedente:
    // con la normalizzazione i due possono essere molto diversi.
    entrante.volume = cf > 0 ? 0 : calculateVolumeFor(track);
    entrante.play();

    // Lo scambio dei ruoli avviene subito: da qui in poi "il player attivo"
    // è quello nuovo, e barra, lock screen e conteggio guardano lui.
    attivoRef.current = 1 - attivoRef.current;
    precaricatoRef.current = null;
    contatoRef.current = null;
    advancingRef.current = false;
    mostraSuLockScreen(entrante, track);
    preparaProssimo(s.queue, i);
    setState((prev) => ({
      ...prev,
      index: i,
      current: track,
      currentTime: 0,
      duration: track.duration,
      isPlaying: true,
      isLoading: false,
      error: null,
    }));

    if (cf <= 0) {
      uscente.pause();
      return true;
    }

    // La rampa segue il tempo vero del brano entrante, non un contatore
    // nostro: se il caricamento rallenta, i volumi restano in accordo con
    // quello che si sente davvero.
    rampaPartitaRef.current = false;
    rampaRef.current = setInterval(() => {
      const p = Math.min(1, entrante.currentTime / cf);
      const g = guadagni(p);
      uscente.volume = calculateVolumeFor(trackUscente) * g.uscente;
      entrante.volume = calculateVolumeFor(track) * g.entrante;
      if (p >= 1) {
        fermaRampa();
        uscente.pause();
      }
    }, 50);
    return true;
  }, [attivo, inAttesa, concludiTransizione, calculateVolumeFor, mostraSuLockScreen, fermaRampa, preparaProssimo]);

  statusRef.current = (player: AudioPlayer, status: AudioStatus) => {
    // Il player in attesa carica, quello uscente sfuma e poi finisce: nessuno
    // dei due deve muovere la barra o far avanzare la coda.
    if (player !== attivo()) return;

    // Una pausa che non passa da toggle() — lock screen, Centro di Controllo,
    // AirPods, una telefonata — ferma solo il player attivo, e quello uscente
    // continuerebbe a sfumare da solo. Si chiude la dissolvenza appena il
    // brano entrante, dopo essere partito, si ferma. (Prima che parta
    // davvero `playing` può essere false per un attimo: non conta.)
    if (rampaRef.current) {
      if (status.playing) rampaPartitaRef.current = true;
      else if (rampaPartitaRef.current) concludiTransizione();
    }

    // Brano ripreso: prima si raggiunge il punto in cui ci si era fermati,
    // poi si suona. Partire e poi saltare farebbe sentire un attimo l'inizio.
    const seekPendente = seekPendenteRef.current;
    if (seekPendente !== null) {
      if (!status.isLoaded) return;
      seekPendenteRef.current = null;
      void player.seekTo(seekPendente).catch(() => undefined).then(() => player.play());
      return;
    }

    const current = stateRef.current.current;
    const durata = status.duration > 0 ? status.duration : (current?.duration ?? 0);

    if (status.playing && Date.now() - ultimoSalvataggioRef.current >= INTERVALLO_SALVATAGGIO_MS) {
      salvaPosizione();
    }

    setState((s) => ({
      ...s,
      isPlaying: status.playing,
      currentTime: status.currentTime,
      duration: durata > 0 ? durata : s.duration,
      isLoading: status.isBuffering || !status.isLoaded,
    }));

    // Scrobbling conteggio ascolti
    if (
      current &&
      contatoRef.current !== current.id &&
      status.currentTime >= sogliaAscolto(durata)
    ) {
      contatoRef.current = current.id;
      void api.recordPlay(current.id).catch(() => undefined);
    }

    if (advancingRef.current) return;
    const cf = crossfadeRef.current;

    if (status.playing && devePrecaricare(status.currentTime, durata, cf)) precarica();

    // Con la dissolvenza il brano dopo parte prima della fine di questo.
    const isEnded = status.didJustFinish || status.playbackState === 'ended';
    if (!isEnded && cf > 0 && status.playing && deveIniziare(status.currentTime, durata, cf)) {
      transisci(indiceProssimo(stateRef.current), true);
      return;
    }

    // Fine brano: senza dissolvenza il prossimo, già caricato, parte adesso.
    if (isEnded) {
      advancingRef.current = true;
      if (stateRef.current.repeat === 'one') {
        void player.seekTo(0).then(() => {
          player.play();
          advancingRef.current = false;
        }).catch(() => {
          advancingRef.current = false;
        });
      } else if (!transisci(indiceProssimo(stateRef.current), false)) {
        nextRef.current();
      }
    }
  };

  /** Carica un brano da zero nel player attivo: per le scelte dell'utente, o se il precaricamento non è pronto. */
  const loadAndPlayTrack = useCallback(async (queue: Track[], index: number) => {
    const track = queue[index];
    if (!track) {
      advancingRef.current = false;
      return;
    }

    // Qualunque cambio di brano deciso dall'utente annulla una transizione
    // in corso: altrimenti il brano nuovo partirebbe a metà dissolvenza.
    concludiTransizione();
    advancingRef.current = false;
    contatoRef.current = null;
    precaricatoRef.current = null;
    sorgentePendenteRef.current = false;
    seekPendenteRef.current = null;

    try {
      setState((s) => ({
        ...s,
        queue,
        index,
        current: track,
        currentTime: 0,
        duration: track.duration,
        isPlaying: true,
        isLoading: true,
        error: null,
      }));

      getPlayers();
      inAttesa()?.pause();
      const player = attivo()!;
      player.replace(urlDi(track));

      // Applicazione volume con loudness normalization nativa
      player.volume = calculateVolumeFor(track);
      mostraSuLockScreen(player, track);
      player.play();
      preparaProssimo(queue, index);
    } catch (err) {
      advancingRef.current = false;
      setState((s) => ({
        ...s,
        isPlaying: false,
        isLoading: false,
        error: err instanceof Error ? err.message : 'Errore riproduzione',
      }));
    }
  }, [concludiTransizione, getPlayers, attivo, inAttesa, urlDi, calculateVolumeFor, mostraSuLockScreen, preparaProssimo]);

  const next = useCallback(() => {
    const { queue, index, repeat } = stateRef.current;
    if (index < 0 || queue.length === 0) {
      advancingRef.current = false;
      return;
    }

    const isLast = index >= queue.length - 1;
    if (isLast && repeat !== 'all') {
      advancingRef.current = false;
      concludiTransizione();
      attivo()?.pause();
      setState((s) => ({ ...s, isPlaying: false }));
      return;
    }

    const nextIndex = isLast ? 0 : index + 1;
    // Se il prossimo è già caricato, il salto è istantaneo (senza dissolvenza:
    // chi preme "avanti" vuole sentire subito il brano nuovo).
    if (transisci(nextIndex, false)) return;
    void loadAndPlayTrack(queue, nextIndex);
  }, [loadAndPlayTrack, transisci, concludiTransizione, attivo]);

  nextRef.current = next;

  const previous = useCallback(() => {
    const { queue, index, currentTime } = stateRef.current;
    if (index < 0) return;

    // Se siamo oltre i 3 secondi, riparti da inizio brano
    if (currentTime > 3 || index === 0) {
      if (sorgentePendenteRef.current) {
        setState((s) => ({ ...s, currentTime: 0 }));
        return;
      }
      const player = attivo();
      if (!player) return;
      concludiTransizione();
      void player.seekTo(0);
      setState((s) => ({ ...s, currentTime: 0 }));
      return;
    }

    void loadAndPlayTrack(queue, index - 1);
  }, [loadAndPlayTrack, attivo, concludiTransizione]);

  // Smontaggio pulito delle risorse audio
  useEffect(() => {
    return () => {
      if (rampaRef.current) clearInterval(rampaRef.current);
      subscriptionsRef.current.forEach((sub) => sub.remove());
      subscriptionsRef.current = [];
      playersRef.current?.forEach((p) => p.remove());
      playersRef.current = null;
    };
  }, []);

  const playQueue = useCallback((tracks: Track[], startIndex = 0) => {
    if (tracks.length === 0) return;
    originalQueueRef.current = tracks;

    if (stateRef.current.shuffle) {
      const chosen = tracks[startIndex];
      const rest = shuffleArray(tracks.filter((_, i) => i !== startIndex));
      void loadAndPlayTrack([chosen, ...rest], 0);
    } else {
      void loadAndPlayTrack(tracks, startIndex);
    }
  }, [loadAndPlayTrack]);

  const playNext = useCallback((tracksInput: Track | Track[]) => {
    const items = Array.isArray(tracksInput) ? tracksInput : [tracksInput];
    if (items.length === 0) return;

    const { queue, index } = stateRef.current;
    if (index < 0) {
      void loadAndPlayTrack(items, 0);
      return;
    }

    const res = inserisciDopo({ queue, index }, items);
    originalQueueRef.current = res.queue;
    setState((s) => ({ ...s, queue: res.queue, index: res.index }));
  }, [loadAndPlayTrack]);

  const addToQueue = useCallback((tracksInput: Track | Track[]) => {
    const items = Array.isArray(tracksInput) ? tracksInput : [tracksInput];
    if (items.length === 0) return;

    const { queue, index } = stateRef.current;
    if (index < 0) {
      void loadAndPlayTrack(items, 0);
      return;
    }

    const res = accoda({ queue, index }, items);
    originalQueueRef.current = res.queue;
    setState((s) => ({ ...s, queue: res.queue }));
  }, [loadAndPlayTrack]);

  /** Primo play dopo una ripresa: solo ora si carica il file, e si torna al punto salvato. */
  const avviaRipresa = useCallback(() => {
    const s = stateRef.current;
    const track = s.current;
    if (!track) return;
    sorgentePendenteRef.current = false;
    getPlayers();
    const player = attivo()!;
    player.replace(urlDi(track));
    player.volume = calculateVolumeFor(track);
    mostraSuLockScreen(player, track);
    preparaProssimo(s.queue, s.index);
    // Come loadAndPlayTrack: il tasto mostra già la pausa mentre il file carica.
    setState((prev) => ({ ...prev, isPlaying: true, isLoading: true, error: null }));
    if (s.currentTime > 0) {
      seekPendenteRef.current = s.currentTime;
    } else {
      player.play();
    }
  }, [getPlayers, attivo, urlDi, calculateVolumeFor, mostraSuLockScreen, preparaProssimo]);

  const toggle = useCallback(() => {
    if (sorgentePendenteRef.current) {
      avviaRipresa();
      return;
    }
    // Un tocco mentre il brano ripreso sta ancora caricando vale come pausa:
    // si torna allo stato di prima, e il tocco successivo riprova da capo.
    // Senza, il brano partirebbe da zero e poi salterebbe al punto salvato.
    if (seekPendenteRef.current !== null) {
      seekPendenteRef.current = null;
      sorgentePendenteRef.current = true;
      attivo()?.pause();
      setState((s) => ({ ...s, isPlaying: false, isLoading: false }));
      return;
    }
    const player = attivo();
    if (!player || !stateRef.current.current) return;

    if (stateRef.current.isPlaying) {
      // Una pausa a metà dissolvenza la chiude: alla ripresa si sente un brano solo.
      concludiTransizione();
      player.pause();
    } else {
      player.play();
    }
  }, [attivo, concludiTransizione, avviaRipresa]);

  const seek = useCallback((seconds: number) => {
    // Brano ripreso ma non ancora caricato: si sposta solo il punto di partenza.
    // Se sta ancora caricando, si cambia il punto da raggiungere appena è pronto.
    if (sorgentePendenteRef.current || seekPendenteRef.current !== null) {
      if (seekPendenteRef.current !== null) seekPendenteRef.current = seconds;
      setState((s) => ({ ...s, currentTime: seconds }));
      return;
    }
    const player = attivo();
    if (!player) return;
    concludiTransizione();
    void player.seekTo(seconds);
    setState((s) => ({ ...s, currentTime: seconds }));
  }, [attivo, concludiTransizione]);

  const playAt = useCallback((i: number) => {
    const s = stateRef.current;
    if (i < 0 || i >= s.queue.length) return;
    // Il brano già in corso: un tocco lo fa ripartire se era in pausa, e basta.
    if (i === s.index) {
      if (!s.isPlaying) toggle();
      return;
    }
    void loadAndPlayTrack(s.queue, i);
  }, [loadAndPlayTrack, toggle]);

  /** Coda vuota: si ferma tutto, e non resta niente da riprendere alla prossima apertura. */
  const svuota = useCallback(() => {
    concludiTransizione();
    playersRef.current?.forEach((p) => p.pause());
    try {
      attivo()?.clearLockScreenControls();
    } catch {
      // Ignora se non supportato nel runtime corrente
    }
    sorgentePendenteRef.current = false;
    seekPendenteRef.current = null;
    precaricatoRef.current = null;
    originalQueueRef.current = [];
    setState((s) => ({
      ...s,
      queue: [],
      index: -1,
      current: null,
      isPlaying: false,
      isLoading: false,
      currentTime: 0,
      duration: 0,
      error: null,
    }));
    void AsyncStorage.multiRemove([CHIAVE_CODA, CHIAVE_POSIZIONE]).catch(() => undefined);
  }, [concludiTransizione, attivo]);

  const removeAt = useCallback((i: number) => {
    const s = stateRef.current;
    const r = togli({ queue: s.queue, index: s.index }, i);
    if (r.queue === s.queue) return;

    // L'ordine originale (quello a cui torna lo shuffle spento) perde lo
    // stesso brano: altrimenti spegnendo lo shuffle ricomparirebbe.
    if (s.shuffle) {
      const orig = [...originalQueueRef.current];
      const k = orig.indexOf(s.queue[i]);
      if (k >= 0) orig.splice(k, 1);
      originalQueueRef.current = orig;
    } else {
      originalQueueRef.current = r.queue;
    }

    if (r.index < 0) {
      svuota();
      return;
    }
    if (!r.cambiato) {
      riallineaPrecaricato(r.queue, r.index);
      setState((prev) => ({ ...prev, queue: r.queue, index: r.index }));
      return;
    }

    // Tolto il brano in ascolto. Se suonava, parte chi prende il suo posto.
    if (s.isPlaying) {
      void loadAndPlayTrack(r.queue, r.index);
      return;
    }
    // Se era in pausa, il nuovo resta in pausa: come per la ripresa, il file
    // si carica solo quando si preme play.
    concludiTransizione();
    attivo()?.pause();
    precaricatoRef.current = null;
    seekPendenteRef.current = null;
    sorgentePendenteRef.current = true;
    contatoRef.current = null;
    const track = r.queue[r.index];
    setState((prev) => ({
      ...prev,
      queue: r.queue,
      index: r.index,
      current: track,
      currentTime: 0,
      duration: track.duration,
      isPlaying: false,
      isLoading: false,
      error: null,
    }));
  }, [svuota, riallineaPrecaricato, loadAndPlayTrack, concludiTransizione, attivo]);

  const move = useCallback((from: number, to: number) => {
    const s = stateRef.current;
    const r = sposta({ queue: s.queue, index: s.index }, from, to);
    if (r.queue === s.queue) return;
    // Con lo shuffle spento la coda È l'ordine originale; con lo shuffle
    // acceso il riordino vale per questo giro, e spegnendolo si torna all'ordine di partenza.
    if (!s.shuffle) originalQueueRef.current = r.queue;
    riallineaPrecaricato(r.queue, r.index);
    setState((prev) => ({ ...prev, queue: r.queue, index: r.index }));
  }, [riallineaPrecaricato]);

  const setVolume = useCallback((v: number) => {
    const clamped = Math.max(0, Math.min(1, v));
    // Durante una dissolvenza ci pensa la rampa, al prossimo giro, a usare il volume nuovo.
    const player = attivo();
    if (player && !rampaRef.current) {
      player.volume = calculateVolumeFor(stateRef.current.current, clamped);
    }
    setState((s) => ({ ...s, volume: clamped }));
  }, [attivo, calculateVolumeFor]);

  const toggleShuffle = useCallback(() => {
    setState((s) => {
      const nextShuffle = !s.shuffle;
      if (s.index < 0 || s.queue.length === 0) {
        return { ...s, shuffle: nextShuffle };
      }

      const currentTrack = s.current;
      if (nextShuffle) {
        // Attivazione shuffle: tieni il brano corrente per primo
        const rest = shuffleArray(s.queue.filter((t) => t.id !== currentTrack?.id));
        const newQueue = currentTrack ? [currentTrack, ...rest] : rest;
        return { ...s, shuffle: nextShuffle, queue: newQueue, index: 0 };
      } else {
        // Ripristino ordine originale
        const orig = originalQueueRef.current;
        const newIndex = orig.findIndex((t) => t.id === currentTrack?.id);
        return { ...s, shuffle: nextShuffle, queue: orig, index: newIndex >= 0 ? newIndex : 0 };
      }
    });
  }, []);

  const cycleRepeat = useCallback(() => {
    setState((s) => {
      const modes: RepeatMode[] = ['off', 'all', 'one'];
      const nextMode = modes[(modes.indexOf(s.repeat) + 1) % modes.length];
      return { ...s, repeat: nextMode };
    });
  }, []);

  const toggleFavorite = useCallback(async (trackId?: number) => {
    const id = trackId ?? stateRef.current.current?.id;
    if (!id) return;

    const currentTrack = stateRef.current.queue.find((t) => t.id === id) ?? stateRef.current.current;
    const isCurrentlyFav = (currentTrack?.favorite ?? 0) === 1;
    const nextFav = !isCurrentlyFav;

    // Aggiornamento ottimistico
    setState((s) => {
      const updateTrack = (t: Track): Track => (t.id === id ? { ...t, favorite: nextFav ? 1 : 0 } : t);
      return {
        ...s,
        current: s.current ? updateTrack(s.current) : null,
        queue: s.queue.map(updateTrack),
      };
    });

    try {
      await api.toggleFavorite(id, nextFav);
    } catch {
      // rollback su errore
      setState((s) => {
        const rollbackTrack = (t: Track): Track => (t.id === id ? { ...t, favorite: isCurrentlyFav ? 1 : 0 } : t);
        return {
          ...s,
          current: s.current ? rollbackTrack(s.current) : null,
          queue: s.queue.map(rollbackTrack),
        };
      });
    }
  }, []);

  const value: PlayerContextApi = {
    ...state,
    playQueue,
    playNext,
    playAt,
    removeAt,
    move,
    addToQueue,
    toggle,
    next,
    previous,
    seek,
    setVolume,
    toggleShuffle,
    cycleRepeat,
    toggleFavorite,
    crossfade,
    setCrossfade,
    qualita,
    setQualita,
    normalizza,
    setNormalizza,
  };

  return <PlayerContext.Provider value={value}>{children}</PlayerContext.Provider>;
}

export function usePlayer(): PlayerContextApi {
  const context = useContext(PlayerContext);
  if (!context) {
    throw new Error('usePlayer deve essere usato dentro PlayerProvider');
  }
  return context;
}
