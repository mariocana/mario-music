import React from 'react';
import { ActionSheetIOS, ActivityIndicator, Alert, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useDownloads } from '../downloads/DownloadsContext';
import { usePlayer } from '../player/PlayerContext';
import { theme } from '../theme';
import { formatTime, type Track } from '../types';
import { CoverImage } from './CoverImage';

type Props = {
  track: Track;
  index?: number;
  showCover?: boolean;
  onPress?: () => void;
};

export const TrackRow: React.FC<Props> = ({
  track,
  index,
  showCover = true,
  onPress,
}) => {
  const { current, isPlaying, playNext, addToQueue, toggleFavorite } = usePlayer();
  const { isDownloaded, downloadTrack, removeTrack, progress } = useDownloads();
  const isCurrent = current?.id === track.id;
  const downloaded = isDownloaded(track.id);
  const isDownloading = progress.has(track.id);

  const showMenu = () => {
    const downloadActionLabel = downloaded ? 'Rimuovi download' : 'Scarica brano';
    const options = ['Annulla', 'Riproduci dopo', 'Aggiungi alla coda', downloadActionLabel];
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options,
          cancelButtonIndex: 0,
          destructiveButtonIndex: downloaded ? 3 : undefined,
          title: track.title,
          message: track.artist,
        },
        (buttonIndex) => {
          if (buttonIndex === 1) playNext(track);
          if (buttonIndex === 2) addToQueue(track);
          if (buttonIndex === 3) {
            if (downloaded) {
              void removeTrack(track.id);
            } else {
              void downloadTrack(track).catch((err) => {
                Alert.alert('Errore download', err instanceof Error ? err.message : 'Impossibile scaricare');
              });
            }
          }
        }
      );
    } else {
      Alert.alert(track.title, track.artist, [
        { text: 'Annulla', style: 'cancel' },
        { text: 'Riproduci dopo', onPress: () => playNext(track) },
        { text: 'Aggiungi alla coda', onPress: () => addToQueue(track) },
        {
          text: downloadActionLabel,
          style: downloaded ? 'destructive' : 'default',
          onPress: () => {
            if (downloaded) {
              void removeTrack(track.id);
            } else {
              void downloadTrack(track).catch(() => undefined);
            }
          },
        },
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
