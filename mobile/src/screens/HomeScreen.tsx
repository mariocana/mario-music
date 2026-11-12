import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { api, useServerOnline } from '../api';
import { CoverImage } from '../components/CoverImage';
import { TrackRow } from '../components/TrackRow';
import { useDownloads } from '../downloads/DownloadsContext';
import { useNavigation } from '../navigation/NavigationContext';
import { usePlayer } from '../player/PlayerContext';
import { theme } from '../theme';
import type { Album, Home, Track } from '../types';

type Props = {
  onSelectAlbum: (album: Album) => void;
  onOpenListening?: () => void;
};

export const HomeScreen: React.FC<Props> = ({ onSelectAlbum, onOpenListening }) => {
  const [data, setData] = useState<Home | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isServerOnline = useServerOnline();
  const { items: downloadedItems } = useDownloads();
  const { navigateToDownloads, navigateToSettings } = useNavigation();
  const { playQueue, toggleShuffle, shuffle } = usePlayer();

  const downloadedTracks = useMemo(
    () => Array.from(downloadedItems.values()).map((d) => d.track),
    [downloadedItems]
  );

  const loadData = async () => {
    try {
      setError(null);
      const res = await api.home();
      setData(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Errore nel caricamento');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    void loadData();
  };

  const handlePlayDownloaded = (casuale: boolean) => {
    if (downloadedTracks.length === 0) return;
    if (casuale && !shuffle) toggleShuffle();
    if (!casuale && shuffle) toggleShuffle();
    const startIndex = casuale ? Math.floor(Math.random() * downloadedTracks.length) : 0;
    playQueue(downloadedTracks, startIndex);
  };

  const handleResume = async (track: Track) => {
    try {
      const album = await api.album(track.albumId).catch(() => null);
      const tracce = album?.tracks && album.tracks.length > 0 ? album.tracks : [track];
      const i = Math.max(0, tracce.findIndex((t) => t.id === track.id));
      playQueue(tracce, i);
    } catch {
      playQueue([track], 0);
    }
  };

  // Spinner solo durante il primissimo caricamento
  if (loading && !data) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={theme.colors.tint} />
      </View>
    );
  }

  // Se non ci sono dati remoti a causa di server offline o errore di rete
  if (!data && (error || !isServerOnline)) {
    // Caso 1: ci sono brani scaricati -> Offre l'esperienza offline immediata
    if (downloadedTracks.length > 0) {
      return (
        <ScrollView
          style={styles.container}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={theme.colors.tint}
            />
          }
        >
          <Text style={styles.pageTitle}>Per te</Text>

          {/* Scheda avviso modalità non in linea */}
          <View style={styles.offlineNoticeCard}>
            <View style={styles.offlineNoticeHeader}>
              <Ionicons name="cloud-offline" size={20} color="#fbbf24" />
              <Text style={styles.offlineNoticeTitle}>Modalità non in linea</Text>
            </View>
            <Text style={styles.offlineNoticeDesc}>
              Il server non risponde. Puoi riprodurre liberamente tutta la musica scaricata su questo dispositivo.
            </Text>
            <View style={styles.offlineNoticeActions}>
              <Pressable
                style={styles.offlineActionBtn}
                onPress={onRefresh}
                hitSlop={6}
              >
                <Ionicons name="refresh" size={14} color={theme.colors.tint} />
                <Text style={styles.offlineActionBtnText}>Riprova connessione</Text>
              </Pressable>
              <Pressable
                style={[styles.offlineActionBtn, styles.offlineActionBtnSecondary]}
                onPress={navigateToSettings}
                hitSlop={6}
              >
                <Ionicons name="settings-outline" size={14} color={theme.colors.textSecondary} />
                <Text style={styles.offlineActionBtnSecondaryText}>Impostazioni</Text>
              </Pressable>
            </View>
          </View>

          {/* Sezione musica scaricata con riproduzione immediata */}
          <View style={styles.offlineShelf}>
            <View style={styles.offlineShelfHeader}>
              <Text style={styles.shelfTitle}>
                Musica scaricata ({downloadedTracks.length})
              </Text>
            </View>

            <View style={styles.playButtonsRow}>
              <Pressable
                style={[styles.btn, styles.primaryBtn]}
                onPress={() => handlePlayDownloaded(false)}
              >
                <Ionicons name="play" size={18} color="#fff" />
                <Text style={styles.primaryBtnText}>Riproduci tutti</Text>
              </Pressable>

              <Pressable
                style={[styles.btn, styles.secondaryBtn]}
                onPress={() => handlePlayDownloaded(true)}
              >
                <Ionicons name="shuffle" size={18} color={theme.colors.tint} />
                <Text style={styles.secondaryBtnText}>Casuale</Text>
              </Pressable>
            </View>

            <View style={styles.topTracksList}>
              {downloadedTracks.slice(0, 25).map((track, i) => (
                <TrackRow
                  key={track.id}
                  track={track}
                  index={i}
                  showCover
                  onPress={() => playQueue(downloadedTracks, i)}
                />
              ))}
            </View>

            <Pressable style={styles.listeningLink} onPress={navigateToDownloads}>
              <Text style={styles.listeningLinkText}>
                Tutti i download ({downloadedTracks.length}) →
              </Text>
            </Pressable>
          </View>

          <View style={{ height: 130 }} />
        </ScrollView>
      );
    }

    // Caso 2: nessun brano scaricato offline
    return (
      <ScrollView
        contentContainerStyle={styles.center}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={theme.colors.tint}
          />
        }
      >
        <Ionicons name="cloud-offline-outline" size={56} color="#fbbf24" />
        <Text style={styles.errorText}>Server non raggiungibile</Text>
        <Text style={styles.errorSubtext}>
          {error ?? 'Impossibile connettersi al server musicale.'}
          {'\n'}Non hai ancora scaricato alcun brano per l'ascolto offline.
        </Text>
        <View style={styles.offlineEmptyActions}>
          <Pressable style={styles.primaryActionBtn} onPress={navigateToSettings}>
            <Ionicons name="settings-outline" size={18} color="#fff" />
            <Text style={styles.primaryActionBtnText}>Impostazioni server</Text>
          </Pressable>
          <Pressable style={styles.secondaryActionBtn} onPress={loadData}>
            <Ionicons name="refresh" size={18} color={theme.colors.tint} />
            <Text style={styles.secondaryActionBtnText}>Riprova</Text>
          </Pressable>
        </View>
      </ScrollView>
    );
  }

  const renderShelf = (title: string, albums: Album[]) => {
    if (!albums || albums.length === 0) return null;
    return (
      <View style={styles.shelf}>
        <Text style={styles.shelfTitle}>{title}</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.shelfScroll}>
          {albums.map((album) => (
            <Pressable
              key={album.id}
              style={({ pressed }) => [styles.albumCard, pressed && styles.cardPressed]}
              onPress={() => onSelectAlbum(album)}
            >
              <CoverImage albumId={album.id} coverKey={album.coverKey} size={140} borderRadius={theme.radii.md} />
              <Text style={styles.albumTitle} numberOfLines={1}>
                {album.title}
              </Text>
              <Text style={styles.albumArtist} numberOfLines={1}>
                {album.artist}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>
    );
  };

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.tint} />}
    >
      <Text style={styles.pageTitle}>Per te</Text>

      {/* Riquadro Riprendi */}
      {data?.ripresa && (
        <View style={styles.resumeContainer}>
          <Text style={styles.resumeLabel}>RIPRENDI AD ASCOLTARE</Text>
          <Pressable
            style={styles.resumeCard}
            onPress={() => {
              if (data.ripresa) void handleResume(data.ripresa);
            }}
          >
            <CoverImage
              albumId={data.ripresa.albumId}
              coverKey={data.ripresa.coverKey}
              size={64}
              borderRadius={theme.radii.sm}
            />
            <View style={styles.resumeInfo}>
              <Text style={styles.resumeTitle} numberOfLines={1}>
                {data.ripresa.title}
              </Text>
              <Text style={styles.resumeSubtitle} numberOfLines={1}>
                {data.ripresa.artist} — {data.ripresa.album}
              </Text>
            </View>
            <Ionicons name="play-circle" size={40} color={theme.colors.tint} />
          </Pressable>
        </View>
      )}

      {data && renderShelf('Ascoltati di recente', data.recenti)}
      {data && renderShelf('Aggiunti di recente', data.aggiunti)}

      {data?.top && data.top.length > 0 && (
        <View style={styles.topTracksSection}>
          <Text style={styles.shelfTitle}>I tuoi brani del mese</Text>
          <View style={styles.topTracksList}>
            {data.top.map((track, i) => (
              <TrackRow
                key={track.id}
                track={track}
                index={i}
                showCover
                onPress={() => playQueue(data.top, i)}
              />
            ))}
          </View>
        </View>
      )}

      {data && renderShelf('Riscopri', data.riscopri)}
      {data && renderShelf('Mai ascoltati', data.mai)}

      {onOpenListening && (
        <Pressable style={styles.listeningLink} onPress={onOpenListening}>
          <Text style={styles.listeningLinkText}>Tutti gli ascolti →</Text>
        </Pressable>
      )}

      <View style={{ height: 130 }} />
    </ScrollView>
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
    padding: theme.spacing.lg,
  },
  pageTitle: {
    fontSize: 32,
    fontWeight: '800',
    color: theme.colors.textPrimary,
    marginHorizontal: theme.spacing.md,
    marginTop: theme.spacing.md,
    marginBottom: theme.spacing.sm,
  },
  resumeContainer: {
    marginHorizontal: theme.spacing.md,
    marginVertical: 12,
  },
  resumeLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: theme.colors.tint,
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  resumeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.card,
    borderRadius: theme.radii.md,
    padding: 12,
  },
  resumeInfo: {
    flex: 1,
    marginLeft: 12,
    marginRight: 8,
  },
  resumeTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.textPrimary,
  },
  resumeSubtitle: {
    fontSize: 13,
    color: theme.colors.textSecondary,
    marginTop: 2,
  },
  shelf: {
    marginTop: 24,
  },
  topTracksSection: {
    marginTop: 24,
  },
  topTracksList: {
    // TrackRow already applies horizontal padding
  },
  shelfTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: theme.colors.textPrimary,
    marginHorizontal: theme.spacing.md,
    marginBottom: 12,
  },
  shelfScroll: {
    paddingHorizontal: theme.spacing.md,
    gap: 14,
  },
  albumCard: {
    width: 140,
  },
  cardPressed: {
    opacity: 0.75,
  },
  albumTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.textPrimary,
    marginTop: 6,
  },
  albumArtist: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    marginTop: 2,
  },
  errorText: {
    fontSize: 18,
    fontWeight: '600',
    color: theme.colors.textPrimary,
    marginTop: 12,
  },
  errorSubtext: {
    fontSize: 13,
    color: theme.colors.textMuted,
    textAlign: 'center',
    marginTop: 6,
    marginBottom: 20,
    lineHeight: 18,
  },
  listeningLink: {
    paddingVertical: 18,
    paddingHorizontal: theme.spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listeningLinkText: {
    color: theme.colors.tint,
    fontSize: 15,
    fontWeight: '600',
  },
  // Elementi per modalità Offline
  offlineNoticeCard: {
    marginHorizontal: theme.spacing.md,
    marginTop: 8,
    marginBottom: 16,
    backgroundColor: 'rgba(245, 158, 11, 0.1)',
    borderColor: 'rgba(245, 158, 11, 0.3)',
    borderWidth: 1,
    borderRadius: theme.radii.md,
    padding: 14,
  },
  offlineNoticeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
    gap: 8,
  },
  offlineNoticeTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fbbf24',
  },
  offlineNoticeDesc: {
    fontSize: 13,
    color: theme.colors.textSecondary,
    lineHeight: 18,
    marginBottom: 12,
  },
  offlineNoticeActions: {
    flexDirection: 'row',
    gap: 10,
  },
  offlineActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: theme.radii.full,
  },
  offlineActionBtnSecondary: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: theme.colors.separator,
  },
  offlineActionBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: theme.colors.tint,
  },
  offlineActionBtnSecondaryText: {
    fontSize: 12,
    fontWeight: '600',
    color: theme.colors.textSecondary,
  },
  offlineShelf: {
    marginTop: 10,
  },
  offlineShelfHeader: {
    marginBottom: 4,
  },
  playButtonsRow: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: theme.spacing.md,
    marginBottom: 16,
  },
  btn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 11,
    borderRadius: theme.radii.full,
    gap: 8,
  },
  primaryBtn: {
    backgroundColor: theme.colors.tint,
  },
  secondaryBtn: {
    backgroundColor: theme.colors.card,
    borderWidth: 1,
    borderColor: theme.colors.separator,
  },
  primaryBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  secondaryBtnText: {
    color: theme.colors.tint,
    fontSize: 15,
    fontWeight: '700',
  },
  offlineEmptyActions: {
    gap: 12,
    width: '100%',
    maxWidth: 280,
  },
  primaryActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: theme.colors.tint,
    paddingVertical: 12,
    borderRadius: theme.radii.full,
  },
  primaryActionBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  secondaryActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: theme.colors.card,
    borderWidth: 1,
    borderColor: theme.colors.separator,
    paddingVertical: 12,
    borderRadius: theme.radii.full,
  },
  secondaryActionBtnText: {
    color: theme.colors.textPrimary,
    fontSize: 15,
    fontWeight: '600',
  },
});
