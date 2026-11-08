import React, { useState } from 'react';
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
  const [failedUri, setFailedUri] = useState<string | null>(null);
  // Senza coverKey l'album/brano non ha copertina: mostra subito il placeholder
  // senza effettuare alcuna richiesta di rete verso l'endpoint che restituirebbe 404.
  const uri = albumId && coverKey ? coverUrl(albumId, coverKey) : null;
  const isFailed = uri !== null && failedUri === uri;

  if (!uri || isFailed) {
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
      key={uri}
      source={{ uri }}
      style={{ width: size, height: size, borderRadius }}
      contentFit="cover"
      transition={150}
      onError={() => {
        if (uri) setFailedUri(uri);
      }}
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
