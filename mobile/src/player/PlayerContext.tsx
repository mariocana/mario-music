import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { Platform } from 'react-native';
import {
  createAudioPlayer,
  requestNotificationPermissionsAsync,
  setAudioModeAsync,
  type AudioPlayer,
  type AudioStatus,
} from 'expo-audio';
import { api, coverUrl, streamUrl } from '../api';
import { accoda, inserisciDopo } from '../coda';
import { fattoreVolume } from '../loudness';
import { sogliaAscolto } from '../soglia';
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
  addToQueue: (tracks: Track | Track[]) => void;
  toggle: () => void;
  next: () => void;
  previous: () => void;
  seek: (seconds: number) => void;
  setVolume: (v: number) => void;
  toggleShuffle: () => void;
  cycleRepeat: () => void;
  toggleFavorite: (trackId?: number) => Promise<void>;
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
  const playerRef = useRef<AudioPlayer | null>(null);
  const subscriptionRef = useRef<{ remove: () => void } | null>(null);
  const advancingRef = useRef(false);
  const nextRef = useRef<() => void>(() => {});
  const originalQueueRef = useRef<Track[]>([]);
  const contatoRef = useRef<number | null>(null);

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

  const calculateVolumeFor = useCallback((track: Track | null, baseVolume = stateRef.current.volume) => {
    if (!track) return baseVolume;
    return baseVolume * fattoreVolume(track.loudness);
  }, []);

  const attachListener = useCallback((player: AudioPlayer) => {
    subscriptionRef.current?.remove();
    subscriptionRef.current = player.addListener('playbackStatusUpdate', (status: AudioStatus) => {
      const current = stateRef.current.current;

      setState((s) => ({
        ...s,
        isPlaying: status.playing,
        currentTime: status.currentTime,
        duration: status.duration > 0 ? status.duration : (current?.duration ?? s.duration),
        isLoading: status.isBuffering || !status.isLoaded,
      }));

      // Scrobbling conteggio ascolti
      if (
        current &&
        contatoRef.current !== current.id &&
        status.currentTime >= sogliaAscolto(status.duration || current.duration)
      ) {
        contatoRef.current = current.id;
        void api.recordPlay(current.id).catch(() => undefined);
      }

      // Fine brano / passaggio alla traccia successiva
      const isEnded = status.didJustFinish || status.playbackState === 'ended';
      if (isEnded && !advancingRef.current) {
        advancingRef.current = true;
        if (stateRef.current.repeat === 'one') {
          void player.seekTo(0).then(() => {
            player.play();
            advancingRef.current = false;
          }).catch(() => {
            advancingRef.current = false;
          });
        } else {
          nextRef.current();
        }
      }
    });
  }, []);

  const getOrCreatePlayer = useCallback((url?: string): AudioPlayer => {
    let player = playerRef.current;
    if (!player) {
      player = createAudioPlayer(url ?? null, {
        keepAudioSessionActive: true,
        updateInterval: 250,
      });
      playerRef.current = player;
      attachListener(player);
    } else if (url) {
      player.replace(url);
    }
    return player;
  }, [attachListener]);

  const loadAndPlayTrack = useCallback(async (queue: Track[], index: number) => {
    const track = queue[index];
    if (!track) {
      advancingRef.current = false;
      return;
    }

    advancingRef.current = false;
    contatoRef.current = null;
    const offlineUrl = getOfflineUri?.(track.id);
    const url = offlineUrl || streamUrl(track.id);

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

      const player = getOrCreatePlayer(url);

      // Applicazione volume con loudness normalization nativa
      player.volume = calculateVolumeFor(track);

      // Metadata lockscreen
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
          }
        );
      } catch {
        // Ignora se non supportato nel runtime corrente
      }

      player.play();
    } catch (err) {
      advancingRef.current = false;
      setState((s) => ({
        ...s,
        isPlaying: false,
        isLoading: false,
        error: err instanceof Error ? err.message : 'Errore riproduzione',
      }));
    }
  }, [calculateVolumeFor, getOrCreatePlayer]);

  const next = useCallback(() => {
    const { queue, index, repeat } = stateRef.current;
    if (index < 0 || queue.length === 0) {
      advancingRef.current = false;
      return;
    }

    const isLast = index >= queue.length - 1;
    if (isLast && repeat !== 'all') {
      advancingRef.current = false;
      playerRef.current?.pause();
      setState((s) => ({ ...s, isPlaying: false }));
      return;
    }

    const nextIndex = isLast ? 0 : index + 1;
    void loadAndPlayTrack(queue, nextIndex);
  }, [loadAndPlayTrack]);

  nextRef.current = next;

  const previous = useCallback(() => {
    const { queue, index, currentTime } = stateRef.current;
    const player = playerRef.current;
    if (!player || index < 0) return;

    // Se siamo oltre i 3 secondi, riparti da inizio brano
    if (currentTime > 3 || index === 0) {
      void player.seekTo(0);
      setState((s) => ({ ...s, currentTime: 0 }));
      return;
    }

    void loadAndPlayTrack(queue, index - 1);
  }, [loadAndPlayTrack]);

  // Smontaggio pulito delle risorse audio
  useEffect(() => {
    return () => {
      subscriptionRef.current?.remove();
      playerRef.current?.remove();
      playerRef.current = null;
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

  const toggle = useCallback(() => {
    const player = playerRef.current;
    if (!player || !stateRef.current.current) return;

    if (stateRef.current.isPlaying) {
      player.pause();
    } else {
      player.play();
    }
  }, []);

  const seek = useCallback((seconds: number) => {
    const player = playerRef.current;
    if (!player) return;
    void player.seekTo(seconds);
    setState((s) => ({ ...s, currentTime: seconds }));
  }, []);

  const setVolume = useCallback((v: number) => {
    const clamped = Math.max(0, Math.min(1, v));
    const player = playerRef.current;
    if (player) {
      player.volume = calculateVolumeFor(stateRef.current.current, clamped);
    }
    setState((s) => ({ ...s, volume: clamped }));
  }, [calculateVolumeFor]);

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
    addToQueue,
    toggle,
    next,
    previous,
    seek,
    setVolume,
    toggleShuffle,
    cycleRepeat,
    toggleFavorite,
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
