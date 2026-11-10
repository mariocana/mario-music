import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../api';
import { theme } from '../theme';
import type { PlaylistSummary, Track } from '../types';
import { PlaylistCover } from './PlaylistCover';

type Props = {
  visible: boolean;
  tracks: Track[] | null;
  onClose: () => void;
};

export const AddToPlaylistModal: React.FC<Props> = ({ visible, tracks, onClose }) => {
  const [playlists, setPlaylists] = useState<PlaylistSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!visible) {
      setShowCreate(false);
      setNewPlaylistName('');
      return;
    }
    setLoading(true);
    let mounted = true;
    api
      .playlists()
      .then((res) => {
        if (mounted) setPlaylists(res);
      })
      .catch(() => undefined)
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [visible]);

  if (!visible || !tracks || tracks.length === 0) return null;

  const trackIds = tracks.map((t) => t.id);

  const handleAddToPlaylist = async (playlist: PlaylistSummary) => {
    if (adding) return;
    setAdding(true);
    try {
      const res = await api.addTracksToPlaylist(playlist.id, trackIds);
      const quanti = res.added;
      const msg = quanti === 1 ? 'Brano aggiunto' : `Aggiunti ${quanti} brani`;
      onClose();
      Alert.alert('Aggiunto alla playlist', `${msg} a "${playlist.name}"`);
    } catch (err) {
      Alert.alert('Errore', err instanceof Error ? err.message : 'Impossibile aggiungere alla playlist');
    } finally {
      setAdding(false);
    }
  };

  const handleCreateAndAdd = async () => {
    const name = newPlaylistName.trim();
    if (!name || creating) return;
    setCreating(true);
    try {
      const created = await api.createPlaylist(name);
      if (created) {
        await api.addTracksToPlaylist(created.id, trackIds);
        onClose();
        Alert.alert('Playlist creata', `Creata "${created.name}" e ${tracks.length === 1 ? 'aggiunto il brano' : `aggiunti ${tracks.length} brani`}`);
      }
    } catch (err) {
      Alert.alert('Errore', err instanceof Error ? err.message : 'Impossibile creare la playlist');
    } finally {
      setCreating(false);
    }
  };

  const titleSubtext =
    tracks.length === 1
      ? `${tracks[0].title} • ${tracks[0].artist}`
      : `${tracks.length} brani selezionati`;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={onClose} />

        <View style={styles.sheet}>
          <View style={styles.header}>
            <View style={styles.headerTextContainer}>
              <Text style={styles.title}>Aggiungi a playlist</Text>
              <Text style={styles.subtitle} numberOfLines={1}>
                {titleSubtext}
              </Text>
            </View>
            <Pressable hitSlop={12} onPress={onClose} style={styles.closeBtn}>
              <Ionicons name="close" size={22} color={theme.colors.textSecondary} />
            </Pressable>
          </View>

          {/* Nuova playlist: form espanso o bottone */}
          {showCreate ? (
            <View style={styles.createForm}>
              <TextInput
                style={styles.input}
                placeholder="Nome della nuova playlist"
                placeholderTextColor={theme.colors.textMuted}
                value={newPlaylistName}
                onChangeText={setNewPlaylistName}
                autoFocus
              />
              <View style={styles.createActions}>
                <Pressable
                  style={[styles.btn, styles.cancelBtn]}
                  onPress={() => {
                    setShowCreate(false);
                    setNewPlaylistName('');
                  }}
                >
                  <Text style={styles.cancelBtnText}>Annulla</Text>
                </Pressable>
                <Pressable
                  style={[styles.btn, styles.confirmBtn, !newPlaylistName.trim() && styles.disabledBtn]}
                  disabled={!newPlaylistName.trim() || creating}
                  onPress={() => void handleCreateAndAdd()}
                >
                  {creating ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={styles.confirmBtnText}>Crea e aggiungi</Text>
                  )}
                </Pressable>
              </View>
            </View>
          ) : (
            <Pressable style={styles.newPlaylistBtn} onPress={() => setShowCreate(true)}>
              <View style={styles.plusIconWrap}>
                <Ionicons name="add" size={22} color={theme.colors.tint} />
              </View>
              <Text style={styles.newPlaylistText}>Nuova playlist…</Text>
            </Pressable>
          )}

          {/* Elenco playlist */}
          {loading ? (
            <View style={styles.center}>
              <ActivityIndicator size="small" color={theme.colors.tint} />
            </View>
          ) : playlists.length === 0 ? (
            <View style={styles.empty}>
              <Text style={styles.emptyText}>Nessuna playlist creata</Text>
            </View>
          ) : (
            <FlatList
              data={playlists}
              keyExtractor={(item) => String(item.id)}
              style={styles.list}
              contentContainerStyle={styles.listContent}
              renderItem={({ item }) => (
                <Pressable
                  style={({ pressed }) => [styles.playlistItem, pressed && styles.playlistItemPressed]}
                  onPress={() => void handleAddToPlaylist(item)}
                  disabled={adding}
                >
                  <PlaylistCover playlist={item} size={44} borderRadius={theme.radii.sm} />
                  <View style={styles.playlistMeta}>
                    <Text style={styles.playlistName} numberOfLines={1}>
                      {item.name}
                    </Text>
                    <Text style={styles.playlistCount}>
                      {item.trackCount} {item.trackCount === 1 ? 'brano' : 'brani'}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={theme.colors.textMuted} />
                </Pressable>
              )}
            />
          )}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'flex-end',
  },
  backdrop: {
    flex: 1,
  },
  sheet: {
    backgroundColor: '#1b1b1f',
    borderTopLeftRadius: theme.radii.lg,
    borderTopRightRadius: theme.radii.lg,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    maxHeight: '80%',
    paddingBottom: 24,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.md,
    paddingBottom: theme.spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.separator,
  },
  headerTextContainer: {
    flex: 1,
    marginRight: 10,
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
    color: theme.colors.textPrimary,
  },
  subtitle: {
    fontSize: 12,
    color: theme.colors.textMuted,
    marginTop: 2,
  },
  closeBtn: {
    padding: 4,
  },
  newPlaylistBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.separator,
  },
  plusIconWrap: {
    width: 44,
    height: 44,
    borderRadius: theme.radii.sm,
    backgroundColor: theme.colors.tintSubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  newPlaylistText: {
    fontSize: 15,
    fontWeight: '600',
    color: theme.colors.tint,
  },
  createForm: {
    padding: theme.spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.separator,
    backgroundColor: theme.colors.card,
  },
  input: {
    backgroundColor: '#27272a',
    borderRadius: theme.radii.sm,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: theme.colors.textPrimary,
    fontSize: 15,
    marginBottom: 10,
  },
  createActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
  },
  btn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: theme.radii.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelBtn: {
    backgroundColor: 'transparent',
  },
  cancelBtnText: {
    color: theme.colors.textSecondary,
    fontSize: 14,
    fontWeight: '600',
  },
  confirmBtn: {
    backgroundColor: theme.colors.tint,
  },
  confirmBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  disabledBtn: {
    opacity: 0.4,
  },
  list: {
    maxHeight: 380,
  },
  listContent: {
    paddingVertical: 6,
  },
  playlistItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 8,
    gap: 12,
  },
  playlistItemPressed: {
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
  },
  playlistMeta: {
    flex: 1,
  },
  playlistName: {
    fontSize: 15,
    fontWeight: '600',
    color: theme.colors.textPrimary,
  },
  playlistCount: {
    fontSize: 12,
    color: theme.colors.textMuted,
    marginTop: 2,
  },
  center: {
    padding: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  empty: {
    padding: 30,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 14,
    color: theme.colors.textMuted,
  },
});
