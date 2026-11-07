import React, { useEffect, useState } from 'react';
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
import { api } from '../api';
import { TrackRow } from '../components/TrackRow';
import { usePlayer } from '../player/PlayerContext';
import { theme } from '../theme';
import type { Track } from '../types';

export const SearchScreen: React.FC = () => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Track[]>([]);
  const [loading, setLoading] = useState(false);

  const { playQueue } = usePlayer();

  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      setResults([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const timer = setTimeout(() => {
      let active = true;
      api
        .search(trimmed)
        .then((res) => {
          if (active) setResults(res);
        })
        .catch(() => undefined)
        .finally(() => {
          if (active) setLoading(false);
        });

      return () => {
        active = false;
      };
    }, 250);

    return () => clearTimeout(timer);
  }, [query]);

  return (
    <View style={styles.container}>
      <Text style={styles.pageTitle}>Cerca</Text>

      {/* Input di ricerca */}
      <View style={styles.searchBar}>
        <Ionicons name="search" size={20} color={theme.colors.textMuted} style={styles.searchIcon} />
        <TextInput
          style={styles.input}
          placeholder="Artisti, brani, testi..."
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
                <Text style={styles.emptySubtext}>Nessun brano o artista corrisponde a "{query}".</Text>
              </View>
            ) : (
              <View style={styles.center}>
                <Ionicons name="musical-notes-outline" size={48} color={theme.colors.textMuted} />
                <Text style={styles.emptyTitle}>Cerca nella libreria</Text>
                <Text style={styles.emptySubtext}>Cerca per titolo, artista o album.</Text>
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
    marginBottom: 12,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.card,
    borderRadius: theme.radii.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginHorizontal: theme.spacing.md,
    marginBottom: 12,
  },
  searchIcon: {
    marginRight: 8,
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: theme.colors.textPrimary,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    marginTop: 40,
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
    marginTop: 6,
  },
  listContent: {
    paddingBottom: 100,
  },
});
