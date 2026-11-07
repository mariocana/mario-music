import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../api';
import { CoverImage } from '../components/CoverImage';
import { usePlayer } from '../player/PlayerContext';
import { theme } from '../theme';
import type { Album, Home } from '../types';

type Props = {
  onSelectAlbum: (album: Album) => void;
};

export const HomeScreen: React.FC<Props> = ({ onSelectAlbum }) => {
  const [data, setData] = useState<Home | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { playQueue } = usePlayer();

  const loadData = async () => {
    try {
      setError(null);
      const res = await api.home();
      setData(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Errore nel caricamento');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    void loadData();
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={theme.colors.tint} />
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.center}>
        <Ionicons name="alert-circle-outline" size={48} color={theme.colors.error} />
        <Text style={styles.errorText}>Impossibile connettersi al server</Text>
        <Text style={styles.errorSubtext}>{error}</Text>
        <Pressable style={styles.retryBtn} onPress={loadData}>
          <Text style={styles.retryBtnText}>Riprova</Text>
        </Pressable>
      </View>
    );
  }

  const renderShelf = (title: string, albums: Album[]) => {
    if (!albums || albums.length === 0) return null;
    return (
      <View style={styles.shelf}>
        <Text style={styles.shelfTitle}>{title}</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.shelfScroll}>
          {albums.map((album) => (
            <Pressable
              key={album.id}
              style={({ pressed }) => [styles.albumCard, pressed && styles.cardPressed]}
              onPress={() => onSelectAlbum(album)}
            >
              <CoverImage albumId={album.id} coverKey={album.coverKey} size={140} borderRadius={theme.radii.md} />
              <Text style={styles.albumTitle} numberOfLines={1}>
                {album.title}
              </Text>
              <Text style={styles.albumArtist} numberOfLines={1}>
                {album.artist}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>
    );
  };

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.tint} />}
    >
      <Text style={styles.pageTitle}>Per te</Text>

      {/* Riquadro Riprendi */}
      {data?.ripresa && (
        <View style={styles.resumeContainer}>
          <Text style={styles.resumeLabel}>RIPRENDI AD ASCOLTARE</Text>
          <Pressable
            style={styles.resumeCard}
            onPress={() => {
              if (data.ripresa) playQueue([data.ripresa], 0);
            }}
          >
            <CoverImage
              albumId={data.ripresa.albumId}
              coverKey={data.ripresa.coverKey}
              size={64}
              borderRadius={theme.radii.sm}
            />
            <View style={styles.resumeInfo}>
              <Text style={styles.resumeTitle} numberOfLines={1}>
                {data.ripresa.title}
              </Text>
              <Text style={styles.resumeSubtitle} numberOfLines={1}>
                {data.ripresa.artist} — {data.ripresa.album}
              </Text>
            </View>
            <Ionicons name="play-circle" size={40} color={theme.colors.tint} />
          </Pressable>
        </View>
      )}

      {data && renderShelf('Ascoltati di recente', data.recenti)}
      {data && renderShelf('Aggiunti di recente', data.aggiunti)}
      {data && renderShelf('Riscopri', data.riscopri)}
      {data && renderShelf('Mai ascoltati', data.mai)}

      <View style={{ height: 100 }} />
    </ScrollView>
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
    padding: theme.spacing.lg,
  },
  pageTitle: {
    fontSize: 32,
    fontWeight: '800',
    color: theme.colors.textPrimary,
    marginHorizontal: theme.spacing.md,
    marginTop: theme.spacing.md,
    marginBottom: theme.spacing.sm,
  },
  resumeContainer: {
    marginHorizontal: theme.spacing.md,
    marginVertical: 12,
  },
  resumeLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: theme.colors.tint,
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  resumeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.card,
    borderRadius: theme.radii.md,
    padding: 12,
  },
  resumeInfo: {
    flex: 1,
    marginLeft: 12,
    marginRight: 8,
  },
  resumeTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.textPrimary,
  },
  resumeSubtitle: {
    fontSize: 13,
    color: theme.colors.textSecondary,
    marginTop: 2,
  },
  shelf: {
    marginTop: 24,
  },
  shelfTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: theme.colors.textPrimary,
    marginHorizontal: theme.spacing.md,
    marginBottom: 12,
  },
  shelfScroll: {
    paddingHorizontal: theme.spacing.md,
    gap: 14,
  },
  albumCard: {
    width: 140,
  },
  cardPressed: {
    opacity: 0.75,
  },
  albumTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.textPrimary,
    marginTop: 6,
  },
  albumArtist: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    marginTop: 2,
  },
  errorText: {
    fontSize: 18,
    fontWeight: '600',
    color: theme.colors.textPrimary,
    marginTop: 12,
  },
  errorSubtext: {
    fontSize: 13,
    color: theme.colors.textMuted,
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 16,
  },
  retryBtn: {
    backgroundColor: theme.colors.tint,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: theme.radii.full,
  },
  retryBtnText: {
    color: '#fff',
    fontWeight: '600',
  },
});
