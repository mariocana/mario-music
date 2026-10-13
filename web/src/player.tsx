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
import { coverUrl, send } from './api.ts';
import { useDownloads } from './downloads.tsx';
import { urlBrano, qualitaCorrente } from './sorgente.ts';
import { accoda, inserisciDopo } from './coda.ts';
import {
  crossfadeCorrente, deveIniziare, devePrecaricare, durataEffettiva, guadagni, volumeControllabile,
} from './gapless.ts';
import { volumeDelBrano, sottoscriviNormalizza } from './loudness.ts';
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
  /** infila un brano, o un album intero, subito dopo quello in ascolto */
  playNext: (tracks: Track | Track[]) => void;
  /** aggiunge in fondo alla coda */
  addToQueue: (tracks: Track | Track[]) => void;
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
  /*
   * DUE elementi audio, non uno.
   *
   * Mentre il primo suona, il secondo tiene già in carica il brano
   * successivo: quando è il momento parte subito, senza il silenzio che
   * serviva per chiedere il file alla rete e leggerne l'intestazione (vedi
   * gapless.ts). A fine transizione i due si scambiano i ruoli.
   *
   * `attivo` dice quale dei due sta suonando adesso; `audioRef` resta il modo
   * in cui tutto il resto del player chiede "l'elemento corrente", così il
   * codice che c'era prima continua a funzionare senza sapere niente di tutto
   * questo.
   */
  const elementiRef = useRef<[HTMLAudioElement, HTMLAudioElement] | null>(null);
  const attivoRef = useRef(0);
  if (elementiRef.current === null && typeof Audio !== 'undefined') {
    const crea = () => {
      const audio = new Audio();
      // 'metadata' scaricherebbe solo l'intestazione: con 'auto' diciamo al
      // browser che può riempire il buffer in anticipo, come fa Apple Music.
      audio.preload = 'auto';
      return audio;
    };
    elementiRef.current = [crea(), crea()];
  }
  const audioRef = {
    get current(): HTMLAudioElement | null {
      return elementiRef.current?.[attivoRef.current] ?? null;
    },
  };
  /**
   * Il volume con cui deve suonare un certo brano su un certo elemento:
   * quello scelto dall'utente, corretto per il livellamento (loudness.ts) e
   * infine moltiplicato per la rampa, quando c'è una dissolvenza in corso.
   *
   * Tutto passa di qui: è l'unico modo per non ritrovarsi tre pezzi di codice
   * che scrivono `volume` ognuno per conto suo e si sovrascrivono a vicenda.
   */
  const volumePer = (track: Track | null | undefined, rampa = 1): number => {
    const s = stateRef.current;
    if (s.muted) return 0;
    return s.volume * volumeDelBrano(track?.loudness) * rampa;
  };

  /** L'elemento fermo, quello che tiene in carica il brano successivo. */
  const inAttesa = (): HTMLAudioElement | null =>
    elementiRef.current?.[1 - attivoRef.current] ?? null;

  /**
   * Su iPhone e iPad scrivere `volume` non ha effetto: il volume è solo quello
   * dei tasti fisici. Lo si scopre provando, una volta sola (vedi
   * volumeControllabile): dove non risponde, la dissolvenza incrociata non è
   * possibile e resta il gapless, che del volume non ha bisogno.
   */
  const volumeOkRef = useRef(false);
  if (elementiRef.current && !volumeOkRef.current) {
    volumeOkRef.current = volumeControllabile(elementiRef.current[0]);
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

  // L'URL di un brano dipende da tre cose (vedi sorgente.ts): se è scaricato,
  // se il browser ne legge il formato, se l'utente vuole risparmiare dati.
  // I download stanno in un ref, non in una dipendenza: un download in più
  // non deve far ricostruire load() e con lui tutti i listener dell'audio.
  const downloads = useDownloads();
  const scaricatiRef = useRef(downloads.items);
  scaricatiRef.current = downloads.items;
  const srcDi = (track: Track) => urlBrano(track.id, track.codec, {
    scaricato: scaricatiRef.current.has(track.id),
    qualita: qualitaCorrente(),
    canPlay: (mime) => audioRef.current?.canPlayType(mime) ?? 'maybe',
  });

  /**
   * Il brano dopo, se andrà convertito, lo si fa preparare adesso: quando
   * toccherà a lui il file sarà già pronto e partirà senza attesa.
   */
  const prepara = (queue: Track[], index: number) => {
    const prossimo = queue[index + 1] ?? (stateRef.current.repeat === 'all' ? queue[0] : undefined);
    if (!prossimo || !srcDi(prossimo).includes('format=aac')) return;
    void send(`/api/tracks/${prossimo.id}/prepare`, 'POST').catch(() => undefined);
  };

  /**
   * play() è asincrono e può essere rifiutato. Tre casi, da distinguere:
   *   AbortError      → l'utente ha premuto pausa o cambiato brano mentre il
   *                     file stava ancora caricando (con la transcodifica può
   *                     volerci qualche secondo). Non è un errore: silenzio.
   *   NotAllowedError → il browser vuole un gesto dell'utente prima di suonare.
   *   tutto il resto  → il file non si carica: si mostra il motivo vero.
   */
  const avvia = useCallback((audio: HTMLAudioElement) => (
    audio.play().catch((err: DOMException) => {
      if (err.name === 'AbortError') return;
      if (err.name === 'NotAllowedError') {
        patch({ isPlaying: false, error: 'Il browser ha bloccato la riproduzione automatica: premi play.' });
      } else {
        patch({ isPlaying: false, error: `Riproduzione fallita: ${err.message}` });
      }
    })
  ), [patch]);

  /* ──────────────── gapless: il brano dopo è già in carica ────────────────
   *
   * `precaricato` ricorda quale posizione della coda sta nell'elemento in
   * attesa: senza, dopo un cambio di coda si rischierebbe di far partire il
   * brano sbagliato — quello che era "il prossimo" un minuto fa.
   */
  const precaricatoRef = useRef<{ index: number; id: number } | null>(null);
  /** Il timer della dissolvenza, da fermare se l'utente cambia brano a metà. */
  const rampaRef = useRef<ReturnType<typeof setInterval> | null>(null);
  /** Controllo ravvicinato negli ultimi secondi: timeupdate arriva 4 volte al secondo. */
  const vigilRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fermaTimer = useCallback(() => {
    if (rampaRef.current) { clearInterval(rampaRef.current); rampaRef.current = null; }
    if (vigilRef.current) { clearInterval(vigilRef.current); vigilRef.current = null; }
  }, []);

  /**
   * Chiude in anticipo una dissolvenza in corso: spegne il brano uscente e
   * riporta quello nuovo a volume pieno.
   *
   * Serve ogni volta che la dissolvenza viene interrotta da fuori — una pausa,
   * un cambio di brano. Senza, i volumi restano congelati a metà strada: si
   * riprende e il brano suona per sempre al sessanta per cento, senza che si
   * capisca perché.
   */
  const concludiTransizione = useCallback(() => {
    const inCorso = rampaRef.current !== null;
    fermaTimer();
    if (!inCorso) return;
    inAttesa()?.pause();
    const attivo = audioRef.current;
    if (volumeOkRef.current && attivo) attivo.volume = volumePer(stateRef.current.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fermaTimer]);

  /** Carica una traccia nell'elemento audio e prova a farla partire. */
  const load = useCallback((queue: Track[], index: number, autoplay: boolean) => {
    const audio = audioRef.current;
    const track = queue[index];
    if (!audio || !track) return;

    // Qualunque cambio di brano deciso dall'utente annulla una transizione in
    // corso: si fermano i timer, si zittisce l'altro elemento e si rimette il
    // volume pieno — altrimenti il brano nuovo partirebbe a metà dissolvenza,
    // cioè quasi muto.
    concludiTransizione();
    fermaTimer();
    inAttesa()?.pause();
    // Il volume è quello del brano che sta per partire: con il livellamento
    // attivo ogni traccia ha il suo (vedi volumePer).
    if (volumeOkRef.current) audio.volume = volumePer(track);
    precaricatoRef.current = null;

    audio.src = srcDi(track);
    prepara(queue, index);
    contatoRef.current = null;
    seekInSospeso.current = null;
    patch({ queue, index, current: track, currentTime: 0, duration: track.duration, buffered: 0, error: null, isLoading: true });

    if (autoplay) void avvia(audio);
  }, [patch, avvia, concludiTransizione, fermaTimer]);

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

  /** Qual è il brano dopo, tenendo conto della ripetizione. -1 se non c'è. */
  const indiceProssimo = useCallback((s: PlayerState): number => {
    if (s.index < 0 || s.repeat === 'one') return -1;
    if (s.index < s.queue.length - 1) return s.index + 1;
    return s.repeat === 'all' ? 0 : -1;
  }, []);

  /** Mette il brano successivo nell'elemento fermo e lo lascia caricare. */
  const precarica = useCallback(() => {
    const s = stateRef.current;
    const i = indiceProssimo(s);
    const altro = inAttesa();
    const track = i >= 0 ? s.queue[i] : undefined;
    if (!altro || !track) return;
    if (precaricatoRef.current?.index === i && precaricatoRef.current.id === track.id) return;

    altro.src = srcDi(track);
    altro.load();
    precaricatoRef.current = { index: i, id: track.id };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [indiceProssimo]);

  /**
   * Il passaggio vero e proprio: il secondo elemento parte, il primo si
   * spegne — di colpo se non c'è dissolvenza, con la curva equal-power se c'è
   * (vedi guadagni() in gapless.ts).
   */
  const transisci = useCallback(() => {
    const s = stateRef.current;
    const i = indiceProssimo(s);
    const uscente = audioRef.current;
    const entrante = inAttesa();
    const track = i >= 0 ? s.queue[i] : undefined;
    if (!uscente || !entrante || !track) return false;
    if (precaricatoRef.current?.index !== i || precaricatoRef.current.id !== track.id) return false;

    fermaTimer();
    const cf = durataEffettiva(crossfadeCorrente(), uscente.duration || track.duration);
    const dissolve = cf > 0 && volumeOkRef.current;
    const inAscolto = s.current;

    entrante.currentTime = 0;
    entrante.muted = s.muted;
    // Il brano entrante parte dal suo volume (non da quello del precedente:
    // con il livellamento i due possono essere molto diversi).
    if (volumeOkRef.current) entrante.volume = dissolve ? 0 : volumePer(track);

    // Lo scambio dei ruoli avviene subito: da questo momento "l'elemento
    // attivo" è quello nuovo, e tutto il resto del player (barra, ripresa,
    // Media Session) guarda lui.
    attivoRef.current = 1 - attivoRef.current;
    precaricatoRef.current = null;
    contatoRef.current = null;
    seekInSospeso.current = null;
    void avvia(entrante);
    patch({ index: i, current: track, currentTime: 0, duration: track.duration, buffered: 0, error: null });
    prepara(s.queue, i);

    if (!dissolve) {
      uscente.pause();
      return true;
    }

    // La rampa si regola sul tempo vero del brano entrante, non su un
    // contatore nostro: se il browser rallenta, i volumi restano in accordo
    // con quello che si sente davvero.
    rampaRef.current = setInterval(() => {
      const p = Math.min(1, entrante.currentTime / cf);
      const g = guadagni(p);
      uscente.volume = volumePer(inAscolto, g.uscente);
      entrante.volume = volumePer(track, g.entrante);
      if (p >= 1) {
        fermaTimer();
        uscente.pause();
        uscente.volume = volumePer(inAscolto);
      }
    }, 50);
    return true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [indiceProssimo, fermaTimer, avvia, patch]);

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
    // (I download qui non sono ancora noti: con rete l'URL normale funziona
    // sempre.)
    audio.src = srcDi(track);
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

  /* ── eventi degli elementi audio → stato React ──
   *
   * I gestori stanno su ENTRAMBI gli elementi, ma lavorano solo per quello
   * attivo: l'altro, mentre carica o finisce di sfumare, continua a emettere
   * timeupdate ed ended, e senza questo filtro la barra impazzirebbe e il
   * brano successivo verrebbe saltato due volte.
   */
  useEffect(() => {
    const elementi = elementiRef.current;
    if (!elementi) return;
    const audio = elementi[attivoRef.current];
    const suoi = (e: Event) => e.target === elementiRef.current?.[attivoRef.current];

    /**
     * Il controllo che decide tutto: prima mette in carica il brano dopo,
     * poi, al momento giusto, lo fa partire. Lo chiama `timeupdate` (quattro
     * volte al secondo) e, negli ultimi due secondi, un timer più fitto:
     * quattro volte al secondo basta per una barra, non per un attacco che
     * non si deve sentire.
     */
    const sorveglia = (audio: HTMLAudioElement) => {
      const s = stateRef.current;
      if (!s.isPlaying || s.repeat === 'one') return;
      const durata = audio.duration || s.duration;
      const cf = crossfadeCorrente();
      if (!Number.isFinite(durata) || durata <= 0) return;

      if (devePrecaricare(audio.currentTime, durata, cf)) precarica();

      const manca = durata - durataEffettiva(cf, durata) - audio.currentTime;
      if (manca <= 2 && !vigilRef.current && !rampaRef.current) {
        vigilRef.current = setInterval(() => {
          const a = audioRef.current;
          if (!a) return;
          if (deveIniziare(a.currentTime, a.duration || durata, crossfadeCorrente())) {
            if (vigilRef.current) { clearInterval(vigilRef.current); vigilRef.current = null; }
            transisci();
          }
        }, 50);
      }
      if (deveIniziare(audio.currentTime, durata, cf) && !rampaRef.current) transisci();
    };

    const onTime = (e: Event) => {
      if (!suoi(e)) return;
      const audio = e.target as HTMLAudioElement;
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

      sorveglia(audio);
    };
    const onMeta = (e: Event) => {
      if (!suoi(e)) return;
      const audio = e.target as HTMLAudioElement;
      // Impostare currentTime prima che l'audio conosca la sua durata non
      // attacca su tutti i browser (iOS in testa): si aspetta questo evento.
      if (seekInSospeso.current !== null) {
        audio.currentTime = Math.min(seekInSospeso.current, audio.duration || Infinity);
        seekInSospeso.current = null;
      }
      patch({ duration: audio.duration, isLoading: false });
    };
    const onPlay = (e: Event) => { if (suoi(e)) patch({ isPlaying: true, error: null }); };
    const onPause = (e: Event) => { if (suoi(e)) { patch({ isPlaying: false }); salvaRipresa(); } };
    const onWaiting = (e: Event) => { if (suoi(e)) patch({ isLoading: true }); };
    const onPlaying = (e: Event) => { if (suoi(e)) patch({ isLoading: false }); };
    const onError = (e: Event) => {
      // Un errore sull'elemento in attesa non è un problema dell'ascolto in
      // corso: si dimentica il precaricamento e si riproverà alla fine.
      if (!suoi(e)) { precaricatoRef.current = null; return; }
      const audio = e.target as HTMLAudioElement;

      /*
       * Ripiego sulla conversione completa.
       *
       * Un brano non ancora convertito arriva mentre viene scritto, in una
       * risposta senza lunghezza dichiarata (vedi transcode.ts). Non tutti i
       * lettori la digeriscono, e non c'è modo di saperlo in anticipo: si
       * prova, e se va male si richiede lo stesso brano con `full=1`, che
       * aspetta la fine della conversione e risponde come un file qualunque.
       * Qualche secondo di attesa invece di un errore.
       */
      if (audio.src.includes('format=aac') && !audio.src.includes('full=1')) {
        const posizione = audio.currentTime;
        audio.src = `${audio.src}&full=1`;
        seekInSospeso.current = posizione > 0 ? posizione : null;
        if (stateRef.current.isPlaying) void avvia(audio);
        return;
      }
      patch({ isLoading: false, isPlaying: false, error: 'Impossibile leggere questo file audio.' });
    };
    const onEnded = (e: Event) => {
      if (!suoi(e)) return;
      fermaTimer();
      const attivo = audioRef.current;
      if (attivo && stateRef.current.repeat === 'one') {
        attivo.currentTime = 0;
        void attivo.play();
        return;
      }
      // Se la transizione è già avvenuta questo 'ended' arriva dall'elemento
      // vecchio, che non è più l'attivo: il filtro qui sopra l'ha già
      // scartato. Qui ci si arriva solo quando il gapless non ha funzionato
      // (niente precaricato, o coda cambiata all'ultimo), e allora si fa
      // come si è sempre fatto.
      next();
    };

    const eventi: Array<[string, (e: Event) => void]> = [
      ['timeupdate', onTime], ['progress', onTime],
      ['loadedmetadata', onMeta], ['durationchange', onMeta],
      ['play', onPlay], ['pause', onPause],
      ['waiting', onWaiting], ['playing', onPlaying],
      ['error', onError], ['ended', onEnded],
    ];
    for (const el of elementi) for (const [nome, fn] of eventi) el.addEventListener(nome, fn);
    return () => {
      for (const el of elementi) for (const [nome, fn] of eventi) el.removeEventListener(nome, fn);
    };
  }, [next, patch, precarica, transisci, fermaTimer, salvaRipresa, avvia]);

  /* ── il livellamento si accende e si spegne mentre la musica va ──
   * Senza questo, accendere l'interruttore non avrebbe effetto fino al brano
   * successivo: il volume si decide al caricamento, e quello è già passato.
   */
  useEffect(() => sottoscriviNormalizza(() => {
    const audio = audioRef.current;
    if (audio && volumeOkRef.current && rampaRef.current === null) {
      audio.volume = volumePer(stateRef.current.current);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), []);

  /* ── alla chiusura non restano timer appesi ── */
  useEffect(() => fermaTimer, [fermaTimer]);

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
      if (audio.paused) void avvia(audio);
      else {
        // In mezzo a una dissolvenza suonano in due: si chiude la transizione
        // (l'uscente si ferma, i volumi tornano pieni) e poi si mette in pausa.
        concludiTransizione();
        audio.pause();
      }
    },
    playAt: (index) => {
      const s = stateRef.current;
      if (index >= 0 && index < s.queue.length) load(s.queue, index, true);
    },
    // Le due operazioni sulla coda stanno in coda.ts, come funzioni pure:
    // là si possono provare con dei test, qui dentro no. Entrambe accettano
    // un brano o un blocco — un album va inserito in un colpo solo, altrimenti
    // l'ordine si rovescia (vedi il commento in coda.ts).
    playNext: (tracks) => {
      const blocco = Array.isArray(tracks) ? tracks : [tracks];
      setState((s) => {
        if (blocco.length === 0) return s;
        // Coda vuota: non c'è un "dopo", si comincia da qui.
        if (s.index < 0) {
          queueMicrotask(() => load(blocco, 0, true));
          return s;
        }
        const nuova = inserisciDopo({ queue: s.queue, index: s.index }, blocco);
        sourceRef.current = nuova.queue;
        return { ...s, queue: nuova.queue, index: nuova.index };
      });
    },
    addToQueue: (tracks) => {
      const blocco = Array.isArray(tracks) ? tracks : [tracks];
      setState((s) => {
        if (blocco.length === 0) return s;
        if (s.index < 0) {
          queueMicrotask(() => load(blocco, 0, true));
          return s;
        }
        const nuova = accoda({ queue: s.queue, index: s.index }, blocco);
        sourceRef.current = nuova.queue;
        return { ...s, queue: nuova.queue };
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
      // Mentre un brano carica, `audio.duration` è NaN: usarla come limite
      // porterebbe ogni salto a zero. La durata vera sta nel catalogo.
      const durata = Number.isFinite(audio.duration) && audio.duration > 0
        ? audio.duration
        : stateRef.current.duration;
      const dove = Math.max(0, durata > 0 ? Math.min(seconds, durata) : seconds);

      // Se stiamo già aspettando un caricamento, si cambia la destinazione
      // invece di scrivere su un elemento che non è pronto a riceverla.
      if (seekInSospeso.current !== null) {
        seekInSospeso.current = dove;
        patch({ currentTime: dove });
        return;
      }

      /*
       * Un brano che sta ancora venendo convertito arriva senza possibilità di
       * salto (vedi transcode.ts): `seekable` è vuoto, e assegnare currentTime
       * non porta dove si è chiesto — il brano riparte da capo, e sembra
       * rotto. In quel caso si richiede lo stesso brano in versione completa e
       * si salta lì: si aspettano i secondi della conversione, una volta sola,
       * ma la barra fa quello che dice di fare.
       */
      const puoSaltare = Array.from({ length: audio.seekable.length })
        .some((_, i) => audio.seekable.start(i) <= dove && dove <= audio.seekable.end(i));
      if (!puoSaltare && audio.src.includes('format=aac') && !audio.src.includes('full=1')) {
        const suonava = !audio.paused;
        seekInSospeso.current = dove;
        audio.src = `${audio.src}&full=1`;
        patch({ currentTime: dove, isLoading: true });
        if (suonava) void avvia(audio);
        return;
      }

      // Assegnare currentTime fa partire una nuova richiesta HTTP con Range:
      // è letteralmente questa riga a innescare il seek lato rete.
      audio.currentTime = dove;
      patch({ currentTime: audio.currentTime });
    },
    setVolume: (v) => {
      const audio = audioRef.current;
      if (!audio) return;
      stateRef.current = { ...stateRef.current, volume: v, muted: false };
      for (const el of elementiRef.current ?? []) el.muted = false;
      // Solo all'elemento che suona: l'altro riceverà il suo quando tocca a
      // lui, e il suo volume dipende dal brano che contiene.
      audio.volume = volumePer(stateRef.current.current);
      patch({ volume: v, muted: false });
    },
    toggleMute: () => {
      const audio = audioRef.current;
      if (!audio) return;
      const muto = !audio.muted;
      for (const el of elementiRef.current ?? []) el.muted = muto;
      patch({ muted: muto });
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
