import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../api';
import { PlaylistCover } from '../components/PlaylistCover';
import { theme } from '../theme';
import { formatLength, type PlaylistSummary } from '../types';

type Props = {
  onBack?: () => void;
  onSelectPlaylist: (playlist: PlaylistSummary) => void;
};

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_WIDTH = Math.floor((SCREEN_WIDTH - 48) / 2);

export const PlaylistsScreen: React.FC<Props> = ({ onBack, onSelectPlaylist }) => {
  const [playlists, setPlaylists] = useState<PlaylistSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState('');
  const [creating, setCreating] = useState(false);

  const loadPlaylists = async () => {
    try {
      const res = await api.playlists();
      setPlaylists(res);
    } catch {
      // ignore
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    void loadPlaylists();
  }, []);

  const handleCreate = async () => {
    const name = newPlaylistName.trim();
    if (!name || creating) return;
    setCreating(true);
    try {
      const created = await api.createPlaylist(name);
      setNewPlaylistName('');
      setCreateModalVisible(false);
      await loadPlaylists();
      if (created) onSelectPlaylist(created);
    } catch (err) {
      Alert.alert('Errore', err instanceof Error ? err.message : 'Impossibile creare la playlist');
    } finally {
      setCreating(false);
    }
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
        data={playlists}
        keyExtractor={(item) => String(item.id)}
        numColumns={2}
        contentContainerStyle={styles.listContent}
        columnWrapperStyle={styles.columnWrapper}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              void loadPlaylists();
            }}
            tintColor={theme.colors.tint}
          />
        }
        ListHeaderComponent={
          <View style={styles.header}>
            <View style={styles.titleRow}>
              <Text style={styles.pageTitle}>Playlist</Text>
              <Pressable
                style={styles.addBtn}
                onPress={() => setCreateModalVisible(true)}
                hitSlop={10}
              >
                <Ionicons name="add" size={22} color={theme.colors.tint} />
                <Text style={styles.addBtnText}>Nuova</Text>
              </Pressable>
            </View>
          </View>
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="list-outline" size={48} color={theme.colors.textMuted} />
            <Text style={styles.emptyText}>Nessuna playlist creata.</Text>
            <Pressable
              style={styles.createFirstBtn}
              onPress={() => setCreateModalVisible(true)}
            >
              <Text style={styles.createFirstBtnText}>Crea una playlist</Text>
            </Pressable>
          </View>
        }
        renderItem={({ item }) => (
          <Pressable
            style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
            onPress={() => onSelectPlaylist(item)}
          >
            <PlaylistCover playlist={item} size={CARD_WIDTH} borderRadius={theme.radii.md} />
            <Text style={styles.playlistName} numberOfLines={1}>
              {item.name}
            </Text>
            <Text style={styles.playlistMeta} numberOfLines={1}>
              {item.trackCount} {item.trackCount === 1 ? 'brano' : 'brani'}
              {item.trackCount > 0 ? ` · ${formatLength(item.duration)}` : ''}
            </Text>
          </Pressable>
        )}
      />

      {/* Modale Creazione Nuova Playlist */}
      <Modal
        visible={createModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setCreateModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalDialog}>
            <Text style={styles.modalTitle}>Nuova playlist</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Nome della playlist"
              placeholderTextColor={theme.colors.textMuted}
              value={newPlaylistName}
              onChangeText={setNewPlaylistName}
              autoFocus
            />
            <View style={styles.modalActions}>
              <Pressable
                style={[styles.dialogBtn, styles.dialogBtnCancel]}
                onPress={() => {
                  setNewPlaylistName('');
                  setCreateModalVisible(false);
                }}
              >
                <Text style={styles.dialogBtnCancelText}>Annulla</Text>
              </Pressable>

              <Pressable
                style={[styles.dialogBtn, styles.dialogBtnConfirm, !newPlaylistName.trim() && styles.disabledBtn]}
                onPress={() => void handleCreate()}
                disabled={!newPlaylistName.trim() || creating}
              >
                {creating ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.dialogBtnConfirmText}>Crea</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
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
    paddingHorizontal: theme.spacing.md,
    paddingBottom: 120,
  },
  columnWrapper: {
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  header: {
    marginBottom: 16,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  pageTitle: {
    fontSize: 34,
    fontWeight: '800',
    color: theme.colors.textPrimary,
    letterSpacing: -0.5,
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 16,
    gap: 4,
  },
  addBtnText: {
    fontSize: 15,
    fontWeight: '600',
    color: theme.colors.tint,
  },
  card: {
    width: CARD_WIDTH,
  },
  cardPressed: {
    opacity: 0.8,
  },
  playlistName: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.textPrimary,
    marginTop: 8,
  },
  playlistMeta: {
    fontSize: 12,
    color: theme.colors.textMuted,
    marginTop: 2,
  },
  emptyContainer: {
    paddingTop: 80,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  emptyText: {
    fontSize: 16,
    color: theme.colors.textMuted,
  },
  createFirstBtn: {
    backgroundColor: theme.colors.tint,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: theme.radii.md,
  },
  createFirstBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 15,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalDialog: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: theme.colors.card,
    borderRadius: theme.radii.lg,
    padding: 20,
    borderWidth: 1,
    borderColor: theme.colors.separator,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.colors.textPrimary,
    marginBottom: 16,
    textAlign: 'center',
  },
  modalInput: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: theme.radii.sm,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: theme.colors.textPrimary,
    marginBottom: 16,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 12,
  },
  dialogBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: theme.radii.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dialogBtnCancel: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  dialogBtnCancelText: {
    color: theme.colors.textSecondary,
    fontWeight: '600',
    fontSize: 15,
  },
  dialogBtnConfirm: {
    backgroundColor: theme.colors.tint,
  },
  dialogBtnConfirmText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 15,
  },
  disabledBtn: {
    opacity: 0.5,
  },
});
