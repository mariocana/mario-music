import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { api, useServerOnline } from '../api';
import { TrackRow } from '../components/TrackRow';
import { useDownloads } from '../downloads/DownloadsContext';
import { usePlayer } from '../player/PlayerContext';
import { theme } from '../theme';
import type { Track } from '../types';

export const SearchScreen: React.FC = () => {
  const [query, setQuery] = useState('');
  const isServerOnline = useServerOnline();
  const { items: downloadedItems } = useDownloads();
  const { playQueue } = usePlayer();

  const downloadedTracks = useMemo(
    () => Array.from(downloadedItems.values()).map((d) => d.track),
    [downloadedItems]
  );

  const testo = query.trim();

  /** Cerca nei brani scaricati: è quello che si può ascoltare senza server. */
  const traScaricati = useMemo(() => {
    const q = testo.toLowerCase();
    if (!q) return [];
    return downloadedTracks.filter(
      (t) =>
        t.title.toLowerCase().includes(q) ||
        t.artist.toLowerCase().includes(q) ||
        t.album.toLowerCase().includes(q)
    );
  }, [testo, downloadedTracks]);

  /*
   * La risposta del server si ricorda per quale testo è arrivata. Così una
   * ricerca vecchia che risponde tardi (si è scritto altro nel frattempo) non
   * sovrascrive quella nuova: prima il suo "annulla" stava dentro il
   * setTimeout e non veniva mai chiamato.
   */
  const [remoto, setRemoto] = useState<{ testo: string; risultati: Track[]; offline: boolean } | null>(null);

  useEffect(() => {
    if (!testo || !isServerOnline) return;
    let attiva = true;
    const timer = setTimeout(() => {
      api
        .search(testo)
        .then((res) => {
          if (attiva) setRemoto({ testo, risultati: res, offline: false });
        })
        .catch(() => {
          // Server sparito a metà: si ripiega sui download.
          if (attiva) setRemoto({ testo, risultati: traScaricati, offline: true });
        });
    }, 250);
    return () => {
      attiva = false;
      clearTimeout(timer);
    };
  }, [testo, isServerOnline, traScaricati]);

  // Offline (server noto come irraggiungibile) si cerca subito nei download.
  const soloLocale = testo.length > 0 && !isServerOnline;
  const pronto = remoto !== null && remoto.testo === testo;
  const results = !testo ? [] : soloLocale ? traScaricati : pronto ? remoto.risultati : [];
  const loading = testo.length > 0 && !soloLocale && !pronto;
  const isOfflineResults = soloLocale || (pronto && remoto.offline);

  return (
    <View style={styles.container}>
      <Text style={styles.pageTitle}>Cerca</Text>

      {/* Input di ricerca */}
      <View style={styles.searchBar}>
        <Ionicons name="search" size={20} color={theme.colors.textMuted} style={styles.searchIcon} />
        <TextInput
          style={styles.input}
          placeholder={!isServerOnline ? 'Cerca nella musica scaricata...' : 'Artisti, brani, testi...'}
          placeholderTextColor={theme.colors.textMuted}
          value={query}
          onChangeText={setQuery}
          autoCorrect={false}
          autoCapitalize="none"
          returnKeyType="search"
          clearButtonMode="while-editing"
        />
        {query.length > 0 && (
          <Pressable onPress={() => setQuery('')} hitSlop={8}>
            <Ionicons name="close-circle" size={18} color={theme.colors.textMuted} />
          </Pressable>
        )}
      </View>

      {/* Badge ricerca offline */}
      {isOfflineResults && query.trim().length > 0 && (
        <View style={styles.offlineBadge}>
          <Ionicons name="cloud-offline" size={13} color="#fbbf24" />
          <Text style={styles.offlineBadgeText}>
            Ricerca offline tra i brani scaricati ({results.length})
          </Text>
        </View>
      )}

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="small" color={theme.colors.tint} />
        </View>
      ) : (
        <FlatList
          data={results}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.listContent}
          renderItem={({ item, index }) => (
            <TrackRow track={item} index={index} onPress={() => playQueue(results, index)} />
          )}
          ListEmptyComponent={
            query.trim().length > 0 ? (
              <View style={styles.center}>
                <Ionicons name="search-outline" size={48} color={theme.colors.textMuted} />
                <Text style={styles.emptyTitle}>Nessun risultato</Text>
                <Text style={styles.emptySubtext}>
                  {isOfflineResults
                    ? `Nessun brano scaricato corrisponde a "${query}".`
                    : `Nessun brano o artista corrisponde a "${query}".`}
                </Text>
              </View>
            ) : (
              <View style={styles.center}>
                <Ionicons
                  name={!isServerOnline ? 'cloud-download-outline' : 'musical-notes-outline'}
                  size={48}
                  color={theme.colors.textMuted}
                />
                <Text style={styles.emptyTitle}>
                  {!isServerOnline ? 'Cerca nei download' : 'Cerca nella libreria'}
                </Text>
                <Text style={styles.emptySubtext}>
                  {!isServerOnline
                    ? `${downloadedTracks.length} brani disponibili per l'ascolto offline.`
                    : 'Cerca per titolo, artista o album.'}
                </Text>
              </View>
            )
          }
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  pageTitle: {
    fontSize: 32,
    fontWeight: '800',
    color: theme.colors.textPrimary,
    marginHorizontal: theme.spacing.md,
    marginTop: theme.spacing.md,
    marginBottom: theme.spacing.sm,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.card,
    borderRadius: theme.radii.md,
    marginHorizontal: theme.spacing.md,
    marginBottom: theme.spacing.sm,
    paddingHorizontal: 12,
    height: 44,
  },
  searchIcon: {
    marginRight: 8,
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: theme.colors.textPrimary,
    paddingVertical: 0,
  },
  offlineBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginHorizontal: theme.spacing.md,
    marginBottom: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: theme.radii.sm,
    backgroundColor: 'rgba(245, 158, 11, 0.12)',
    alignSelf: 'flex-start',
  },
  offlineBadgeText: {
    fontSize: 12,
    color: '#fbbf24',
    fontWeight: '600',
  },
  listContent: {
    paddingBottom: 130,
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 64,
    paddingHorizontal: 32,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: theme.colors.textPrimary,
    marginTop: 12,
  },
  emptySubtext: {
    fontSize: 14,
    color: theme.colors.textMuted,
    textAlign: 'center',
    marginTop: 4,
  },
});
