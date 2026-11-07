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
import { api } from '../api';
import { CoverImage } from '../components/CoverImage';
import { theme } from '../theme';
import type { Album } from '../types';

type Props = {
  onSelectAlbum: (album: Album) => void;
};

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const ITEM_WIDTH = (SCREEN_WIDTH - 32 - 16) / 2;

export const AlbumsScreen: React.FC<Props> = ({ onSelectAlbum }) => {
  const [albums, setAlbums] = useState<Album[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

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
        data={albums}
        keyExtractor={(item) => String(item.id)}
        numColumns={2}
        contentContainerStyle={styles.listContent}
        columnWrapperStyle={styles.columnWrapper}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.tint} />}
        ListHeaderComponent={<Text style={styles.pageTitle}>Album</Text>}
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
  pageTitle: {
    fontSize: 32,
    fontWeight: '800',
    color: theme.colors.textPrimary,
    marginBottom: 16,
  },
  listContent: {
    padding: theme.spacing.md,
    paddingBottom: 100,
  },
  columnWrapper: {
    justifyContent: 'space-between',
    marginBottom: 20,
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
    marginTop: 6,
  },
  artist: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    marginTop: 2,
  },
});
