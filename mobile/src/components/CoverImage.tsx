import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { coverUrl } from '../api';
import { theme } from '../theme';

type Props = {
  albumId?: number | null;
  coverKey?: string | null;
  size: number;
  borderRadius?: number;
};

export const CoverImage: React.FC<Props> = ({
  albumId,
  coverKey,
  size,
  borderRadius = theme.radii.md,
}) => {
  const uri = albumId ? coverUrl(albumId, coverKey) : null;

  if (!uri) {
    return (
      <View
        style={[
          styles.placeholder,
          { width: size, height: size, borderRadius },
        ]}
      >
        <Ionicons name="musical-notes" size={size * 0.45} color={theme.colors.textMuted} />
      </View>
    );
  }

  return (
    <Image
      source={{ uri }}
      style={{ width: size, height: size, borderRadius }}
      contentFit="cover"
      transition={150}
    />
  );
};

const styles = StyleSheet.create({
  placeholder: {
    backgroundColor: theme.colors.cardLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
