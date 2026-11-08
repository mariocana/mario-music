import React, { useEffect, useState } from 'react';
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
import { api } from '../api';
import { TrackRow } from '../components/TrackRow';
import { usePlayer } from '../player/PlayerContext';
import { theme } from '../theme';
import type { Track } from '../types';

export const FavoritesScreen: React.FC = () => {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const { playQueue } = usePlayer();

  const loadFavorites = async () => {
    try {
      const res = await api.favorites();
      setTracks(res);
    } catch {
      // Ignora errori
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

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={theme.colors.tint} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={tracks}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.tint} />}
        ListHeaderComponent={
          <View>
            <Text style={styles.pageTitle}>Brani preferiti</Text>
            {tracks.length > 0 && (
              <View style={styles.actionButtons}>
                <Pressable
                  style={[styles.btn, styles.primaryBtn]}
                  onPress={() => playQueue(tracks, 0)}
                >
                  <Ionicons name="play" size={18} color="#fff" />
                  <Text style={styles.primaryBtnText}>Riproduci</Text>
                </Pressable>

                <Pressable
                  style={[styles.btn, styles.secondaryBtn]}
                  onPress={() => {
                    const rnd = Math.floor(Math.random() * tracks.length);
                    playQueue(tracks, rnd);
                  }}
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
            <Ionicons name="heart-outline" size={48} color={theme.colors.textMuted} />
            <Text style={styles.emptyText}>Nessun brano preferito.</Text>
            <Text style={styles.emptySubtext}>Tocca il cuore su qualunque brano per aggiungerlo qui.</Text>
          </View>
        }
        renderItem={({ item, index }) => (
          <TrackRow track={item} index={index} onPress={() => playQueue(tracks, index)} />
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
    marginBottom: 16,
  },
  actionButtons: {
    flexDirection: 'row',
    paddingHorizontal: theme.spacing.md,
    gap: 12,
    marginBottom: 16,
  },
  btn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: theme.radii.md,
    gap: 6,
  },
  primaryBtn: {
    backgroundColor: theme.colors.tint,
  },
  primaryBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 15,
  },
  secondaryBtn: {
    backgroundColor: theme.colors.card,
  },
  secondaryBtnText: {
    color: theme.colors.tint,
    fontWeight: '700',
    fontSize: 15,
  },
  listContent: {
    paddingBottom: 130,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    marginTop: 40,
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
    marginTop: 6,
  },
});
