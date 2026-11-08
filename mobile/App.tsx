import React, { useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import {
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { MiniPlayer } from './src/components/MiniPlayer';
import { MobileTabBar, type TabType } from './src/components/MobileTabBar';
import { NowPlayingModal } from './src/components/NowPlayingModal';
import { initConfig } from './src/config';
import { PlayerProvider } from './src/player/PlayerContext';
import { AlbumDetailModal } from './src/screens/AlbumDetailModal';
import { AlbumsScreen } from './src/screens/AlbumsScreen';
import { FavoritesScreen } from './src/screens/FavoritesScreen';
import { HomeScreen } from './src/screens/HomeScreen';
import { SearchScreen } from './src/screens/SearchScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';
import { theme } from './src/theme';
import type { Album } from './src/types';

function MainApp() {
  const insets = useSafeAreaInsets();
  const [activeTab, setActiveTab] = useState<TabType>('home');
  const [selectedAlbum, setSelectedAlbum] = useState<Album | null>(null);
  const [nowPlayingVisible, setNowPlayingVisible] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    void initConfig().finally(() => setReady(true));
  }, []);

  if (!ready) {
    return <View style={styles.container} />;
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar style="light" />

      {/* Vista schermata corrente */}
      <View style={styles.screenContent}>
        {activeTab === 'home' && <HomeScreen onSelectAlbum={setSelectedAlbum} />}
        {activeTab === 'albums' && <AlbumsScreen onSelectAlbum={setSelectedAlbum} />}
        {activeTab === 'favorites' && <FavoritesScreen />}
        {activeTab === 'search' && <SearchScreen />}
        {activeTab === 'settings' && <SettingsScreen />}
      </View>

      {/* Mini Player fluttuante sopra la barra */}
      <MiniPlayer onPress={() => setNowPlayingVisible(true)} />

      {/* Barra schede a pillola + ricerca stile Web */}
      <MobileTabBar activeTab={activeTab} onTabChange={setActiveTab} />

      {/* Modale Dettaglio Album */}
      <AlbumDetailModal
        album={selectedAlbum}
        visible={selectedAlbum !== null}
        onClose={() => setSelectedAlbum(null)}
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
