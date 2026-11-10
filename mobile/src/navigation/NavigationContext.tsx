import React, { createContext, useCallback, useContext, useState } from 'react';
import type { Album, Artist, PlaylistSummary, Track } from '../types';

export type NavRoute =
  | { type: 'album'; album: Album }
  | { type: 'artist'; artist: Artist }
  | { type: 'playlist'; playlist: PlaylistSummary };

export type NavigationContextType = {
  stack: NavRoute[];
  navigateToAlbum: (albumId: number, fallback?: Partial<Album>) => void;
  navigateToArtist: (artistId: number, fallback?: Partial<Artist>) => void;
  navigateToPlaylist: (playlist: PlaylistSummary) => void;
  goBack: () => void;
  resetStack: () => void;
  openAddToPlaylist: (tracks: Track[]) => void;
  closeAddToPlaylist: () => void;
  addToPlaylistTracks: Track[] | null;
};

const NavigationContext = createContext<NavigationContextType | null>(null);

export const NavigationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [stack, setStack] = useState<NavRoute[]>([]);
  const [addToPlaylistTracks, setAddToPlaylistTracks] = useState<Track[] | null>(null);

  const navigateToAlbum = useCallback((albumId: number, fallback?: Partial<Album>) => {
    const album: Album = {
      id: albumId,
      title: fallback?.title ?? '',
      artist: fallback?.artist ?? '',
      artistId: fallback?.artistId ?? 0,
      coverKey: fallback?.coverKey ?? null,
      year: fallback?.year ?? null,
      genre: fallback?.genre ?? null,
      trackCount: fallback?.trackCount ?? 0,
      duration: fallback?.duration ?? 0,
      hasCover: fallback?.hasCover ?? !!fallback?.coverKey,
    };
    setStack((s) => [...s, { type: 'album', album }]);
  }, []);

  const navigateToArtist = useCallback((artistId: number, fallback?: Partial<Artist>) => {
    const artist: Artist = {
      id: artistId,
      name: fallback?.name ?? '',
      albumCount: fallback?.albumCount ?? 0,
      trackCount: fallback?.trackCount ?? 0,
    };
    setStack((s) => [...s, { type: 'artist', artist }]);
  }, []);

  const navigateToPlaylist = useCallback((playlist: PlaylistSummary) => {
    setStack((s) => [...s, { type: 'playlist', playlist }]);
  }, []);

  const goBack = useCallback(() => {
    setStack((s) => (s.length > 0 ? s.slice(0, -1) : s));
  }, []);

  const resetStack = useCallback(() => {
    setStack([]);
  }, []);

  const openAddToPlaylist = useCallback((tracks: Track[]) => {
    if (tracks.length > 0) {
      setAddToPlaylistTracks(tracks);
    }
  }, []);

  const closeAddToPlaylist = useCallback(() => {
    setAddToPlaylistTracks(null);
  }, []);

  return (
    <NavigationContext.Provider
      value={{
        stack,
        navigateToAlbum,
        navigateToArtist,
        navigateToPlaylist,
        goBack,
        resetStack,
        openAddToPlaylist,
        closeAddToPlaylist,
        addToPlaylistTracks,
      }}
    >
      {children}
    </NavigationContext.Provider>
  );
};

export const useNavigation = (): NavigationContextType => {
  const ctx = useContext(NavigationContext);
  if (!ctx) {
    throw new Error('useNavigation deve essere usato all\'interno di NavigationProvider');
  }
  return ctx;
};
