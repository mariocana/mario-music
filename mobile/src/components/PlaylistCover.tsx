import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { playlistCoverUrl } from '../api';
import { theme } from '../theme';
import type { PlaylistSummary } from '../types';
import { CoverImage } from './CoverImage';

type Props = {
  playlist: Pick<PlaylistSummary, 'id' | 'name' | 'coverKey' | 'covers'>;
  size?: number;
  borderRadius?: number;
};

export const PlaylistCover: React.FC<Props> = ({
  playlist,
  size = 140,
  borderRadius = theme.radii.md,
}) => {
  const { id, name, coverKey, covers = [] } = playlist;

  if (coverKey) {
    return (
      <Image
        source={{ uri: playlistCoverUrl(id, coverKey) }}
        style={{ width: size, height: size, borderRadius }}
        resizeMode="cover"
      />
    );
  }

  if (covers.length === 0) {
    return (
      <View
        style={[
          styles.placeholder,
          { width: size, height: size, borderRadius },
        ]}
      >
        <Ionicons name="musical-notes" size={size * 0.4} color={theme.colors.textMuted} />
      </View>
    );
  }

  if (covers.length < 4) {
    return (
      <CoverImage
        albumId={covers[0].albumId}
        coverKey={covers[0].coverKey}
        size={size}
        borderRadius={borderRadius}
      />
    );
  }

  const half = Math.floor(size / 2);
  return (
    <View
      style={[
        styles.mosaicGrid,
        { width: size, height: size, borderRadius, overflow: 'hidden' },
      ]}
    >
      {covers.slice(0, 4).map((c, i) => (
        <CoverImage
          key={`${c.albumId}-${i}`}
          albumId={c.albumId}
          coverKey={c.coverKey}
          size={half}
          borderRadius={0}
        />
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  placeholder: {
    backgroundColor: theme.colors.card,
    borderWidth: 1,
    borderColor: theme.colors.separator,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mosaicGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    backgroundColor: theme.colors.card,
  },
});
