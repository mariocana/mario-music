import React from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { TrackRow } from '../components/TrackRow';
import { formatBytes, useDownloads } from '../downloads/DownloadsContext';
import { usePlayer } from '../player/PlayerContext';
import { theme } from '../theme';

type Props = {
  onBack?: () => void;
};

export const DownloadsScreen: React.FC<Props> = ({ onBack }) => {
  const { items, loading, totalBytes, clearAll } = useDownloads();
  const { playQueue, toggleShuffle, shuffle } = usePlayer();

  const downloadedList = Array.from(items.values());
  const tracks = downloadedList.map((d) => d.track);

  const handlePlayAll = (casuale: boolean) => {
    if (tracks.length === 0) return;
    if (casuale && !shuffle) toggleShuffle();
    if (!casuale && shuffle) toggleShuffle();
    const startIndex = casuale ? Math.floor(Math.random() * tracks.length) : 0;
    playQueue(tracks, startIndex);
  };

  const handleClearAll = () => {
    Alert.alert(
      'Libera spazio',
      'Vuoi eliminare tutti i brani scaricati da questo dispositivo? I brani rimarranno sul tuo server.',
      [
        { text: 'Annulla', style: 'cancel' },
        {
          text: 'Elimina tutti',
          style: 'destructive',
          onPress: () => void clearAll(),
        },
      ]
    );
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
      {onBack && (
        <View style={styles.navBar}>
          <Pressable style={styles.backBtn} onPress={onBack} hitSlop={10}>
            <Ionicons name="chevron-back" size={24} color={theme.colors.tint} />
            <Text style={styles.backLabel}>Libreria</Text>
          </Pressable>
        </View>
      )}

      <FlatList
        data={tracks}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={styles.pageTitle}>Scaricati</Text>
            <Text style={styles.subtext}>
              {tracks.length} {tracks.length === 1 ? 'brano' : 'brani'} offline · {formatBytes(totalBytes)} occupati
            </Text>

            {tracks.length > 0 && (
              <View style={styles.actionRow}>
                <View style={styles.playButtons}>
                  <Pressable
                    style={[styles.btn, styles.primaryBtn]}
                    onPress={() => handlePlayAll(false)}
                  >
                    <Ionicons name="play" size={18} color="#fff" />
                    <Text style={styles.primaryBtnText}>Riproduci</Text>
                  </Pressable>

                  <Pressable
                    style={[styles.btn, styles.secondaryBtn]}
                    onPress={() => handlePlayAll(true)}
                  >
                    <Ionicons name="shuffle" size={18} color={theme.colors.tint} />
                    <Text style={styles.secondaryBtnText}>Casuale</Text>
                  </Pressable>
                </View>

                <Pressable
                  style={styles.clearBtn}
                  onPress={handleClearAll}
                  hitSlop={8}
                >
                  <Ionicons name="trash-outline" size={16} color={theme.colors.error} />
                  <Text style={styles.clearBtnText}>Libera spazio</Text>
                </Pressable>
              </View>
            )}
          </View>
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="cloud-download-outline" size={54} color={theme.colors.textMuted} />
            <Text style={styles.emptyTitle}>Nessun brano scaricato</Text>
            <Text style={styles.emptySubtext}>
              Tocca il menù ⋯ su qualunque brano o il pulsante Scarica in un album per ascoltare la tua musica anche senza connessione internet.
            </Text>
          </View>
        }
        renderItem={({ item, index }) => (
          <TrackRow
            track={item}
            index={index}
            onPress={() => playQueue(tracks, index)}
          />
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
  navBar: {
    flexDirection: 'row',
    alignItems: 'center',
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
  listContent: {
    paddingBottom: 120,
  },
  header: {
    paddingHorizontal: theme.spacing.md,
    marginBottom: 16,
  },
  pageTitle: {
    fontSize: 34,
    fontWeight: '800',
    color: theme.colors.textPrimary,
    letterSpacing: -0.5,
  },
  subtext: {
    fontSize: 14,
    color: theme.colors.textMuted,
    marginTop: 4,
    marginBottom: 16,
  },
  actionRow: {
    gap: 12,
  },
  playButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  btn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: theme.radii.md,
    gap: 6,
  },
  primaryBtn: {
    backgroundColor: theme.colors.tint,
  },
  primaryBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 15,
  },
  secondaryBtn: {
    backgroundColor: theme.colors.card,
  },
  secondaryBtnText: {
    color: theme.colors.tint,
    fontWeight: '700',
    fontSize: 15,
  },
  clearBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    gap: 6,
    marginTop: 4,
  },
  clearBtnText: {
    color: theme.colors.error,
    fontSize: 14,
    fontWeight: '600',
  },
  emptyContainer: {
    paddingTop: 80,
    paddingHorizontal: 32,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.colors.textSecondary,
    textAlign: 'center',
  },
  emptySubtext: {
    fontSize: 14,
    color: theme.colors.textMuted,
    textAlign: 'center',
    lineHeight: 20,
  },
});
