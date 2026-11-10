import React, { useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet, View } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { AddToPlaylistModal } from './src/components/AddToPlaylistModal';
import { MiniPlayer } from './src/components/MiniPlayer';
import { MobileTabBar, type TabType } from './src/components/MobileTabBar';
import { NowPlayingModal } from './src/components/NowPlayingModal';
import { initConfig } from './src/config';
import { DownloadsProvider, useDownloads } from './src/downloads/DownloadsContext';
import { NavigationProvider, useNavigation } from './src/navigation/NavigationContext';
import { PlayerProvider } from './src/player/PlayerContext';
import { AlbumDetailModal } from './src/screens/AlbumDetailModal';
import { AlbumsScreen } from './src/screens/AlbumsScreen';
import { ArtistDetailModal } from './src/screens/ArtistDetailModal';
import { ArtistsScreen } from './src/screens/ArtistsScreen';
import { DownloadsScreen } from './src/screens/DownloadsScreen';
import { FavoritesScreen } from './src/screens/FavoritesScreen';
import { HomeScreen } from './src/screens/HomeScreen';
import { LibraryScreen, type LibrarySubScreen } from './src/screens/LibraryScreen';
import { ListeningScreen } from './src/screens/ListeningScreen';
import { PlaylistDetailModal } from './src/screens/PlaylistDetailModal';
import { PlaylistsScreen } from './src/screens/PlaylistsScreen';
import { SearchScreen } from './src/screens/SearchScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';
import { SongsScreen } from './src/screens/SongsScreen';
import { theme } from './src/theme';
import type { Album, Artist, PlaylistSummary } from './src/types';

function MainApp() {
  const insets = useSafeAreaInsets();
  const [activeTab, setActiveTab] = useState<TabType>('home');
  const [librarySubScreen, setLibrarySubScreen] = useState<LibrarySubScreen | null>(null);

  const {
    stack,
    goBack,
    resetStack,
    navigateToAlbum,
    navigateToArtist,
    navigateToPlaylist,
    addToPlaylistTracks,
    closeAddToPlaylist,
  } = useNavigation();

  const [nowPlayingVisible, setNowPlayingVisible] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    void initConfig().finally(() => setReady(true));
  }, []);

  if (!ready) {
    return <View style={styles.container} />;
  }

  const handleTabChange = (tab: TabType) => {
    if (tab !== activeTab) {
      resetStack();
      setActiveTab(tab);
    } else {
      // Tap sulla scheda già attiva: torna alla radice della schermata
      if (stack.length > 0) {
        resetStack();
      } else if (tab === 'library') {
        setLibrarySubScreen(null);
      }
    }
  };

  const handleLibraryNavigate = (target: LibrarySubScreen) => {
    if (target === 'playlists') {
      resetStack();
      setActiveTab('playlists');
    } else if (target === 'favorites') {
      resetStack();
      setActiveTab('favorites');
    } else {
      setLibrarySubScreen(target);
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar style="light" />

      {/* Vista schermata corrente con dettagli inline: la barra di riproduzione e navigazione restano SEMPRE in primo piano */}
      <View style={styles.screenContent}>
        {stack.length > 0 ? (
          (() => {
            const currentRoute = stack[stack.length - 1];
            if (currentRoute.type === 'album') {
              return (
                <AlbumDetailModal
                  album={currentRoute.album}
                  onBack={goBack}
                />
              );
            }
            if (currentRoute.type === 'artist') {
              return (
                <ArtistDetailModal
                  artist={currentRoute.artist}
                  onBack={goBack}
                  onSelectAlbum={(alb) => navigateToAlbum(alb.id, alb)}
                />
              );
            }
            if (currentRoute.type === 'playlist') {
              return (
                <PlaylistDetailModal
                  playlist={currentRoute.playlist}
                  onBack={goBack}
                  onPlaylistDeleted={goBack}
                />
              );
            }
            return null;
          })()
        ) : (
          <>
            {activeTab === 'home' && (
              <HomeScreen
                onSelectAlbum={(alb) => navigateToAlbum(alb.id, alb)}
                onOpenListening={() => {
                  setActiveTab('library');
                  setLibrarySubScreen('listening');
                }}
              />
            )}

            {activeTab === 'library' && (
              <>
                {librarySubScreen === null && (
                  <LibraryScreen onNavigate={handleLibraryNavigate} />
                )}
                {librarySubScreen === 'artists' && (
                  <ArtistsScreen
                    onBack={() => setLibrarySubScreen(null)}
                    onSelectArtist={(art) => navigateToArtist(art.id, art)}
                  />
                )}
                {librarySubScreen === 'songs' && (
                  <SongsScreen onBack={() => setLibrarySubScreen(null)} />
                )}
                {librarySubScreen === 'albums' && (
                  <AlbumsScreen
                    onBack={() => setLibrarySubScreen(null)}
                    onSelectAlbum={(alb) => navigateToAlbum(alb.id, alb)}
                  />
                )}
                {librarySubScreen === 'listening' && (
                  <ListeningScreen onBack={() => setLibrarySubScreen(null)} />
                )}
                {librarySubScreen === 'downloads' && (
                  <DownloadsScreen onBack={() => setLibrarySubScreen(null)} />
                )}
                {librarySubScreen === 'settings' && (
                  <SettingsScreen onBack={() => setLibrarySubScreen(null)} />
                )}
              </>
            )}

            {activeTab === 'playlists' && (
              <PlaylistsScreen onSelectPlaylist={navigateToPlaylist} />
            )}

            {activeTab === 'favorites' && <FavoritesScreen />}

            {activeTab === 'search' && <SearchScreen />}
          </>
        )}
      </View>

      {/* Mini Player fluttuante - SEMPRE IN PRIMO PIANO */}
      <MiniPlayer onPress={() => setNowPlayingVisible(true)} />

      {/* Barra schede a pillola + ricerca stile Web - SEMPRE IN PRIMO PIANO */}
      <MobileTabBar activeTab={activeTab} onTabChange={handleTabChange} />

      {/* Modale a tutto schermo solo per la schermata In Riproduzione (quando espansa) */}
      <NowPlayingModal
        visible={nowPlayingVisible}
        onClose={() => setNowPlayingVisible(false)}
      />

      {/* Modale Aggiungi a Playlist stile Apple Music / Web */}
      <AddToPlaylistModal
        visible={!!addToPlaylistTracks}
        tracks={addToPlaylistTracks}
        onClose={closeAddToPlaylist}
      />
    </View>
  );
}

function AppWithDownloads() {
  const { getLocalUri } = useDownloads();
  return (
    <PlayerProvider getOfflineUri={getLocalUri}>
      <NavigationProvider>
        <MainApp />
      </NavigationProvider>
    </PlayerProvider>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <DownloadsProvider>
        <AppWithDownloads />
      </DownloadsProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  screenContent: {
    flex: 1,
  },
});
