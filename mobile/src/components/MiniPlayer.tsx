import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { usePlayer } from '../player/PlayerContext';
import { theme } from '../theme';
import { CoverImage } from './CoverImage';

type Props = {
  onPress: () => void;
};

export const MiniPlayer: React.FC<Props> = ({ onPress }) => {
  const { current, isPlaying, toggle, next, currentTime, duration } = usePlayer();

  if (!current) return null;

  const progress = duration > 0 ? Math.min(1, Math.max(0, currentTime / duration)) : 0;

  return (
    <View style={styles.wrapper}>
      <Pressable style={styles.container} onPress={onPress}>
        <CoverImage
          albumId={current.albumId}
          coverKey={current.coverKey}
          size={42}
          borderRadius={theme.radii.sm}
        />

        <View style={styles.textContainer}>
          <Text style={styles.title} numberOfLines={1}>
            {current.title}
          </Text>
          <Text style={styles.artist} numberOfLines={1}>
            {current.artist}
          </Text>
        </View>

        <View style={styles.controls}>
          <Pressable
            hitSlop={12}
            onPress={(e) => {
              e.stopPropagation();
              toggle();
            }}
            style={styles.btn}
          >
            <Ionicons
              name={isPlaying ? 'pause' : 'play'}
              size={24}
              color={theme.colors.textPrimary}
            />
          </Pressable>

          <Pressable
            hitSlop={12}
            onPress={(e) => {
              e.stopPropagation();
              next();
            }}
            style={styles.btn}
          >
            <Ionicons name="play-forward" size={22} color={theme.colors.textPrimary} />
          </Pressable>
        </View>

        {/* Barra di avanzamento inferiore */}
        <View style={styles.progressBarBg}>
          <View style={[styles.progressBarFill, { width: `${progress * 100}%` }]} />
        </View>
      </Pressable>
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    paddingHorizontal: 8,
    paddingBottom: 4,
  },
  container: {
    backgroundColor: theme.colors.miniPlayer,
    borderRadius: theme.radii.md,
    flexDirection: 'row',
    alignItems: 'center',
    padding: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  textContainer: {
    flex: 1,
    marginLeft: 12,
    marginRight: 8,
  },
  title: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.textPrimary,
  },
  artist: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    marginTop: 2,
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  btn: {
    padding: 8,
  },
  progressBarBg: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: theme.colors.tint,
  },
});
