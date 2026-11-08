import React, { useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet, View } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { MiniPlayer } from './src/components/MiniPlayer';
import { MobileTabBar, type TabType } from './src/components/MobileTabBar';
import { NowPlayingModal } from './src/components/NowPlayingModal';
import { initConfig } from './src/config';
import { PlayerProvider } from './src/player/PlayerContext';
import { AlbumDetailModal } from './src/screens/AlbumDetailModal';
import { AlbumsScreen } from './src/screens/AlbumsScreen';
import { ArtistDetailModal } from './src/screens/ArtistDetailModal';
import { ArtistsScreen } from './src/screens/ArtistsScreen';
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
    if (tab === activeTab && tab === 'library') {
      // Tap su Libreria mentre si è già dentro una sottoschermata torna all'Hub
      setLibrarySubScreen(null);
    }
    setActiveTab(tab);
  };

  const handleLibraryNavigate = (target: LibrarySubScreen) => {
    if (target === 'playlists') {
      setActiveTab('playlists');
    } else if (target === 'favorites') {
      setActiveTab('favorites');
    } else {
      setLibrarySubScreen(target);
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar style="light" />

      {/* Vista schermata corrente */}
      <View style={styles.screenContent}>
        {activeTab === 'home' && <HomeScreen onSelectAlbum={setSelectedAlbum} />}

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
      </View>

      {/* Mini Player fluttuante sopra la barra */}
      <MiniPlayer onPress={() => setNowPlayingVisible(true)} />

      {/* Barra schede a pillola + ricerca stile Web */}
      <MobileTabBar activeTab={activeTab} onTabChange={handleTabChange} />

      {/* Modale Dettaglio Album */}
      <AlbumDetailModal
        album={selectedAlbum}
        visible={selectedAlbum !== null}
        onClose={() => setSelectedAlbum(null)}
      />

      {/* Modale Dettaglio Artista */}
      <ArtistDetailModal
        artist={selectedArtist}
        visible={selectedArtist !== null}
        onClose={() => setSelectedArtist(null)}
        onSelectAlbum={(alb) => setSelectedAlbum(alb)}
      />

      {/* Modale Dettaglio Playlist */}
      <PlaylistDetailModal
        playlist={selectedPlaylist}
        visible={selectedPlaylist !== null}
        onClose={() => setSelectedPlaylist(null)}
        onPlaylistDeleted={() => setSelectedPlaylist(null)}
      />

      {/* Modale Schermata In Riproduzione */}
      <NowPlayingModal
        visible={nowPlayingVisible}
        onClose={() => setNowPlayingVisible(false)}
      />
    </View>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <PlayerProvider>
        <MainApp />
      </PlayerProvider>
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
