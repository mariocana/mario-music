import React, { useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet, View } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { MiniPlayer } from './src/components/MiniPlayer';
import { MobileTabBar, type TabType } from './src/components/MobileTabBar';
import { NowPlayingModal } from './src/components/NowPlayingModal';
import { initConfig } from './src/config';
import { DownloadsProvider, useDownloads } from './src/downloads/DownloadsContext';
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

  const [selectedAlbum, setSelectedAlbum] = useState<Album | null>(null);
  const [selectedArtist, setSelectedArtist] = useState<Artist | null>(null);
  const [selectedPlaylist, setSelectedPlaylist] = useState<PlaylistSummary | null>(null);
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
      // Se si cambia scheda, si chiudono i dettagli aperti
      setSelectedAlbum(null);
      setSelectedArtist(null);
      setSelectedPlaylist(null);
      setActiveTab(tab);
    } else {
      // Tap sulla scheda già attiva: torna alla radice della schermata
      if (selectedAlbum) {
        setSelectedAlbum(null);
      } else if (selectedArtist) {
        setSelectedArtist(null);
      } else if (selectedPlaylist) {
        setSelectedPlaylist(null);
      } else if (tab === 'library') {
        setLibrarySubScreen(null);
      }
    }
  };

  const handleLibraryNavigate = (target: LibrarySubScreen) => {
    if (target === 'playlists') {
      setSelectedAlbum(null);
      setSelectedArtist(null);
      setSelectedPlaylist(null);
      setActiveTab('playlists');
    } else if (target === 'favorites') {
      setSelectedAlbum(null);
      setSelectedArtist(null);
      setSelectedPlaylist(null);
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
        {selectedAlbum ? (
          <AlbumDetailModal
            album={selectedAlbum}
            onBack={() => setSelectedAlbum(null)}
          />
        ) : selectedArtist ? (
          <ArtistDetailModal
            artist={selectedArtist}
            onBack={() => setSelectedArtist(null)}
            onSelectAlbum={(alb) => setSelectedAlbum(alb)}
          />
        ) : selectedPlaylist ? (
          <PlaylistDetailModal
            playlist={selectedPlaylist}
            onBack={() => setSelectedPlaylist(null)}
            onPlaylistDeleted={() => setSelectedPlaylist(null)}
          />
        ) : (
          <>
            {activeTab === 'home' && (
              <HomeScreen
                onSelectAlbum={setSelectedAlbum}
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
                    onSelectArtist={setSelectedArtist}
                  />
                )}
                {librarySubScreen === 'songs' && (
                  <SongsScreen onBack={() => setLibrarySubScreen(null)} />
                )}
                {librarySubScreen === 'albums' && (
                  <AlbumsScreen
                    onBack={() => setLibrarySubScreen(null)}
                    onSelectAlbum={setSelectedAlbum}
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
              <PlaylistsScreen onSelectPlaylist={setSelectedPlaylist} />
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
    </View>
  );
}

function AppWithDownloads() {
  const { getLocalUri } = useDownloads();
  return (
    <PlayerProvider getOfflineUri={getLocalUri}>
      <MainApp />
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
