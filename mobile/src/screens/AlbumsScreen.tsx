import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { api, useServerOnline } from '../api';
import { CoverImage } from '../components/CoverImage';
import { useDownloads } from '../downloads/DownloadsContext';
import { useNavigation } from '../navigation/NavigationContext';
import { theme } from '../theme';
import type { Album } from '../types';

type Props = {
  onSelectAlbum: (album: Album) => void;
  onBack?: () => void;
};

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const ITEM_WIDTH = (SCREEN_WIDTH - 32 - 16) / 2;

export const AlbumsScreen: React.FC<Props> = ({ onSelectAlbum, onBack }) => {
  const [albums, setAlbums] = useState<Album[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const isServerOnline = useServerOnline();
  const { items: downloadedItems } = useDownloads();
  const { navigateToDownloads } = useNavigation();

  const loadAlbums = async () => {
    try {
      const res = await api.albums();
      setAlbums(res);
    } catch {
      // Ignora errori
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    void loadAlbums();
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    void loadAlbums();
  };

  if (loading && albums.length === 0) {
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
        data={albums}
        keyExtractor={(item) => String(item.id)}
        numColumns={2}
        contentContainerStyle={styles.listContent}
        columnWrapperStyle={albums.length > 0 ? styles.columnWrapper : undefined}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.tint} />}
        ListHeaderComponent={<Text style={styles.pageTitle}>Album</Text>}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons
              name={!isServerOnline ? 'cloud-offline-outline' : 'albums-outline'}
              size={48}
              color={theme.colors.textMuted}
            />
            <Text style={styles.emptyTitle}>
              {!isServerOnline ? 'Server non raggiungibile' : 'Nessun album'}
            </Text>
            <Text style={styles.emptySubtext}>
              {!isServerOnline
                ? 'Gli album sono disponibili quando il server è collegato.'
                : 'Nessun album presente nella tua libreria.'}
            </Text>
            {!isServerOnline && downloadedItems.size > 0 && (
              <Pressable style={styles.offlineBtn} onPress={navigateToDownloads}>
                <Ionicons name="cloud-download-outline" size={16} color="#fff" />
                <Text style={styles.offlineBtnText}>
                  Vai ai brani scaricati ({downloadedItems.size})
                </Text>
              </Pressable>
            )}
          </View>
        }
        renderItem={({ item }) => (
          <Pressable
            style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
            onPress={() => onSelectAlbum(item)}
          >
            <CoverImage albumId={item.id} coverKey={item.coverKey} size={ITEM_WIDTH} borderRadius={theme.radii.md} />
            <Text style={styles.title} numberOfLines={1}>
              {item.title}
            </Text>
            <Text style={styles.artist} numberOfLines={1}>
              {item.artist}
            </Text>
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
  pageTitle: {
    fontSize: 32,
    fontWeight: '800',
    color: theme.colors.textPrimary,
    marginBottom: 16,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 130,
  },
  columnWrapper: {
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  card: {
    width: ITEM_WIDTH,
  },
  cardPressed: {
    opacity: 0.75,
  },
  title: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.textPrimary,
    marginTop: 8,
  },
  artist: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    marginTop: 2,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 64,
    paddingHorizontal: 32,
  },
  emptyTitle: {
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
  offlineBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: theme.colors.tint,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: theme.radii.full,
    marginTop: 18,
  },
  offlineBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
});
