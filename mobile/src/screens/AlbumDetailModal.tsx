import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../api';
import { CoverImage } from '../components/CoverImage';
import { TrackRow } from '../components/TrackRow';
import { useDownloads } from '../downloads/DownloadsContext';
import { usePlayer } from '../player/PlayerContext';
import { theme } from '../theme';
import { formatLength, type Album, type AlbumDetail } from '../types';

type Props = {
  album: Album | null;
  onBack: () => void;
};

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const COVER_SIZE = Math.min(SCREEN_WIDTH * 0.55, 220);

export const AlbumDetailModal: React.FC<Props> = ({ album, onBack }) => {
  const [detail, setDetail] = useState<AlbumDetail | null>(null);
  const [loading, setLoading] = useState(false);

  const { playQueue } = usePlayer();
  const { downloadTracks, removeTrack, isDownloaded } = useDownloads();
  const [downloadingAlbum, setDownloadingAlbum] = useState(false);

  useEffect(() => {
    if (!album) {
      setDetail(null);
      return;
    }
    setLoading(true);
    let mounted = true;
    api
      .album(album.id)
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
  }, [album]);

  if (!album) return null;

  const tracks = detail?.tracks ?? [];
  const totalDuration = tracks.reduce((acc, t) => acc + t.duration, 0);

  const downloadedCount = tracks.filter((t) => isDownloaded(t.id)).length;
  const allDownloaded = tracks.length > 0 && downloadedCount === tracks.length;

  const handleToggleDownloadAlbum = async () => {
    if (allDownloaded) {
      for (const t of tracks) {
        await removeTrack(t.id);
      }
    } else {
      setDownloadingAlbum(true);
      try {
        await downloadTracks(tracks);
      } finally {
        setDownloadingAlbum(false);
      }
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
        <View style={styles.topInfo}>
          <CoverImage
            albumId={album.id}
            coverKey={album.coverKey}
            size={COVER_SIZE}
            borderRadius={theme.radii.lg}
          />
          <Text style={styles.title}>{album.title}</Text>
          <Text style={styles.artist}>{album.artist}</Text>
          <Text style={styles.meta}>
            {album.year ? `${album.year} • ` : ''}
            {album.genre ? `${album.genre} • ` : ''}
            {tracks.length} brani, {formatLength(totalDuration)}
          </Text>
        </View>

        {/* Pulsanti Riproduci / Casuale / Download */}
        <View style={styles.actionButtons}>
          <Pressable
            style={[styles.btn, styles.primaryBtn]}
            onPress={() => tracks.length > 0 && playQueue(tracks, 0)}
          >
            <Ionicons name="play" size={20} color="#fff" />
            <Text style={styles.primaryBtnText}>Riproduci</Text>
          </Pressable>

          <Pressable
            style={[styles.btn, styles.secondaryBtn]}
            onPress={() => {
              if (tracks.length > 0) {
                const rnd = Math.floor(Math.random() * tracks.length);
                playQueue(tracks, rnd);
              }
            }}
          >
            <Ionicons name="shuffle" size={20} color={theme.colors.tint} />
            <Text style={styles.secondaryBtnText}>Casuale</Text>
          </Pressable>

          {tracks.length > 0 && (
            <Pressable
              style={[styles.iconActionBtn, allDownloaded && styles.iconActionBtnActive]}
              onPress={() => void handleToggleDownloadAlbum()}
              disabled={downloadingAlbum}
              hitSlop={8}
            >
              {downloadingAlbum ? (
                <ActivityIndicator size="small" color={theme.colors.tint} />
              ) : (
                <Ionicons
                  name={allDownloaded ? 'checkmark-circle' : 'cloud-download-outline'}
                  size={22}
                  color={allDownloaded ? theme.colors.tint : theme.colors.textSecondary}
                />
              )}
            </Pressable>
          )}
        </View>

        {/* Elenco tracce */}
        {loading ? (
          <ActivityIndicator size="small" color={theme.colors.tint} style={{ marginTop: 24 }} />
        ) : (
          <View style={styles.trackList}>
            {tracks.map((track, i) => (
              <TrackRow
                key={track.id}
                track={track}
                index={i}
                showCover={false}
                onPress={() => playQueue(tracks, i)}
              />
            ))}
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
  topInfo: {
    alignItems: 'center',
    paddingHorizontal: theme.spacing.lg,
    paddingTop: 8,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: theme.colors.textPrimary,
    textAlign: 'center',
    marginTop: 16,
  },
  artist: {
    fontSize: 16,
    color: theme.colors.tint,
    fontWeight: '600',
    marginTop: 4,
  },
  meta: {
    fontSize: 13,
    color: theme.colors.textMuted,
    marginTop: 4,
  },
  actionButtons: {
    flexDirection: 'row',
    paddingHorizontal: theme.spacing.md,
    gap: 12,
    marginTop: 20,
    marginBottom: 16,
  },
  btn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: theme.radii.md,
    gap: 6,
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
  iconActionBtn: {
    width: 48,
    height: 48,
    borderRadius: theme.radii.md,
    backgroundColor: theme.colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconActionBtnActive: {
    backgroundColor: 'rgba(250, 36, 60, 0.15)',
  },
  trackList: {
    marginTop: 8,
  },
});
