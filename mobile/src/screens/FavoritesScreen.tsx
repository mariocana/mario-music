import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { api, useServerOnline } from '../api';
import { TrackRow } from '../components/TrackRow';
import { useDownloads } from '../downloads/DownloadsContext';
import { useNavigation } from '../navigation/NavigationContext';
import { usePlayer } from '../player/PlayerContext';
import { theme } from '../theme';
import type { Track } from '../types';

export const FavoritesScreen: React.FC = () => {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const { playQueue, toggleShuffle, shuffle } = usePlayer();
  const isServerOnline = useServerOnline();
  const { items: downloadedItems } = useDownloads();
  const { navigateToDownloads } = useNavigation();

  const downloadedFavorites = useMemo(() => {
    return Array.from(downloadedItems.values())
      .map((d) => d.track)
      .filter((t) => (t.favorite ?? 0) === 1);
  }, [downloadedItems]);

  const isOfflineFallback = tracks.length === 0 && downloadedFavorites.length > 0;
  const effectiveTracks = tracks.length > 0 ? tracks : downloadedFavorites;

  const loadFavorites = async () => {
    try {
      const res = await api.favorites();
      setTracks(res);
    } catch {
      // Ignora errori, cadrà nei preferiti offline
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    void loadFavorites();
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    void loadFavorites();
  };

  const handlePlayAll = (casuale: boolean) => {
    if (effectiveTracks.length === 0) return;
    if (casuale && !shuffle) toggleShuffle();
    if (!casuale && shuffle) toggleShuffle();
    const startIndex = casuale ? Math.floor(Math.random() * effectiveTracks.length) : 0;
    playQueue(effectiveTracks, startIndex);
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
      <FlatList
        data={effectiveTracks}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={theme.colors.tint}
          />
        }
        ListHeaderComponent={
          <View>
            <Text style={styles.pageTitle}>Brani preferiti</Text>
            {isOfflineFallback && (
              <View style={styles.offlineNotice}>
                <Ionicons name="cloud-offline" size={14} color="#fbbf24" />
                <Text style={styles.offlineNoticeText}>
                  Modalità offline · Mostrando i preferiti scaricati
                </Text>
              </View>
            )}

            {effectiveTracks.length > 0 && (
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
          </View>
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons
              name={!isServerOnline ? 'cloud-offline-outline' : 'heart-outline'}
              size={48}
              color={theme.colors.textMuted}
            />
            <Text style={styles.emptyText}>
              {!isServerOnline ? 'Nessun preferito offline' : 'Nessun brano preferito'}
            </Text>
            <Text style={styles.emptySubtext}>
              {!isServerOnline
                ? 'Non hai brani preferiti scaricati sul dispositivo.'
                : 'Tocca il cuore su qualunque brano per aggiungerlo qui.'}
            </Text>
            {!isServerOnline && downloadedItems.size > 0 && (
              <Pressable style={styles.offlineNavBtn} onPress={navigateToDownloads}>
                <Ionicons name="cloud-download-outline" size={16} color="#fff" />
                <Text style={styles.offlineNavBtnText}>
                  Apri brani scaricati ({downloadedItems.size})
                </Text>
              </Pressable>
            )}
          </View>
        }
        renderItem={({ item, index }) => (
          <TrackRow
            track={item}
            index={index}
            onPress={() => playQueue(effectiveTracks, index)}
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
  pageTitle: {
    fontSize: 32,
    fontWeight: '800',
    color: theme.colors.textPrimary,
    marginHorizontal: theme.spacing.md,
    marginTop: theme.spacing.md,
    marginBottom: 8,
  },
  offlineNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginHorizontal: theme.spacing.md,
    marginBottom: 12,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: theme.radii.sm,
    backgroundColor: 'rgba(245, 158, 11, 0.12)',
    alignSelf: 'flex-start',
  },
  offlineNoticeText: {
    fontSize: 12,
    color: '#fbbf24',
    fontWeight: '600',
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: theme.spacing.md,
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
    fontSize: 18,
    fontWeight: '600',
    color: theme.colors.textPrimary,
    marginTop: 12,
  },
  emptySubtext: {
    fontSize: 14,
    color: theme.colors.textMuted,
    textAlign: 'center',
    marginTop: 4,
  },
  offlineNavBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: theme.colors.tint,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: theme.radii.full,
    marginTop: 18,
  },
  offlineNavBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
});
