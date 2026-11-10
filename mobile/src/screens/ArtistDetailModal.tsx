import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { api, coverUrl } from '../api';
import { CoverImage } from '../components/CoverImage';
import { TrackRow } from '../components/TrackRow';
import { usePlayer } from '../player/PlayerContext';
import { theme } from '../theme';
import type { Album, Artist, ArtistDetail } from '../types';

type Props = {
  artist: Artist | { id: number; name: string } | null;
  onBack: () => void;
  onSelectAlbum: (album: Album) => void;
};

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const ALBUM_CARD_WIDTH = Math.floor((SCREEN_WIDTH - 48) / 2);

export const ArtistDetailModal: React.FC<Props> = ({
  artist,
  onBack,
  onSelectAlbum,
}) => {
  const [detail, setDetail] = useState<ArtistDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [playingAll, setPlayingAll] = useState(false);

  const { playQueue, toggleShuffle, shuffle } = usePlayer();

  useEffect(() => {
    if (!artist) {
      setDetail(null);
      return;
    }
    setLoading(true);
    let mounted = true;
    api
      .artist(artist.id)
      .then((res) => {
        if (mounted) setDetail(res);
      })
      .catch(() => undefined)
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [artist]);

  if (!artist) return null;

  const albums = detail?.albums.filter((a) => a.trackCount > 1) ?? [];
  const singles = detail?.albums.filter((a) => a.trackCount <= 1) ?? [];
  const totalTracks = detail?.albums.reduce((n, a) => n + a.trackCount, 0) ?? 0;

  const playAll = async (casuale: boolean) => {
    if (playingAll || !artist) return;
    setPlayingAll(true);
    try {
      const tracks = await api.artistTracks(artist.id);
      if (tracks.length === 0) return;
      if (casuale && !shuffle) toggleShuffle();
      if (!casuale && shuffle) toggleShuffle();
      const startIndex = casuale ? Math.floor(Math.random() * tracks.length) : 0;
      playQueue(tracks, startIndex);
    } catch {
      // ignore
    } finally {
      setPlayingAll(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.navBar}>
        <Pressable hitSlop={12} onPress={onBack} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color={theme.colors.tint} />
          <Text style={styles.backLabel}>Indietro</Text>
        </Pressable>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        {/* Artist Hero Header */}
        <View style={styles.heroSection}>
          {detail?.cover ? (
            <Image
              source={{ uri: coverUrl(detail.cover.albumId, detail.cover.coverKey) }}
              style={styles.heroImage}
              blurRadius={18}
            />
          ) : (
            <View style={[styles.heroImage, styles.heroPlaceholder]} />
          )}
          <View style={styles.heroOverlay} />

          <View style={styles.heroContent}>
            <Text style={styles.artistName} numberOfLines={2}>
              {artist.name}
            </Text>
            <Text style={styles.artistSub}>
              {detail ? `${detail.albums.length} album · ${totalTracks} brani` : 'Caricamento...'}
            </Text>
          </View>
        </View>

        {/* Pulsanti Riproduci / Casuale */}
        <View style={styles.actionButtons}>
          <Pressable
            style={[styles.btn, styles.primaryBtn]}
            onPress={() => void playAll(false)}
            disabled={playingAll}
          >
            {playingAll ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <Ionicons name="play" size={20} color="#fff" />
                <Text style={styles.primaryBtnText}>Riproduci</Text>
              </>
            )}
          </Pressable>

          <Pressable
            style={[styles.btn, styles.secondaryBtn]}
            onPress={() => void playAll(true)}
            disabled={playingAll}
          >
            <Ionicons name="shuffle" size={20} color={theme.colors.tint} />
            <Text style={styles.secondaryBtnText}>Casuale</Text>
          </Pressable>
        </View>

        {loading && (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="large" color={theme.colors.tint} />
          </View>
        )}

        {/* Top brani */}
        {detail && detail.topTracks.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Top brani</Text>
            {detail.topTracks.map((track, i) => (
              <TrackRow
                key={track.id}
                track={track}
                index={i}
                currentArtistId={artist.id}
                onPress={() => playQueue(detail.topTracks, i)}
              />
            ))}
          </View>
        )}

        {/* Album */}
        {albums.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Album</Text>
            <View style={styles.albumGrid}>
              {albums.map((alb) => (
                <Pressable
                  key={alb.id}
                  style={styles.albumCard}
                  onPress={() => onSelectAlbum(alb)}
                >
                  <CoverImage
                    albumId={alb.id}
                    coverKey={alb.coverKey}
                    size={ALBUM_CARD_WIDTH}
                    borderRadius={theme.radii.md}
                  />
                  <Text style={styles.albumTitle} numberOfLines={1}>
                    {alb.title}
                  </Text>
                  <Text style={styles.albumMeta} numberOfLines={1}>
                    {alb.year ? `${alb.year} · ` : ''}
                    {alb.trackCount} {alb.trackCount === 1 ? 'brano' : 'brani'}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        )}

        {/* Singoli */}
        {singles.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Singoli</Text>
            <View style={styles.albumGrid}>
              {singles.map((alb) => (
                <Pressable
                  key={alb.id}
                  style={styles.albumCard}
                  onPress={() => onSelectAlbum(alb)}
                >
                  <CoverImage
                    albumId={alb.id}
                    coverKey={alb.coverKey}
                    size={ALBUM_CARD_WIDTH}
                    borderRadius={theme.radii.md}
                  />
                  <Text style={styles.albumTitle} numberOfLines={1}>
                    {alb.title}
                  </Text>
                  <Text style={styles.albumMeta} numberOfLines={1}>
                    {alb.year ? `${alb.year} · ` : ''}Singolo
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        )}
      </ScrollView>
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
  scroll: {
    flex: 1,
  },
  content: {
    paddingBottom: 130,
  },
  heroSection: {
    height: 190,
    width: '100%',
    position: 'relative',
    justifyContent: 'flex-end',
    paddingHorizontal: 20,
    paddingBottom: 20,
    marginBottom: 16,
    overflow: 'hidden',
  },
  heroImage: {
    ...StyleSheet.absoluteFill,
    width: '100%',
    height: '100%',
    opacity: 0.45,
  },
  heroPlaceholder: {
    backgroundColor: '#1c1c1e',
  },
  heroOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  heroContent: {
    zIndex: 2,
  },
  artistName: {
    fontSize: 32,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: -0.5,
    marginBottom: 4,
  },
  artistSub: {
    fontSize: 15,
    color: 'rgba(255, 255, 255, 0.8)',
    fontWeight: '500',
  },
  actionButtons: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 12,
    marginBottom: 24,
  },
  btn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: theme.radii.md,
    gap: 8,
  },
  primaryBtn: {
    backgroundColor: theme.colors.tint,
  },
  primaryBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 16,
  },
  secondaryBtn: {
    backgroundColor: theme.colors.card,
  },
  secondaryBtnText: {
    color: theme.colors.tint,
    fontWeight: '700',
    fontSize: 16,
  },
  loadingBox: {
    paddingVertical: 40,
    alignItems: 'center',
  },
  section: {
    marginTop: 20,
    paddingHorizontal: 16,
  },
  sectionTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: theme.colors.textPrimary,
    marginBottom: 12,
  },
  albumGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
  },
  albumCard: {
    width: ALBUM_CARD_WIDTH,
  },
  albumTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.textPrimary,
    marginTop: 6,
  },
  albumMeta: {
    fontSize: 12,
    color: theme.colors.textMuted,
    marginTop: 2,
  },
});
