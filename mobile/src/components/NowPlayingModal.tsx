import React, { useState } from 'react';
import {
  ActionSheetIOS,
  Alert,
  Dimensions,
  FlatList,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useDownloads } from '../downloads/DownloadsContext';
import { useNavigation } from '../navigation/NavigationContext';
import { usePlayer } from '../player/PlayerContext';
import { theme } from '../theme';
import { formatTime } from '../types';
import { CoverImage } from './CoverImage';
import { KaraokeModal } from './KaraokeModal';
import { LyricsPanel } from './LyricsPanel';
import { Scrubber } from './Scrubber';

type Props = {
  visible: boolean;
  onClose: () => void;
};

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const ARTWORK_SIZE = Math.min(SCREEN_WIDTH - 64, 340);
/** altezza fissa delle righe della coda: serve a getItemLayout per aprire la lista sul brano in ascolto */
const QUEUE_ROW_HEIGHT = 56;

export const NowPlayingModal: React.FC<Props> = ({ visible, onClose }) => {
  const {
    current,
    isPlaying,
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
    playNext,
    addToQueue,
    playAt,
    removeAt,
    move,
  } = usePlayer();

  const { isDownloaded, downloadTrack, removeTrack } = useDownloads();
  const { navigateToAlbum, navigateToArtist, openAddToPlaylist } = useNavigation();

  const downloaded = current ? isDownloaded(current.id) : false;

  /** Il menu di una riga della coda: le stesse azioni del pannello del web. */
  const showQueueMenu = (i: number) => {
    const t = queue[i];
    if (!t) return;
    const options: string[] = ['Annulla'];
    const actions: (() => void)[] = [() => {}];

    if (i !== index) {
      options.push('Riproduci adesso');
      actions.push(() => playAt(i));
    }
    // "Dopo questo" = subito dopo il brano in ascolto. Da prima di lui basta
    // portarlo al suo indice: lui scala indietro di uno, e il brano gli finisce dietro.
    if (i !== index && i !== index + 1) {
      options.push('Riproduci dopo questo');
      actions.push(() => move(i, i < index ? index : index + 1));
    }
    if (i > 0) {
      options.push('Sposta su');
      actions.push(() => move(i, i - 1));
    }
    if (i < queue.length - 1) {
      options.push('Sposta giù');
      actions.push(() => move(i, i + 1));
    }
    const destructive = options.length;
    options.push('Togli dalla coda');
    actions.push(() => removeAt(i));

    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { options, cancelButtonIndex: 0, destructiveButtonIndex: destructive, title: t.title, message: t.artist },
        (buttonIndex) => actions[buttonIndex]?.(),
      );
    } else {
      Alert.alert(t.title, t.artist, [
        { text: 'Annulla', style: 'cancel' },
        ...options.slice(1).map((opt, k) => ({
          text: opt,
          style: k + 1 === destructive ? ('destructive' as const) : ('default' as const),
          onPress: actions[k + 1],
        })),
      ]);
    }
  };

  const rimanenti = queue.length - index - 1;

  const showTrackMenu = () => {
    if (!current) return;
    const options: string[] = ['Annulla'];
    const actions: (() => void)[] = [() => {}];
    const destructiveIndices: number[] = [];

    // 1. Preferiti
    const favLabel = current.favorite ? 'Togli dai preferiti' : 'Aggiungi ai preferiti';
    options.push(favLabel);
    actions.push(() => void toggleFavorite(current.id));

    // 2. Riproduci dopo
    options.push('Riproduci dopo');
    actions.push(() => playNext(current));

    // 3. Aggiungi alla coda
    options.push('Aggiungi alla coda');
    actions.push(() => addToQueue(current));

    // 4. Vai all'album
    if (current.albumId) {
      options.push("Vai all'album");
      actions.push(() => {
        onClose();
        navigateToAlbum(current.albumId, {
          title: current.album,
          artist: current.artist,
          artistId: current.artistId,
          coverKey: current.coverKey,
        });
      });
    }

    // 5. Vai all'artista
    if (current.artistId) {
      options.push("Vai all'artista");
      actions.push(() => {
        onClose();
        navigateToArtist(current.artistId, {
          name: current.artist,
        });
      });
    }

    // 6. Aggiungi a playlist…
    options.push('Aggiungi a playlist…');
    actions.push(() => openAddToPlaylist([current]));

    // 7. Download
    const downloadActionLabel = downloaded ? 'Rimuovi download' : 'Scarica brano';
    if (downloaded) destructiveIndices.push(options.length);
    options.push(downloadActionLabel);
    actions.push(() => {
      if (downloaded) {
        void removeTrack(current.id);
      } else {
        void downloadTrack(current).catch((err) => {
          Alert.alert('Errore download', err instanceof Error ? err.message : 'Impossibile scaricare');
        });
      }
    });

    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options,
          cancelButtonIndex: 0,
          destructiveButtonIndex: destructiveIndices.length > 0 ? destructiveIndices[0] : undefined,
          title: current.title,
          message: current.artist,
        },
        (buttonIndex) => {
          actions[buttonIndex]?.();
        }
      );
    } else {
      Alert.alert(current.title, current.artist, [
        { text: 'Annulla', style: 'cancel' },
        ...options.slice(1).map((opt, i) => {
          const idx = i + 1;
          const isDestructive = destructiveIndices.includes(idx);
          return {
            text: opt,
            style: isDestructive ? ('destructive' as const) : ('default' as const),
            onPress: actions[idx],
          };
        }),
      ]);
    }
  };

  const [activeTab, setActiveTab] = useState<'player' | 'lyrics' | 'queue'>('player');
  const [karaoke, setKaraoke] = useState(false);


  if (!current) return null;

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

            <Pressable hitSlop={12} onPress={showTrackMenu} style={styles.headerBtn}>
              <Ionicons name="ellipsis-horizontal" size={20} color={theme.colors.textSecondary} />
            </Pressable>
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

              {/* Barra di avanzamento con pallino trascinabile stile Web */}
              <Scrubber
                currentTime={currentTime}
                duration={duration}
                onSeek={seek}
              />

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
                    name={isPlaying ? 'pause' : 'play'}
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
            <LyricsPanel trackId={current.id} onKaraoke={() => setKaraoke(true)} />
          )}

          {/* VISTA 3: Coda di riproduzione */}
          {activeTab === 'queue' && (
            <FlatList
              style={styles.queueScroll}
              contentContainerStyle={styles.queueContent}
              data={queue}
              keyExtractor={(t, i) => `${t.id}-${i}`}
              // Si apre sul brano in ascolto, non in cima a una coda di mille brani.
              initialScrollIndex={index > 2 ? index - 2 : 0}
              getItemLayout={(_, i) => ({ length: QUEUE_ROW_HEIGHT, offset: QUEUE_ROW_HEIGHT * i, index: i })}
              ListHeaderComponent={
                <Text style={styles.queueHeader}>
                  {queue.length} brani · {rimanenti > 0 ? `${rimanenti} dopo questo` : 'ultimo brano'}
                </Text>
              }
              ListEmptyComponent={<Text style={styles.noLyrics}>Scegli un album per riempire la coda.</Text>}
              renderItem={({ item: t, index: i }) => {
                const isCurrent = i === index;
                return (
                  <Pressable
                    onPress={() => playAt(i)}
                    onLongPress={() => showQueueMenu(i)}
                    style={({ pressed }) => [
                      styles.queueRow,
                      isCurrent && styles.queueRowActive,
                      i < index && styles.queueRowPast,
                      pressed && styles.queueRowPressed,
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel={`${t.title}, ${t.artist}${isCurrent ? ', in riproduzione' : ''}`}
                    accessibilityHint="Tocca per riprodurre, tieni premuto per le altre azioni"
                  >
                    <CoverImage albumId={t.albumId} coverKey={t.coverKey} size={36} borderRadius={4} />
                    <View style={styles.queueRowText}>
                      <Text style={[styles.queueTitle, isCurrent && styles.queueTitleActive]} numberOfLines={1}>
                        {t.title}
                      </Text>
                      <Text style={styles.queueArtist} numberOfLines={1}>
                        {t.artist}
                      </Text>
                    </View>
                    {isCurrent ? (
                      <Ionicons name={isPlaying ? 'volume-high' : 'pause'} size={16} color={theme.colors.tint} />
                    ) : (
                      <Text style={styles.queueDuration}>{formatTime(t.duration)}</Text>
                    )}
                    <Pressable
                      onPress={() => showQueueMenu(i)}
                      hitSlop={10}
                      style={styles.queueMenuBtn}
                      accessibilityRole="button"
                      accessibilityLabel={`Altre azioni per ${t.title}`}
                    >
                      <Ionicons name="ellipsis-horizontal" size={18} color={theme.colors.textMuted} />
                    </Pressable>
                  </Pressable>
                );
              }}
            />
          )}
        </SafeAreaView>
      </View>
      <KaraokeModal visible={karaoke} onClose={() => setKaraoke(false)} />
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
    height: QUEUE_ROW_HEIGHT,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.separator,
  },
  queueRowActive: {
    backgroundColor: theme.colors.tintSubtle,
    borderRadius: theme.radii.sm,
    paddingHorizontal: 6,
  },
  queueRowPast: {
    opacity: 0.45,
  },
  queueRowPressed: {
    backgroundColor: theme.colors.cardLight,
  },
  queueMenuBtn: {
    paddingLeft: 12,
    paddingVertical: 8,
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
