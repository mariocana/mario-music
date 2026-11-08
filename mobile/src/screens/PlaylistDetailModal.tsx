import React, { useEffect, useState } from 'react';
import {
  ActionSheetIOS,
  ActivityIndicator,
  Alert,
  Dimensions,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../api';
import { PlaylistCover } from '../components/PlaylistCover';
import { TrackRow } from '../components/TrackRow';
import { usePlayer } from '../player/PlayerContext';
import { theme } from '../theme';
import { formatLength, type PlaylistDetail, type PlaylistSummary } from '../types';

type Props = {
  playlist: PlaylistSummary | { id: number; name: string } | null;
  onBack: () => void;
  onPlaylistDeleted?: (id: number) => void;
};

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const COVER_SIZE = Math.min(SCREEN_WIDTH * 0.55, 220);

export const PlaylistDetailModal: React.FC<Props> = ({
  playlist,
  onBack,
  onPlaylistDeleted,
}) => {
  const [detail, setDetail] = useState<PlaylistDetail | null>(null);
  const [loading, setLoading] = useState(false);

  const { playQueue, toggleShuffle, shuffle } = usePlayer();

  const loadDetail = () => {
    if (!playlist) return;
    setLoading(true);
    let mounted = true;
    api
      .playlist(playlist.id)
      .then((res) => {
        if (mounted) setDetail(res);
      })
      .catch(() => undefined)
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  };

  useEffect(() => {
    if (!playlist) {
      setDetail(null);
      return;
    }
    return loadDetail();
  }, [playlist]);

  if (!playlist) return null;

  const tracks = detail?.tracks ?? [];
  const totalDuration = tracks.reduce((acc, t) => acc + t.duration, 0);

  const handlePlayAll = (casuale: boolean) => {
    if (tracks.length === 0) return;
    if (casuale && !shuffle) toggleShuffle();
    if (!casuale && shuffle) toggleShuffle();
    const startIndex = casuale ? Math.floor(Math.random() * tracks.length) : 0;
    playQueue(tracks, startIndex);
  };

  const confirmDelete = () => {
    Alert.alert(
      'Elimina playlist',
      `Sei sicuro di voler eliminare la playlist "${playlist.name}"? I brani non verranno cancellati dalla libreria.`,
      [
        { text: 'Annulla', style: 'cancel' },
        {
          text: 'Elimina',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.deletePlaylist(playlist.id);
              onBack();
              if (onPlaylistDeleted) onPlaylistDeleted(playlist.id);
            } catch (err) {
              Alert.alert('Errore', err instanceof Error ? err.message : 'Impossibile eliminare');
            }
          },
        },
      ]
    );
  };

  const showMoreMenu = () => {
    const options = ['Annulla', 'Elimina playlist'];
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options,
          destructiveButtonIndex: 1,
          cancelButtonIndex: 0,
          title: playlist.name,
        },
        (buttonIndex) => {
          if (buttonIndex === 1) confirmDelete();
        }
      );
    } else {
      confirmDelete();
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.navBar}>
        <Pressable hitSlop={12} onPress={onBack} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color={theme.colors.tint} />
          <Text style={styles.backLabel}>Indietro</Text>
        </Pressable>

        <Pressable hitSlop={12} onPress={showMoreMenu} style={styles.iconBtn}>
          <Ionicons name="ellipsis-horizontal" size={20} color={theme.colors.textSecondary} />
        </Pressable>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <View style={styles.topInfo}>
          <PlaylistCover
            playlist={{
              id: playlist.id,
              name: playlist.name,
              coverKey: detail?.coverKey ?? null,
              covers: [],
            }}
            size={COVER_SIZE}
            borderRadius={theme.radii.lg}
          />
          <Text style={styles.title}>{playlist.name}</Text>
          <Text style={styles.meta}>
            {tracks.length} {tracks.length === 1 ? 'brano' : 'brani'}
            {tracks.length > 0 ? ` · ${formatLength(totalDuration)}` : ''}
          </Text>
        </View>

        {/* Pulsanti Riproduci / Casuale */}
        {tracks.length > 0 && (
          <View style={styles.actionButtons}>
            <Pressable
              style={[styles.btn, styles.primaryBtn]}
              onPress={() => handlePlayAll(false)}
            >
              <Ionicons name="play" size={20} color="#fff" />
              <Text style={styles.primaryBtnText}>Riproduci</Text>
            </Pressable>

            <Pressable
              style={[styles.btn, styles.secondaryBtn]}
              onPress={() => handlePlayAll(true)}
            >
              <Ionicons name="shuffle" size={20} color={theme.colors.tint} />
              <Text style={styles.secondaryBtnText}>Casuale</Text>
            </Pressable>
          </View>
        )}

        {loading ? (
          <View style={styles.centerBox}>
            <ActivityIndicator size="large" color={theme.colors.tint} />
          </View>
        ) : tracks.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="musical-notes-outline" size={40} color={theme.colors.textMuted} />
            <Text style={styles.emptyText}>Playlist vuota</Text>
            <Text style={styles.emptySubtext}>
              Aggiungi brani dal menù ⋯ di qualsiasi brano nella libreria.
            </Text>
          </View>
        ) : (
          <View style={styles.trackList}>
            {tracks.map((track, i) => (
              <TrackRow
                key={`${track.id}-${i}`}
                track={track}
                index={i}
                onPress={() => playQueue(tracks, i)}
              />
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  navBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
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
  iconBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scroll: {
    flex: 1,
  },
  content: {
    paddingBottom: 130,
  },
  topInfo: {
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: 20,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: theme.colors.textPrimary,
    marginTop: 16,
    textAlign: 'center',
  },
  meta: {
    fontSize: 14,
    color: theme.colors.textMuted,
    marginTop: 6,
    textAlign: 'center',
  },
  actionButtons: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 12,
    marginBottom: 20,
  },
  btn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: theme.radii.md,
    gap: 8,
  },
  primaryBtn: {
    backgroundColor: theme.colors.tint,
  },
  primaryBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 16,
  },
  secondaryBtn: {
    backgroundColor: theme.colors.card,
  },
  secondaryBtnText: {
    color: theme.colors.tint,
    fontWeight: '700',
    fontSize: 16,
  },
  trackList: {
    paddingHorizontal: 16,
  },
  centerBox: {
    paddingTop: 40,
    alignItems: 'center',
  },
  emptyContainer: {
    paddingTop: 60,
    paddingHorizontal: 24,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.textSecondary,
  },
  emptySubtext: {
    fontSize: 13,
    color: theme.colors.textMuted,
    textAlign: 'center',
  },
});
