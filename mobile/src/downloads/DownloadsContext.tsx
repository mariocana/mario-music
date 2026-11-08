import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import { streamUrl } from '../api';
import type { Track } from '../types';

export type DownloadedItem = {
  track: Track;
  localUri: string;
  size: number;
  downloadedAt: number;
};

type DownloadsContextType = {
  items: Map<number, DownloadedItem>;
  progress: Map<number, number>;
  loading: boolean;
  totalBytes: number;
  isDownloaded: (trackId: number) => boolean;
  getLocalUri: (trackId: number) => string | null;
  downloadTrack: (track: Track) => Promise<void>;
  downloadTracks: (tracks: Track[]) => Promise<void>;
  removeTrack: (trackId: number) => Promise<void>;
  clearAll: () => Promise<void>;
};

const DownloadsContext = createContext<DownloadsContextType | null>(null);

const STORAGE_KEY = '@mariomusic/offline_tracks_v1';
const TRACKS_DIR = `${FileSystem.documentDirectory || ''}offline_tracks/`;

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  const gb = mb / 1024;
  return `${gb.toFixed(2)} GB`;
}

export const DownloadsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [items, setItems] = useState<Map<number, DownloadedItem>>(new Map());
  const [progress, setProgress] = useState<Map<number, number>>(new Map());
  const [loading, setLoading] = useState(true);

  // Assicura che la directory esista
  const ensureDirectory = async () => {
    try {
      const dirInfo = await FileSystem.getInfoAsync(TRACKS_DIR);
      if (!dirInfo.exists) {
        await FileSystem.makeDirectoryAsync(TRACKS_DIR, { intermediates: true });
      }
    } catch {
      // ignore
    }
  };

  // Carica i brani salvati da AsyncStorage e verifica che i file esistano
  const loadStored = useCallback(async () => {
    try {
      await ensureDirectory();
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (!raw) {
        setItems(new Map());
        setLoading(false);
        return;
      }
      const parsed = JSON.parse(raw) as DownloadedItem[];
      const validMap = new Map<number, DownloadedItem>();

      for (const item of parsed) {
        try {
          const info = await FileSystem.getInfoAsync(item.localUri);
          if (info.exists) {
            validMap.set(item.track.id, {
              ...item,
              size: (info as { size?: number }).size ?? item.size,
            });
          }
        } catch {
          // File mancante, non includere
        }
      }

      setItems(validMap);
    } catch {
      setItems(new Map());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadStored();
  }, [loadStored]);

  // Salva l'elenco corrente in AsyncStorage
  const persist = async (map: Map<number, DownloadedItem>) => {
    try {
      const array = Array.from(map.values());
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(array));
    } catch {
      // ignore
    }
  };

  const isDownloaded = useCallback(
    (trackId: number): boolean => {
      return items.has(trackId);
    },
    [items]
  );

  const getLocalUri = useCallback(
    (trackId: number): string | null => {
      const found = items.get(trackId);
      return found ? found.localUri : null;
    },
    [items]
  );

  const downloadTrack = useCallback(async (track: Track) => {
    await ensureDirectory();
    const localUri = `${TRACKS_DIR}track_${track.id}.mp3`;

    try {
      setProgress((prev) => new Map(prev).set(track.id, 0.05));

      const downloadResumable = FileSystem.createDownloadResumable(
        streamUrl(track.id),
        localUri,
        {},
        (downloadProgress) => {
          if (downloadProgress.totalBytesExpectedToWrite > 0) {
            const p =
              downloadProgress.totalBytesWritten /
              downloadProgress.totalBytesExpectedToWrite;
            setProgress((prev) => new Map(prev).set(track.id, Math.max(0.05, Math.min(1, p))));
          }
        }
      );

      const result = await downloadResumable.downloadAsync();
      const info = await FileSystem.getInfoAsync(localUri);
      const size = (info as { size?: number }).size ?? track.size ?? 0;

      const newItem: DownloadedItem = {
        track,
        localUri: result?.uri || localUri,
        size,
        downloadedAt: Date.now(),
      };

      setItems((prev) => {
        const next = new Map(prev).set(track.id, newItem);
        void persist(next);
        return next;
      });
    } catch (err) {
      // Rimuovi file parziale se fallito
      try {
        await FileSystem.deleteAsync(localUri, { idempotent: true });
      } catch {
        // ignore
      }
      throw err;
    } finally {
      setProgress((prev) => {
        const next = new Map(prev);
        next.delete(track.id);
        return next;
      });
    }
  }, []);

  const downloadTracks = useCallback(
    async (tracks: Track[]) => {
      for (const track of tracks) {
        if (!items.has(track.id)) {
          try {
            await downloadTrack(track);
          } catch {
            // Un brano fallito non blocca i successivi
          }
        }
      }
    },
    [items, downloadTrack]
  );

  const removeTrack = useCallback(async (trackId: number) => {
    const localUri = `${TRACKS_DIR}track_${trackId}.mp3`;
    try {
      await FileSystem.deleteAsync(localUri, { idempotent: true });
    } catch {
      // ignore
    }
    setItems((prev) => {
      const next = new Map(prev);
      next.delete(trackId);
      void persist(next);
      return next;
    });
  }, []);

  const clearAll = useCallback(async () => {
    try {
      await FileSystem.deleteAsync(TRACKS_DIR, { idempotent: true });
      await AsyncStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
    setItems(new Map());
  }, []);

  const totalBytes = useMemo(() => {
    let sum = 0;
    for (const item of items.values()) {
      sum += item.size;
    }
    return sum;
  }, [items]);

  const value = useMemo(
    () => ({
      items,
      progress,
      loading,
      totalBytes,
      isDownloaded,
      getLocalUri,
      downloadTrack,
      downloadTracks,
      removeTrack,
      clearAll,
    }),
    [
      items,
      progress,
      loading,
      totalBytes,
      isDownloaded,
      getLocalUri,
      downloadTrack,
      downloadTracks,
      removeTrack,
      clearAll,
    ]
  );

  return <DownloadsContext.Provider value={value}>{children}</DownloadsContext.Provider>;
};

export function useDownloads(): DownloadsContextType {
  const ctx = useContext(DownloadsContext);
  if (!ctx) {
    throw new Error('useDownloads must be used within DownloadsProvider');
  }
  return ctx;
}
