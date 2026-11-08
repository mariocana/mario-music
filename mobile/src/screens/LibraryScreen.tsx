import React, { useEffect, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { api } from '../api';
import { useDownloads } from '../downloads/DownloadsContext';
import { theme } from '../theme';
import type { Stats } from '../types';

export type LibrarySubScreen =
  | 'artists'
  | 'songs'
  | 'albums'
  | 'playlists'
  | 'favorites'
  | 'listening'
  | 'downloads'
  | 'settings';

type Props = {
  onNavigate: (screen: LibrarySubScreen) => void;
};

type HubItem = {
  id: LibrarySubScreen;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  nota?: string;
  badge?: string;
};

export const LibraryScreen: React.FC<Props> = ({ onNavigate }) => {
  const [stats, setStats] = useState<Stats | null>(null);
  const { items: downloadedItems } = useDownloads();

  useEffect(() => {
    void api.stats().then(setStats).catch(() => undefined);
  }, []);

  const handlePress = (target: LibrarySubScreen) => {
    void Haptics.selectionAsync().catch(() => undefined);
    onNavigate(target);
  };

  const hubItems: HubItem[] = [
    { id: 'artists', label: 'Artisti', icon: 'person-outline' },
    { id: 'songs', label: 'Brani', icon: 'musical-notes-outline' },
    { id: 'albums', label: 'Album', icon: 'albums-outline' },
    { id: 'playlists', label: 'Playlist', icon: 'list-outline' },
    { id: 'favorites', label: 'Preferiti', icon: 'heart-outline' },
    {
      id: 'listening',
      label: 'Ascolti',
      icon: 'stats-chart-outline',
      nota: 'di recente e più ascoltati',
    },
    {
      id: 'downloads',
      label: 'Scaricati',
      icon: 'cloud-download-outline',
      nota:
        downloadedItems.size > 0
          ? `${downloadedItems.size} ${downloadedItems.size === 1 ? 'brano offline' : 'brani offline'}`
          : 'ascolto senza connessione',
    },
    {
      id: 'settings',
      label: 'Server e connessione',
      icon: 'settings-outline',
      nota: 'indirizzo IP e stato libreria',
    },
  ];

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.pageTitle}>Libreria</Text>

      <View style={styles.hubCard}>
        {hubItems.map((item, index) => {
          const isLast = index === hubItems.length - 1;
          return (
            <Pressable
              key={item.id}
              style={({ pressed }) => [
                styles.row,
                pressed && styles.rowPressed,
                !isLast && styles.rowBorder,
              ]}
              onPress={() => handlePress(item.id)}
            >
              <View style={styles.iconContainer}>
                <Ionicons name={item.icon} size={22} color={theme.colors.tint} />
              </View>

              <View style={styles.textContainer}>
                <Text style={styles.rowLabel}>{item.label}</Text>
                {item.nota && <Text style={styles.rowNote}>{item.nota}</Text>}
              </View>

              <Ionicons
                name="chevron-forward"
                size={18}
                color={theme.colors.textMuted}
                style={styles.chevron}
              />
            </Pressable>
          );
        })}
      </View>

      {stats && (
        <View style={styles.statsFooter}>
          <Text style={styles.statsText}>
            {stats.artists} artisti · {stats.albums} album · {stats.tracks} brani
          </Text>
        </View>
      )}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  content: {
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.md,
    paddingBottom: 120,
  },
  pageTitle: {
    fontSize: 34,
    fontWeight: '800',
    color: theme.colors.textPrimary,
    letterSpacing: -0.5,
    marginBottom: 20,
  },
  hubCard: {
    backgroundColor: theme.colors.card,
    borderRadius: theme.radii.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: theme.colors.separator,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    minHeight: 56,
  },
  rowPressed: {
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
  },
  rowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.separator,
  },
  iconContainer: {
    width: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  textContainer: {
    flex: 1,
  },
  rowLabel: {
    fontSize: 17,
    fontWeight: '600',
    color: theme.colors.textPrimary,
  },
  rowNote: {
    fontSize: 13,
    color: theme.colors.textMuted,
    marginTop: 2,
  },
  chevron: {
    marginLeft: 8,
    opacity: 0.7,
  },
  statsFooter: {
    marginTop: 36,
    alignItems: 'center',
  },
  statsText: {
    fontSize: 13,
    color: theme.colors.textMuted,
    fontWeight: '500',
  },
});
