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
import { api } from '../api';
import { theme } from '../theme';
import type { Artist } from '../types';

type Props = {
  onBack?: () => void;
  onSelectArtist: (artist: Artist) => void;
};

export const ArtistsScreen: React.FC<Props> = ({ onBack, onSelectArtist }) => {
  const [artists, setArtists] = useState<Artist[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadArtists = async () => {
    try {
      const res = await api.artists();
      setArtists(res);
    } catch {
      // ignore
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    void loadArtists();
  }, []);

  const filteredArtists = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return artists;
    return artists.filter((a) => a.name.toLowerCase().includes(q));
  }, [artists, searchQuery]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={theme.colors.tint} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header bar with Back button */}
      {onBack && (
        <View style={styles.navBar}>
          <Pressable style={styles.backBtn} onPress={onBack} hitSlop={10}>
            <Ionicons name="chevron-back" size={24} color={theme.colors.tint} />
            <Text style={styles.backLabel}>Libreria</Text>
          </Pressable>
        </View>
      )}

      <FlatList
        data={filteredArtists}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              void loadArtists();
            }}
            tintColor={theme.colors.tint}
          />
        }
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={styles.pageTitle}>Artisti</Text>
            <View style={styles.searchBar}>
              <Ionicons name="search" size={16} color={theme.colors.textMuted} />
              <TextInput
                style={styles.searchInput}
                placeholder="Filtra artisti..."
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
            <Ionicons name="person-outline" size={48} color={theme.colors.textMuted} />
            <Text style={styles.emptyText}>
              {searchQuery ? 'Nessun artista trovato' : 'Nessun artista presente'}
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <Pressable
            style={({ pressed }) => [styles.artistRow, pressed && styles.artistRowPressed]}
            onPress={() => onSelectArtist(item)}
          >
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{item.name.slice(0, 1).toUpperCase()}</Text>
            </View>

            <View style={styles.artistInfo}>
              <Text style={styles.artistName} numberOfLines={1}>
                {item.name}
              </Text>
              <Text style={styles.artistMeta}>
                {item.albumCount} {item.albumCount === 1 ? 'album' : 'album'} · {item.trackCount}{' '}
                {item.trackCount === 1 ? 'brano' : 'brani'}
              </Text>
            </View>

            <Ionicons name="chevron-forward" size={18} color={theme.colors.textMuted} />
          </Pressable>
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
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  backLabel: {
    color: theme.colors.tint,
    fontSize: 17,
    fontWeight: '400',
    marginLeft: 2,
  },
  listContent: {
    paddingBottom: 120,
  },
  header: {
    paddingHorizontal: theme.spacing.md,
    marginBottom: 12,
  },
  pageTitle: {
    fontSize: 34,
    fontWeight: '800',
    color: theme.colors.textPrimary,
    letterSpacing: -0.5,
    marginBottom: 12,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: theme.colors.textPrimary,
    padding: 0,
  },
  artistRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: theme.spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255, 255, 255, 0.06)',
  },
  artistRowPressed: {
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: theme.colors.card,
    borderWidth: 1,
    borderColor: theme.colors.separator,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  avatarText: {
    color: theme.colors.textSecondary,
    fontSize: 18,
    fontWeight: '700',
  },
  artistInfo: {
    flex: 1,
  },
  artistName: {
    fontSize: 17,
    fontWeight: '600',
    color: theme.colors.textPrimary,
    marginBottom: 2,
  },
  artistMeta: {
    fontSize: 13,
    color: theme.colors.textMuted,
  },
  emptyContainer: {
    paddingTop: 80,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  emptyText: {
    fontSize: 16,
    color: theme.colors.textMuted,
  },
});
