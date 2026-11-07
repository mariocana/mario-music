import React, { useEffect, useState } from 'react';
import {
  Dimensions,
  Modal,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../api';
import { usePlayer } from '../player/PlayerContext';
import { theme } from '../theme';
import { formatTime, type Lyrics } from '../types';
import { CoverImage } from './CoverImage';

type Props = {
  visible: boolean;
  onClose: () => void;
};

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const ARTWORK_SIZE = Math.min(SCREEN_WIDTH - 64, 340);

export const NowPlayingModal: React.FC<Props> = ({ visible, onClose }) => {
  const {
    current,
    isPlaying,
    isLoading,
    toggle,
    next,
    previous,
    currentTime,
    duration,
    seek,
    shuffle,
    toggleShuffle,
    repeat,
    cycleRepeat,
    toggleFavorite,
    queue,
    index,
  } = usePlayer();

  const [activeTab, setActiveTab] = useState<'player' | 'lyrics' | 'queue'>('player');
  const [lyrics, setLyrics] = useState<Lyrics | null>(null);

  // Caricamento testi
  useEffect(() => {
    if (!current || activeTab !== 'lyrics') return;
    let mounted = true;
    void api.lyrics(current.id).then((l) => {
      if (mounted) setLyrics(l);
    }).catch(() => {
      if (mounted) setLyrics(null);
    });
    return () => {
      mounted = false;
    };
  }, [current, activeTab]);

  if (!current) return null;

  const progress = duration > 0 ? Math.min(1, Math.max(0, currentTime / duration)) : 0;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={styles.container}>
        <SafeAreaView style={styles.safeArea}>
          {/* Header con pulsante chiudi e switch viste */}
          <View style={styles.header}>
            <Pressable hitSlop={12} onPress={onClose} style={styles.headerBtn}>
              <Ionicons name="chevron-down" size={26} color={theme.colors.textSecondary} />
            </Pressable>

            <View style={styles.headerTabs}>
              <Pressable
                onPress={() => setActiveTab('player')}
                style={[styles.tabBtn, activeTab === 'player' && styles.activeTabBtn]}
              >
                <Ionicons
                  name="disc"
                  size={18}
                  color={activeTab === 'player' ? theme.colors.tint : theme.colors.textMuted}
                />
              </Pressable>
              <Pressable
                onPress={() => setActiveTab('lyrics')}
                style={[styles.tabBtn, activeTab === 'lyrics' && styles.activeTabBtn]}
              >
                <Ionicons
                  name="chatbubble-ellipses"
                  size={18}
                  color={activeTab === 'lyrics' ? theme.colors.tint : theme.colors.textMuted}
                />
              </Pressable>
              <Pressable
                onPress={() => setActiveTab('queue')}
                style={[styles.tabBtn, activeTab === 'queue' && styles.activeTabBtn]}
              >
                <Ionicons
                  name="list"
                  size={18}
                  color={activeTab === 'queue' ? theme.colors.tint : theme.colors.textMuted}
                />
              </Pressable>
            </View>

            <View style={{ width: 40 }} />
          </View>

          {/* VISTA 1: Player Principale */}
          {activeTab === 'player' && (
            <View style={styles.playerContent}>
              <View style={styles.artworkContainer}>
                <CoverImage
                  albumId={current.albumId}
                  coverKey={current.coverKey}
                  size={ARTWORK_SIZE}
                  borderRadius={theme.radii.lg}
                />
              </View>

              <View style={styles.titleSection}>
                <View style={styles.titleTextContainer}>
                  <Text style={styles.trackTitle} numberOfLines={1}>
                    {current.title}
                  </Text>
                  <Text style={styles.trackArtist} numberOfLines={1}>
                    {current.artist} — {current.album}
                  </Text>
                </View>
                <Pressable hitSlop={12} onPress={() => void toggleFavorite(current.id)}>
                  <Ionicons
                    name={current.favorite ? 'heart' : 'heart-outline'}
                    size={28}
                    color={current.favorite ? theme.colors.tint : theme.colors.textSecondary}
                  />
                </Pressable>
              </View>

              {/* Barra di avanzamento interattiva */}
              <View style={styles.scrubberSection}>
                <Pressable
                  style={styles.scrubberTrack}
                  onPress={(e) => {
                    const { locationX } = e.nativeEvent;
                    const totalWidth = SCREEN_WIDTH - 48;
                    const pct = Math.max(0, Math.min(1, locationX / totalWidth));
                    seek(pct * duration);
                  }}
                >
                  <View style={[styles.scrubberFill, { width: `${progress * 100}%` }]} />
                </Pressable>
                <View style={styles.timeRow}>
                  <Text style={styles.timeText}>{formatTime(currentTime)}</Text>
                  <Text style={styles.timeText}>
                    {duration > currentTime ? `-${formatTime(duration - currentTime)}` : '0:00'}
                  </Text>
                </View>
              </View>

              {/* Controlli di riproduzione */}
              <View style={styles.controlsRow}>
                <Pressable hitSlop={12} onPress={toggleShuffle}>
                  <Ionicons
                    name="shuffle"
                    size={24}
                    color={shuffle ? theme.colors.tint : theme.colors.textMuted}
                  />
                </Pressable>

                <Pressable hitSlop={12} onPress={previous}>
                  <Ionicons name="play-back" size={36} color={theme.colors.textPrimary} />
                </Pressable>

                <Pressable
                  hitSlop={12}
                  onPress={toggle}
                  style={styles.playPauseBtn}
                >
                  <Ionicons
                    name={isLoading ? 'hourglass-outline' : isPlaying ? 'pause' : 'play'}
                    size={42}
                    color={theme.colors.textPrimary}
                  />
                </Pressable>

                <Pressable hitSlop={12} onPress={next}>
                  <Ionicons name="play-forward" size={36} color={theme.colors.textPrimary} />
                </Pressable>

                <Pressable hitSlop={12} onPress={cycleRepeat}>
                  <Ionicons
                    name={repeat === 'one' ? 'repeat-outline' : 'repeat'}
                    size={24}
                    color={repeat !== 'off' ? theme.colors.tint : theme.colors.textMuted}
                  />
                </Pressable>
              </View>
            </View>
          )}

          {/* VISTA 2: Testi sincronizzati (Karaoke) */}
          {activeTab === 'lyrics' && (
            <ScrollView style={styles.lyricsScroll} contentContainerStyle={styles.lyricsContent}>
              {lyrics?.synced ? (
                lyrics.synced.map((line, i) => {
                  const isActive =
                    currentTime >= line.t &&
                    (i === lyrics.synced!.length - 1 || currentTime < lyrics.synced![i + 1].t);
                  return (
                    <Pressable key={i} onPress={() => seek(line.t)} style={styles.lyricLine}>
                      <Text style={[styles.lyricText, isActive && styles.lyricTextActive]}>
                        {line.text}
                      </Text>
                    </Pressable>
                  );
                })
              ) : lyrics?.plain ? (
                <Text style={styles.plainLyrics}>{lyrics.plain}</Text>
              ) : (
                <Text style={styles.noLyrics}>Testi non disponibili per questo brano.</Text>
              )}
            </ScrollView>
          )}

          {/* VISTA 3: Coda di riproduzione */}
          {activeTab === 'queue' && (
            <ScrollView style={styles.queueScroll} contentContainerStyle={styles.queueContent}>
              <Text style={styles.queueHeader}>In coda ({queue.length} brani)</Text>
              {queue.map((t, i) => {
                const isCurrent = i === index;
                return (
                  <View key={`${t.id}-${i}`} style={[styles.queueRow, isCurrent && styles.queueRowActive]}>
                    <CoverImage albumId={t.albumId} coverKey={t.coverKey} size={36} borderRadius={4} />
                    <View style={styles.queueRowText}>
                      <Text style={[styles.queueTitle, isCurrent && styles.queueTitleActive]} numberOfLines={1}>
                        {t.title}
                      </Text>
                      <Text style={styles.queueArtist} numberOfLines={1}>
                        {t.artist}
                      </Text>
                    </View>
                    <Text style={styles.queueDuration}>{formatTime(t.duration)}</Text>
                  </View>
                );
              })}
            </ScrollView>
          )}
        </SafeAreaView>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  safeArea: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 12,
  },
  headerBtn: {
    padding: 6,
  },
  headerTabs: {
    flexDirection: 'row',
    backgroundColor: theme.colors.card,
    borderRadius: theme.radii.full,
    padding: 3,
  },
  tabBtn: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: theme.radii.full,
  },
  activeTabBtn: {
    backgroundColor: theme.colors.cardLight,
  },
  playerContent: {
    flex: 1,
    paddingHorizontal: theme.spacing.lg,
    justifyContent: 'space-around',
    paddingBottom: 24,
  },
  artworkContainer: {
    alignItems: 'center',
    marginVertical: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.45,
    shadowRadius: 20,
    elevation: 12,
  },
  titleSection: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  titleTextContainer: {
    flex: 1,
    marginRight: 16,
  },
  trackTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: theme.colors.textPrimary,
  },
  trackArtist: {
    fontSize: 16,
    color: theme.colors.textSecondary,
    marginTop: 4,
  },
  scrubberSection: {
    marginVertical: 16,
  },
  scrubberTrack: {
    height: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    borderRadius: 3,
    overflow: 'hidden',
  },
  scrubberFill: {
    height: '100%',
    backgroundColor: theme.colors.textPrimary,
  },
  timeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  timeText: {
    fontSize: 12,
    color: theme.colors.textMuted,
    fontVariant: ['tabular-nums'],
  },
  controlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    marginVertical: 12,
  },
  playPauseBtn: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: theme.colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lyricsScroll: {
    flex: 1,
    paddingHorizontal: theme.spacing.lg,
  },
  lyricsContent: {
    paddingVertical: 32,
  },
  lyricLine: {
    paddingVertical: 12,
  },
  lyricText: {
    fontSize: 22,
    fontWeight: '600',
    color: theme.colors.textMuted,
    lineHeight: 32,
  },
  lyricTextActive: {
    color: theme.colors.textPrimary,
    fontSize: 26,
    fontWeight: '800',
  },
  plainLyrics: {
    fontSize: 16,
    color: theme.colors.textSecondary,
    lineHeight: 28,
  },
  noLyrics: {
    fontSize: 16,
    color: theme.colors.textMuted,
    textAlign: 'center',
    marginTop: 40,
  },
  queueScroll: {
    flex: 1,
    paddingHorizontal: theme.spacing.md,
  },
  queueContent: {
    paddingVertical: 16,
  },
  queueHeader: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.colors.textPrimary,
    marginBottom: 16,
  },
  queueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.separator,
  },
  queueRowActive: {
    backgroundColor: theme.colors.tintSubtle,
    borderRadius: theme.radii.sm,
    paddingHorizontal: 6,
  },
  queueRowText: {
    flex: 1,
    marginLeft: 10,
    marginRight: 8,
  },
  queueTitle: {
    fontSize: 14,
    fontWeight: '500',
    color: theme.colors.textPrimary,
  },
  queueTitleActive: {
    color: theme.colors.tint,
  },
  queueArtist: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    marginTop: 2,
  },
  queueDuration: {
    fontSize: 12,
    color: theme.colors.textMuted,
  },
});
