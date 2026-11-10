import React from 'react';
import { ActionSheetIOS, ActivityIndicator, Alert, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useDownloads } from '../downloads/DownloadsContext';
import { useNavigation } from '../navigation/NavigationContext';
import { usePlayer } from '../player/PlayerContext';
import { theme } from '../theme';
import { formatTime, type Track } from '../types';
import { CoverImage } from './CoverImage';

export type PlaylistTrackContext = {
  playlistId: number;
  totalTracks: number;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  onRemove?: () => void;
};

type Props = {
  track: Track;
  index?: number;
  showCover?: boolean;
  onPress?: () => void;
  currentAlbumId?: number;
  currentArtistId?: number;
  playlistContext?: PlaylistTrackContext;
};

export const TrackRow: React.FC<Props> = ({
  track,
  index,
  showCover = true,
  onPress,
  currentAlbumId,
  currentArtistId,
  playlistContext,
}) => {
  const { current, isPlaying, playNext, addToQueue, toggleFavorite } = usePlayer();
  const { isDownloaded, downloadTrack, removeTrack, progress } = useDownloads();
  const { navigateToAlbum, navigateToArtist, openAddToPlaylist } = useNavigation();

  const isCurrent = current?.id === track.id;
  const downloaded = isDownloaded(track.id);
  const isDownloading = progress.has(track.id);

  const showMenu = () => {
    const options: string[] = ['Annulla'];
    const actions: (() => void)[] = [() => {}];
    const destructiveIndices: number[] = [];

    // 1. Preferiti
    const favLabel = track.favorite ? 'Togli dai preferiti' : 'Aggiungi ai preferiti';
    options.push(favLabel);
    actions.push(() => void toggleFavorite(track.id));

    // 2. Riproduci dopo
    options.push('Riproduci dopo');
    actions.push(() => playNext(track));

    // 3. Aggiungi alla coda
    options.push('Aggiungi alla coda');
    actions.push(() => addToQueue(track));

    // 4. Vai all'album
    if (track.albumId && track.albumId !== currentAlbumId) {
      options.push("Vai all'album");
      actions.push(() => {
        navigateToAlbum(track.albumId, {
          title: track.album,
          artist: track.artist,
          artistId: track.artistId,
          coverKey: track.coverKey,
        });
      });
    }

    // 5. Vai all'artista
    if (track.artistId && track.artistId !== currentArtistId) {
      options.push("Vai all'artista");
      actions.push(() => {
        navigateToArtist(track.artistId, {
          name: track.artist,
        });
      });
    }

    // 6. Aggiungi a playlist…
    options.push('Aggiungi a playlist…');
    actions.push(() => openAddToPlaylist([track]));

    // 7. Voci contestuali per playlist (Sposta su, Sposta giù, Togli dalla playlist)
    if (playlistContext?.onMoveUp) {
      options.push('Sposta su');
      actions.push(playlistContext.onMoveUp);
    }
    if (playlistContext?.onMoveDown) {
      options.push('Sposta giù');
      actions.push(playlistContext.onMoveDown);
    }
    if (playlistContext?.onRemove) {
      destructiveIndices.push(options.length);
      options.push('Togli dalla playlist');
      actions.push(playlistContext.onRemove);
    }

    // 8. Download
    const downloadActionLabel = downloaded ? 'Rimuovi download' : 'Scarica brano';
    if (downloaded) destructiveIndices.push(options.length);
    options.push(downloadActionLabel);
    actions.push(() => {
      if (downloaded) {
        void removeTrack(track.id);
      } else {
        void downloadTrack(track).catch((err) => {
          Alert.alert('Errore download', err instanceof Error ? err.message : 'Impossibile scaricare');
        });
      }
    });

    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options,
          cancelButtonIndex: 0,
          destructiveButtonIndex: destructiveIndices.length > 0 ? destructiveIndices[0] : undefined,
          title: track.title,
          message: track.artist,
        },
        (buttonIndex) => {
          actions[buttonIndex]?.();
        }
      );
    } else {
      Alert.alert(track.title, track.artist, [
        { text: 'Annulla', style: 'cancel' },
        ...options.slice(1).map((opt, i) => {
          const idx = i + 1;
          const isDestructive = destructiveIndices.includes(idx);
          return {
            text: opt,
            style: isDestructive ? ('destructive' as const) : ('default' as const),
            onPress: actions[idx],
          };
        }),
      ]);
    }
  };

  return (
    <Pressable
      style={({ pressed }) => [styles.container, pressed && styles.pressed]}
      onPress={onPress}
    >
      {showCover ? (
        <CoverImage albumId={track.albumId} coverKey={track.coverKey} size={44} borderRadius={theme.radii.sm} />
      ) : (
        <View style={styles.indexContainer}>
          <Text style={[styles.indexText, isCurrent && styles.activeText]}>
            {track.trackNo ?? (index !== undefined ? index + 1 : '•')}
          </Text>
        </View>
      )}

      <View style={styles.info}>
        <Text style={[styles.title, isCurrent && styles.activeText]} numberOfLines={1}>
          {track.title}
        </Text>
        <Text style={styles.subtext} numberOfLines={1}>
          {track.artist}
        </Text>
      </View>

      <View style={styles.actions}>
        <Pressable
          hitSlop={8}
          onPress={() => void toggleFavorite(track.id)}
          style={styles.actionBtn}
        >
          <Ionicons
            name={track.favorite ? 'heart' : 'heart-outline'}
            size={18}
            color={track.favorite ? theme.colors.tint : theme.colors.textMuted}
          />
        </Pressable>

        <View style={styles.downloadIndicator}>
          {isDownloading ? (
            <ActivityIndicator size="small" color={theme.colors.tint} style={{ marginRight: 6 }} />
          ) : downloaded ? (
            <Ionicons name="arrow-down-circle" size={14} color={theme.colors.tint} style={{ marginRight: 6 }} />
          ) : null}
          <Text style={styles.duration}>{formatTime(track.duration)}</Text>
        </View>

        <Pressable hitSlop={8} onPress={showMenu} style={styles.actionBtn}>
          <Ionicons name="ellipsis-horizontal" size={18} color={theme.colors.textMuted} />
        </Pressable>
      </View>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: theme.spacing.md,
  },
  pressed: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },
  indexContainer: {
    width: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  indexText: {
    fontSize: 15,
    fontWeight: '500',
    color: theme.colors.textMuted,
  },
  info: {
    flex: 1,
    marginLeft: 12,
    marginRight: 8,
  },
  title: {
    fontSize: 16,
    fontWeight: '500',
    color: theme.colors.textPrimary,
  },
  activeText: {
    color: theme.colors.tint,
  },
  subtext: {
    fontSize: 13,
    color: theme.colors.textSecondary,
    marginTop: 2,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  actionBtn: {
    padding: 6,
  },
  duration: {
    fontSize: 13,
    color: theme.colors.textMuted,
    marginHorizontal: 4,
    minWidth: 38,
    textAlign: 'right',
  },
  downloadIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
  },
});
