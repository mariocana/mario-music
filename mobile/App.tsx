import React, { useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import {
  Platform,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { MiniPlayer } from './src/components/MiniPlayer';
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

type TabType = 'home' | 'albums' | 'favorites' | 'search' | 'settings';

function MainApp() {
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
    <SafeAreaView style={styles.container}>
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

      {/* Tab Bar in basso stile Apple Music */}
      <View style={styles.tabBar}>
        <Pressable
          style={styles.tabItem}
          onPress={() => setActiveTab('home')}
        >
          <Ionicons
            name={activeTab === 'home' ? 'sparkles' : 'sparkles-outline'}
            size={22}
            color={activeTab === 'home' ? theme.colors.tint : theme.colors.textMuted}
          />
          <Text style={[styles.tabLabel, activeTab === 'home' && styles.tabLabelActive]}>
            Per te
          </Text>
        </Pressable>

        <Pressable
          style={styles.tabItem}
          onPress={() => setActiveTab('albums')}
        >
          <Ionicons
            name={activeTab === 'albums' ? 'albums' : 'albums-outline'}
            size={22}
            color={activeTab === 'albums' ? theme.colors.tint : theme.colors.textMuted}
          />
          <Text style={[styles.tabLabel, activeTab === 'albums' && styles.tabLabelActive]}>
            Album
          </Text>
        </Pressable>

        <Pressable
          style={styles.tabItem}
          onPress={() => setActiveTab('favorites')}
        >
          <Ionicons
            name={activeTab === 'favorites' ? 'heart' : 'heart-outline'}
            size={22}
            color={activeTab === 'favorites' ? theme.colors.tint : theme.colors.textMuted}
          />
          <Text style={[styles.tabLabel, activeTab === 'favorites' && styles.tabLabelActive]}>
            Preferiti
          </Text>
        </Pressable>

        <Pressable
          style={styles.tabItem}
          onPress={() => setActiveTab('search')}
        >
          <Ionicons
            name={activeTab === 'search' ? 'search' : 'search-outline'}
            size={22}
            color={activeTab === 'search' ? theme.colors.tint : theme.colors.textMuted}
          />
          <Text style={[styles.tabLabel, activeTab === 'search' && styles.tabLabelActive]}>
            Cerca
          </Text>
        </Pressable>

        <Pressable
          style={styles.tabItem}
          onPress={() => setActiveTab('settings')}
        >
          <Ionicons
            name={activeTab === 'settings' ? 'settings' : 'settings-outline'}
            size={22}
            color={activeTab === 'settings' ? theme.colors.tint : theme.colors.textMuted}
          />
          <Text style={[styles.tabLabel, activeTab === 'settings' && styles.tabLabelActive]}>
            Server
          </Text>
        </Pressable>
      </View>

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
    </SafeAreaView>
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
  tabBar: {
    flexDirection: 'row',
    backgroundColor: theme.colors.tabBar,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255, 255, 255, 0.1)',
    paddingTop: 8,
    paddingBottom: Platform.OS === 'ios' ? 4 : 8,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 4,
  },
  tabLabel: {
    fontSize: 10,
    fontWeight: '500',
    color: theme.colors.textMuted,
    marginTop: 3,
  },
  tabLabelActive: {
    color: theme.colors.tint,
    fontWeight: '700',
  },
});
