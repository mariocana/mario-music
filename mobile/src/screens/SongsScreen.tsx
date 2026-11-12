import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { api, useServerOnline } from '../api';
import { TrackRow } from '../components/TrackRow';
import { useDownloads } from '../downloads/DownloadsContext';
import { usePlayer } from '../player/PlayerContext';
import { theme } from '../theme';
import type { Track } from '../types';

type Props = {
  onBack?: () => void;
};

export const SongsScreen: React.FC<Props> = ({ onBack }) => {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const isServerOnline = useServerOnline();
  const { items: downloadedItems } = useDownloads();
  const { playQueue, toggleShuffle, shuffle } = usePlayer();

  const downloadedTracks = useMemo(
    () => Array.from(downloadedItems.values()).map((d) => d.track),
    [downloadedItems]
  );

  const effectiveTracks = tracks.length > 0 ? tracks : downloadedTracks;
  const isOfflineFallback = tracks.length === 0 && downloadedTracks.length > 0;

  const loadTracks = async () => {
    try {
      const res = await api.tracks();
      setTracks(res);
    } catch {
      // ignore, cadrà nel fallback offline
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    void loadTracks();
  }, []);

  const filteredTracks = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return effectiveTracks;
    return effectiveTracks.filter(
      (t) =>
        t.title.toLowerCase().includes(q) ||
        t.artist.toLowerCase().includes(q) ||
        t.album.toLowerCase().includes(q)
    );
  }, [effectiveTracks, searchQuery]);

  const handlePlayAll = (casuale: boolean) => {
    if (filteredTracks.length === 0) return;
    if (casuale && !shuffle) toggleShuffle();
    if (!casuale && shuffle) toggleShuffle();
    const startIndex = casuale ? Math.floor(Math.random() * filteredTracks.length) : 0;
    playQueue(filteredTracks, startIndex);
  };

  if (loading && effectiveTracks.length === 0) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={theme.colors.tint} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {onBack && (
        <View style={styles.navBar}>
          <Pressable style={styles.backBtn} onPress={onBack} hitSlop={10}>
            <Ionicons name="chevron-back" size={24} color={theme.colors.tint} />
            <Text style={styles.backLabel}>Libreria</Text>
          </Pressable>
        </View>
      )}

      <FlatList
        data={filteredTracks}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={styles.listContent}
        initialNumToRender={20}
        maxToRenderPerBatch={25}
        windowSize={11}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              void loadTracks();
            }}
            tintColor={theme.colors.tint}
          />
        }
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={styles.pageTitle}>Brani</Text>
            <Text style={styles.subtext}>
              {isOfflineFallback
                ? `${effectiveTracks.length} ${effectiveTracks.length === 1 ? 'brano offline' : 'brani offline'}`
                : `${effectiveTracks.length} ${effectiveTracks.length === 1 ? 'brano' : 'brani'} indicizzati`}
            </Text>

            {/* Quick action buttons */}
            {filteredTracks.length > 0 && (
              <View style={styles.actionButtons}>
                <Pressable
                  style={[styles.btn, styles.primaryBtn]}
                  onPress={() => handlePlayAll(false)}
                >
                  <Ionicons name="play" size={18} color="#fff" />
                  <Text style={styles.primaryBtnText}>Riproduci</Text>
                </Pressable>

                <Pressable
                  style={[styles.btn, styles.secondaryBtn]}
                  onPress={() => handlePlayAll(true)}
                >
                  <Ionicons name="shuffle" size={18} color={theme.colors.tint} />
                  <Text style={styles.secondaryBtnText}>Casuale</Text>
                </Pressable>
              </View>
            )}

            <View style={styles.searchBar}>
              <Ionicons name="search" size={16} color={theme.colors.textMuted} />
              <TextInput
                style={styles.searchInput}
                placeholder={isOfflineFallback ? 'Cerca nei brani scaricati...' : 'Cerca nei brani...'}
                placeholderTextColor={theme.colors.textMuted}
                value={searchQuery}
                onChangeText={setSearchQuery}
                clearButtonMode="while-editing"
                autoCorrect={false}
              />
            </View>
          </View>
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons
              name={isOfflineFallback || !isServerOnline ? 'cloud-offline-outline' : 'musical-notes-outline'}
              size={48}
              color={theme.colors.textMuted}
            />
            <Text style={styles.emptyText}>
              {searchQuery
                ? 'Nessun brano corrisponde alla ricerca'
                : !isServerOnline
                ? 'Server non raggiungibile e nessun brano scaricato'
                : 'Nessun brano presente'}
            </Text>
          </View>
        }
        renderItem={({ item, index }) => (
          <TrackRow
            track={item}
            index={index}
            onPress={() => playQueue(filteredTracks, index)}
          />
        )}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  center: {
    flex: 1,
    backgroundColor: theme.colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navBar: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 4,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
  },
  backLabel: {
    fontSize: 16,
    color: theme.colors.tint,
    marginLeft: 4,
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
  },
  pageTitle: {
    fontSize: 32,
    fontWeight: '800',
    color: theme.colors.textPrimary,
  },
  subtext: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    marginTop: 4,
    marginBottom: 16,
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  btn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: theme.radii.full,
    gap: 8,
  },
  primaryBtn: {
    backgroundColor: theme.colors.tint,
  },
  secondaryBtn: {
    backgroundColor: theme.colors.card,
    borderWidth: 1,
    borderColor: theme.colors.separator,
  },
  primaryBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  secondaryBtnText: {
    color: theme.colors.tint,
    fontSize: 15,
    fontWeight: '700',
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.card,
    borderRadius: theme.radii.md,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: theme.colors.separator,
  },
  searchInput: {
    flex: 1,
    marginLeft: 8,
    fontSize: 15,
    color: theme.colors.textPrimary,
  },
  listContent: {
    paddingBottom: 130,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 64,
    paddingHorizontal: 32,
  },
  emptyText: {
    fontSize: 16,
    color: theme.colors.textMuted,
    textAlign: 'center',
    marginTop: 12,
  },
});
