import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../api';
import { TrackRow } from '../components/TrackRow';
import { usePlayer } from '../player/PlayerContext';
import { theme } from '../theme';
import type { Track } from '../types';

type Props = {
  onBack?: () => void;
};

type TabMode = 'recenti' | 'top';

const PERIODS = [
  { label: 'Sempre', days: undefined },
  { label: 'Ultimo mese', days: 30 },
  { label: 'Ultima settimana', days: 7 },
] as const;

export const ListeningScreen: React.FC<Props> = ({ onBack }) => {
  const [tab, setTab] = useState<TabMode>('recenti');
  const [days, setDays] = useState<number | undefined>(undefined);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const { playQueue, toggleShuffle, shuffle } = usePlayer();

  const loadData = async () => {
    try {
      if (tab === 'recenti') {
        const res = await api.recent();
        setTracks(res);
      } else {
        const res = await api.top(days);
        setTracks(res);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    setLoading(true);
    void loadData();
  }, [tab, days]);

  const handlePlayAll = (casuale: boolean) => {
    if (tracks.length === 0) return;
    if (casuale && !shuffle) toggleShuffle();
    if (!casuale && shuffle) toggleShuffle();
    const startIndex = casuale ? Math.floor(Math.random() * tracks.length) : 0;
    playQueue(tracks, startIndex);
  };

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
        keyExtractor={(item, index) => `${item.id}-${index}`}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              void loadData();
            }}
            tintColor={theme.colors.tint}
          />
        }
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={styles.pageTitle}>Ascolti</Text>

            {/* Schede Principali: Di recente / Più ascoltati */}
            <View style={styles.tabContainer}>
              <Pressable
                style={[styles.tabBtn, tab === 'recenti' && styles.tabBtnActive]}
                onPress={() => setTab('recenti')}
              >
                <Text style={[styles.tabBtnText, tab === 'recenti' && styles.tabBtnTextActive]}>
                  Di recente
                </Text>
              </Pressable>

              <Pressable
                style={[styles.tabBtn, tab === 'top' && styles.tabBtnActive]}
                onPress={() => setTab('top')}
              >
                <Text style={[styles.tabBtnText, tab === 'top' && styles.tabBtnTextActive]}>
                  Più ascoltati
                </Text>
              </Pressable>
            </View>

            {/* Sotto-filtri periodo se in "Più ascoltati" */}
            {tab === 'top' && (
              <View style={styles.periodRow}>
                {PERIODS.map((p) => {
                  const isActive = days === p.days;
                  return (
                    <Pressable
                      key={p.label}
                      style={[styles.periodPill, isActive && styles.periodPillActive]}
                      onPress={() => setDays(p.days)}
                    >
                      <Text
                        style={[
                          styles.periodPillText,
                          isActive && styles.periodPillTextActive,
                        ]}
                      >
                        {p.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            )}

            {/* Pulsanti Riproduci / Casuale se ci sono tracce */}
            {!loading && tracks.length > 0 && (
              <View style={styles.actionButtons}>
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
            )}
          </View>
        }
        ListEmptyComponent={
          loading ? (
            <View style={styles.centerBox}>
              <ActivityIndicator size="large" color={theme.colors.tint} />
            </View>
          ) : (
            <View style={styles.emptyContainer}>
              <Ionicons name="stats-chart-outline" size={48} color={theme.colors.textMuted} />
              <Text style={styles.emptyText}>
                {tab === 'recenti'
                  ? 'Ancora nessun ascolto registrato.'
                  : 'Nessun ascolto registrato per questo periodo.'}
              </Text>
              <Text style={styles.emptySubtext}>
                Un brano conta come ascolto quando ne ascolti almeno la metà.
              </Text>
            </View>
          )
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
    marginBottom: 12,
  },
  pageTitle: {
    fontSize: 34,
    fontWeight: '800',
    color: theme.colors.textPrimary,
    letterSpacing: -0.5,
    marginBottom: 16,
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 10,
    padding: 3,
    marginBottom: 12,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 8,
  },
  tabBtnActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.16)',
  },
  tabBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.textMuted,
  },
  tabBtnTextActive: {
    color: theme.colors.textPrimary,
  },
  periodRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 14,
  },
  periodPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
  },
  periodPillActive: {
    backgroundColor: theme.colors.tint,
  },
  periodPillText: {
    fontSize: 13,
    fontWeight: '500',
    color: theme.colors.textMuted,
  },
  periodPillTextActive: {
    color: '#fff',
    fontWeight: '600',
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 4,
    marginBottom: 6,
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
  centerBox: {
    paddingTop: 60,
    alignItems: 'center',
  },
  emptyContainer: {
    paddingTop: 80,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.textSecondary,
    textAlign: 'center',
  },
  emptySubtext: {
    fontSize: 13,
    color: theme.colors.textMuted,
    textAlign: 'center',
    maxWidth: 280,
  },
});
