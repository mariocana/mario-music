import React, { useEffect, useRef, useState } from 'react';
import {
  ActionSheetIOS,
  ActivityIndicator,
  Alert,
  Dimensions,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { api, uploadPlaylistCover } from '../api';
import { useDownloads } from '../downloads/DownloadsContext';
import { NomeDialog } from '../components/NomeDialog';
import { PlaylistCover } from '../components/PlaylistCover';
import { TrackRow } from '../components/TrackRow';
import { usePlayer } from '../player/PlayerContext';
import { theme } from '../theme';
import { formatLength, type PlaylistDetail, type PlaylistSummary } from '../types';

type Props = {
  playlist: PlaylistSummary | { id: number; name: string } | null;
  /** torna alla schermata precedente: anche dopo l'eliminazione, una volta sola */
  onBack: () => void;
  /** per aggiornare altro dopo l'eliminazione, NON per navigare: a quello pensa già onBack */
  onPlaylistDeleted?: (id: number) => void;
};

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const COVER_SIZE = Math.min(SCREEN_WIDTH * 0.55, 220);

export const PlaylistDetailModal: React.FC<Props> = ({
  playlist,
  onBack,
  onPlaylistDeleted,
}) => {
  // Il dettaglio si ricorda per quale playlist è arrivato: aprendone un altro si
  // vede il caricamento, non quello di prima (e senza azzerare lo stato
  // dentro l'effect, che costerebbe un render in più).
  const [arrivato, setArrivato] = useState<{ id: number; detail: PlaylistDetail | null } | null>(null);
  const detail = playlist && arrivato?.id === playlist.id ? arrivato.detail : null;
  const loading = Boolean(playlist) && arrivato?.id !== playlist?.id;
  // Il nome mostrato: quello con cui si è aperta la schermata, finché una
  // rinomina non lo cambia (la lista sotto si ricarica da sola al ritorno).
  const [rinominata, setRinominata] = useState<{ id: number; name: string } | null>(null);
  const nome = rinominata && rinominata.id === playlist?.id ? rinominata.name : (playlist?.name ?? '');
  const [rinomina, setRinomina] = useState(false);
  const [caricoCopertina, setCaricoCopertina] = useState(false);
  /** le modifiche ai brani, una dopo l'altra (vedi handleRemoveTrack) */
  const codaModifiche = useRef<Promise<unknown>>(Promise.resolve());
  const modificheInCorso = useRef(0);
  const { downloadTrack, removeTrack, isDownloaded } = useDownloads();
  /** download in corso: quanti brani fatti su quanti */
  const [scarico, setScarico] = useState<{ fatti: number; totale: number } | null>(null);

  const { playQueue, toggleShuffle, shuffle } = usePlayer();

  /**
   * Ricarica dopo una modifica (brano tolto o spostato). Il dettaglio vecchio
   * resta a schermo finché arriva quello nuovo, invece di sparire dietro la
   * rotellina. Un errore lascia quello che c'era.
   */
  const loadDetail = () => {
    if (!playlist) return;
    const id = playlist.id;
    void api
      .playlist(id)
      .then((res) => setArrivato({ id, detail: res }))
      .catch(() => undefined);
  };

  useEffect(() => {
    if (!playlist) return;
    const id = playlist.id;
    let mounted = true;
    api
      .playlist(id)
      .then((res) => {
        if (mounted) setArrivato({ id, detail: res });
      })
      .catch(() => {
        if (mounted) setArrivato({ id, detail: null });
      });
    return () => {
      mounted = false;
    };
  }, [playlist]);

  if (!playlist) return null;

  const tracks = detail?.tracks ?? [];
  const totalDuration = tracks.reduce((acc, t) => acc + t.duration, 0);

  const handlePlayAll = (casuale: boolean) => {
    if (tracks.length === 0) return;
    if (casuale && !shuffle) toggleShuffle();
    if (!casuale && shuffle) toggleShuffle();
    const startIndex = casuale ? Math.floor(Math.random() * tracks.length) : 0;
    playQueue(tracks, startIndex);
  };

  // Una playlist può contenere lo stesso brano più volte: si scarica una volta sola.
  const braniUnici = Array.from(new Map(tracks.map((t) => [t.id, t])).values());
  const scaricati = braniUnici.filter((t) => isDownloaded(t.id)).length;
  const tuttiScaricati = braniUnici.length > 0 && scaricati === braniUnici.length;

  /**
   * Scarica i brani che mancano, uno alla volta, contando i fatti per la
   * scritta "Scarico 3 di 12". Un brano che fallisce non ferma gli altri, ma
   * alla fine lo si dice: altrimenti offline mancherebbe senza spiegazione.
   */
  const scaricaPlaylist = async () => {
    const mancanti = braniUnici.filter((t) => !isDownloaded(t.id));
    if (mancanti.length === 0 || scarico) return;
    let falliti = 0;
    setScarico({ fatti: 0, totale: mancanti.length });
    for (let k = 0; k < mancanti.length; k++) {
      try {
        await downloadTrack(mancanti[k]);
      } catch {
        falliti++;
      }
      setScarico({ fatti: k + 1, totale: mancanti.length });
    }
    setScarico(null);
    if (falliti > 0) {
      Alert.alert(
        'Download incompleto',
        falliti === mancanti.length
          ? 'Nessun brano è stato scaricato. Controlla la connessione al server.'
          : `${falliti} ${falliti === 1 ? 'brano non è stato scaricato' : 'brani non sono stati scaricati'}. Riprova: verranno scaricati solo quelli che mancano.`,
      );
    }
  };

  const confermaRimuoviDownload = () => {
    Alert.alert(
      'Rimuovi download',
      `I ${braniUnici.length} brani di "${nome}" verranno tolti dal telefono, anche se li avevi scaricati per un album o un'altra playlist. Restano ascoltabili in streaming.`,
      [
        { text: 'Annulla', style: 'cancel' },
        {
          text: 'Rimuovi',
          style: 'destructive',
          onPress: async () => {
            for (const t of braniUnici) await removeTrack(t.id);
          },
        },
      ],
    );
  };

  const toggleDownloadPlaylist = () => {
    if (tuttiScaricati) confermaRimuoviDownload();
    else void scaricaPlaylist();
  };

  /*
   * Togliere e spostare lavorano per posizione (0, 1, 2… contigue sul server).
   * La lista si aggiorna subito anche qui, rinumerata, così una seconda
   * modifica fatta prima che arrivi la ricarica usa già le posizioni giuste;
   * e le richieste partono una dopo l'altra, perché due in volo insieme
   * potrebbero arrivare al server in ordine inverso. Alla fine si ricarica:
   * se qualcosa è andato storto, torna la versione vera del server.
   */
  const aggiornaSubito = (cambia: (t: PlaylistDetail['tracks']) => PlaylistDetail['tracks']) =>
    setArrivato((a) => (a?.detail
      ? { ...a, detail: { ...a.detail, tracks: cambia(a.detail.tracks).map((t, i) => ({ ...t, position: i })) } }
      : a));

  const modifica = (richiesta: () => Promise<unknown>, errore: string) => {
    modificheInCorso.current++;
    codaModifiche.current = codaModifiche.current
      .then(richiesta)
      .catch((err) => Alert.alert('Errore', err instanceof Error ? err.message : errore))
      .finally(() => {
        // Si ricarica solo a coda vuota: una ricarica a metà riporterebbe a
        // schermo lo stato intermedio, prima delle modifiche ancora in fila.
        modificheInCorso.current--;
        if (modificheInCorso.current === 0) loadDetail();
      });
  };

  const handleRemoveTrack = (position: number) => {
    aggiornaSubito((t) => t.filter((_, k) => k !== position));
    modifica(() => api.removeTrackFromPlaylist(playlist.id, position), 'Impossibile rimuovere il brano');
  };

  const handleMoveTrack = (from: number, to: number) => {
    aggiornaSubito((t) => {
      const copia = [...t];
      const [mosso] = copia.splice(from, 1);
      copia.splice(to, 0, mosso);
      return copia;
    });
    modifica(() => api.moveTrackInPlaylist(playlist.id, from, to), 'Impossibile spostare il brano');
  };

  const handleRename = async (nuovo: string) => {
    // Un errore (nome vuoto, playlist sparita) lo mostra il riquadro, che resta aperto.
    const res = await api.renamePlaylist(playlist.id, nuovo);
    setRinominata({ id: playlist.id, name: res.name });
    setRinomina(false);
  };

  const scegliCopertina = async () => {
    const scelta = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      // Il ritaglio quadrato è quello che il server farebbe comunque: meglio
      // che lo scelga chi guarda. Su iOS dà anche un JPEG al posto dell'HEIC
      // delle foto dell'iPhone, che ffmpeg sul server potrebbe non leggere.
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.85,
    });
    if (scelta.canceled || !scelta.assets?.[0]) return;
    const foto = scelta.assets[0];
    setCaricoCopertina(true);
    try {
      const coverKey = await uploadPlaylistCover(playlist.id, foto.uri, foto.mimeType);
      setArrivato((a) => (a?.detail ? { ...a, detail: { ...a.detail, coverKey } } : a));
    } catch (err) {
      Alert.alert('Immagine non caricata', err instanceof Error ? err.message : 'Caricamento non riuscito');
    } finally {
      setCaricoCopertina(false);
    }
  };

  const rimuoviCopertina = async () => {
    try {
      await api.removePlaylistCover(playlist.id);
      setArrivato((a) => (a?.detail ? { ...a, detail: { ...a.detail, coverKey: null } } : a));
    } catch (err) {
      Alert.alert('Errore', err instanceof Error ? err.message : "Impossibile rimuovere l'immagine");
    }
  };

  const confirmDelete = () => {
    Alert.alert(
      'Elimina playlist',
      `Sei sicuro di voler eliminare la playlist "${nome}"? I brani non verranno cancellati dalla libreria.`,
      [
        { text: 'Annulla', style: 'cancel' },
        {
          text: 'Elimina',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.deletePlaylist(playlist.id);
              onBack();
              if (onPlaylistDeleted) onPlaylistDeleted(playlist.id);
            } catch (err) {
              Alert.alert('Errore', err instanceof Error ? err.message : 'Impossibile eliminare');
            }
          },
        },
      ]
    );
  };

  const showMoreMenu = () => {
    const haImmagine = Boolean(detail?.coverKey);
    const voci: { testo: string; azione: () => void; distruttiva?: boolean }[] = [
      { testo: 'Rinomina', azione: () => setRinomina(true) },
    ];
    if (braniUnici.length > 0 && !scarico) {
      voci.push(tuttiScaricati
        ? { testo: 'Rimuovi download', azione: confermaRimuoviDownload, distruttiva: true }
        : { testo: scaricati > 0 ? 'Scarica i brani mancanti' : 'Scarica playlist', azione: () => void scaricaPlaylist() });
    }
    voci.push(
      { testo: haImmagine ? 'Cambia immagine' : 'Scegli immagine', azione: () => void scegliCopertina() },
    );
    if (haImmagine) voci.push({ testo: 'Rimuovi immagine', azione: () => void rimuoviCopertina() });
    voci.push({ testo: 'Elimina playlist', azione: confirmDelete, distruttiva: true });

    if (Platform.OS === 'ios') {
      const options = ['Annulla', ...voci.map((v) => v.testo)];
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options,
          // Le voci distruttive possono essere due (rimuovi download, elimina): iOS ne colora quante gliene si danno.
          destructiveButtonIndex: voci.flatMap((v, k) => (v.distruttiva ? [k + 1] : [])),
          cancelButtonIndex: 0,
          title: nome,
        },
        (buttonIndex) => voci[buttonIndex - 1]?.azione(),
      );
    } else {
      // Prima qui si andava dritti alla conferma di eliminazione: con più voci serve un menu.
      Alert.alert(nome, undefined, [
        { text: 'Annulla', style: 'cancel' },
        ...voci.map((v) => ({
          text: v.testo,
          style: v.distruttiva ? ('destructive' as const) : ('default' as const),
          onPress: v.azione,
        })),
      ]);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.navBar}>
        <Pressable hitSlop={12} onPress={onBack} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color={theme.colors.tint} />
          <Text style={styles.backLabel}>Indietro</Text>
        </Pressable>

        <Pressable hitSlop={12} onPress={showMoreMenu} style={styles.iconBtn}>
          <Ionicons name="ellipsis-horizontal" size={20} color={theme.colors.textSecondary} />
        </Pressable>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <View style={styles.topInfo}>
          <View>
            <PlaylistCover
              playlist={{
                id: playlist.id,
                name: nome,
                coverKey: detail?.coverKey ?? null,
                // Senza immagine scelta, lo stesso mosaico della lista: gli album
                // dei primi quattro brani (come la query sul server).
                covers: tracks.slice(0, 4).map((t) => ({ albumId: t.albumId, coverKey: t.coverKey })),
              }}
              size={COVER_SIZE}
              borderRadius={theme.radii.lg}
            />
            {caricoCopertina && (
              <View style={[styles.coverOverlay, { borderRadius: theme.radii.lg }]}>
                <ActivityIndicator size="large" color="#fff" />
              </View>
            )}
          </View>
          <Text style={styles.title}>{nome}</Text>
          <Text style={styles.meta}>
            {tracks.length} {tracks.length === 1 ? 'brano' : 'brani'}
            {tracks.length > 0 ? ` · ${formatLength(totalDuration)}` : ''}
          </Text>
          {scarico ? (
            <Text style={styles.metaDownload}>Scarico {scarico.fatti + 1 > scarico.totale ? scarico.totale : scarico.fatti + 1} di {scarico.totale}…</Text>
          ) : scaricati > 0 ? (
            <Text style={styles.metaDownload}>
              {tuttiScaricati ? 'Scaricata: si ascolta anche offline' : `${scaricati} di ${braniUnici.length} brani scaricati`}
            </Text>
          ) : null}
        </View>

        {/* Pulsanti Riproduci / Casuale */}
        {tracks.length > 0 && (
          <View style={styles.actionButtons}>
            <Pressable
              style={[styles.btn, styles.primaryBtn]}
              onPress={() => handlePlayAll(false)}
            >
              <Ionicons name="play" size={20} color="#fff" />
              <Text style={styles.primaryBtnText}>Riproduci</Text>
            </Pressable>

            <Pressable
              style={[styles.btn, styles.secondaryBtn]}
              onPress={() => handlePlayAll(true)}
            >
              <Ionicons name="shuffle" size={20} color={theme.colors.tint} />
              <Text style={styles.secondaryBtnText}>Casuale</Text>
            </Pressable>

            <Pressable
              style={[styles.iconActionBtn, tuttiScaricati && styles.iconActionBtnActive]}
              onPress={toggleDownloadPlaylist}
              disabled={scarico !== null}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={tuttiScaricati ? 'Rimuovi download della playlist' : 'Scarica la playlist'}
            >
              {scarico ? (
                <ActivityIndicator size="small" color={theme.colors.tint} />
              ) : (
                <Ionicons
                  name={tuttiScaricati ? 'checkmark-circle' : 'cloud-download-outline'}
                  size={22}
                  color={tuttiScaricati ? theme.colors.tint : theme.colors.textSecondary}
                />
              )}
            </Pressable>
          </View>
        )}

        {loading ? (
          <View style={styles.centerBox}>
            <ActivityIndicator size="large" color={theme.colors.tint} />
          </View>
        ) : tracks.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="musical-notes-outline" size={40} color={theme.colors.textMuted} />
            <Text style={styles.emptyText}>Playlist vuota</Text>
            <Text style={styles.emptySubtext}>
              Aggiungi brani dal menù ⋯ di qualsiasi brano nella libreria.
            </Text>
          </View>
        ) : (
          <View style={styles.trackList}>
            {tracks.map((track, i) => (
              <TrackRow
                key={`${track.id}-${i}`}
                track={track}
                index={i}
                onPress={() => playQueue(tracks, i)}
                playlistContext={{
                  playlistId: playlist.id,
                  totalTracks: tracks.length,
                  onMoveUp: i > 0 ? () => void handleMoveTrack(i, i - 1) : undefined,
                  onMoveDown: i < tracks.length - 1 ? () => void handleMoveTrack(i, i + 1) : undefined,
                  onRemove: () => void handleRemoveTrack(i),
                }}
              />
            ))}
          </View>
        )}
      </ScrollView>

      <NomeDialog
        visible={rinomina}
        titolo="Rinomina playlist"
        iniziale={nome}
        conferma="Salva"
        onConferma={handleRename}
        onAnnulla={() => setRinomina(false)}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  coverOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  navBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
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
  iconBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scroll: {
    flex: 1,
  },
  content: {
    paddingBottom: 130,
  },
  topInfo: {
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: 20,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: theme.colors.textPrimary,
    marginTop: 16,
    textAlign: 'center',
  },
  meta: {
    fontSize: 14,
    color: theme.colors.textMuted,
    marginTop: 6,
    textAlign: 'center',
  },
  metaDownload: {
    fontSize: 13,
    color: theme.colors.tint,
    marginTop: 4,
    textAlign: 'center',
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
  actionButtons: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 12,
    marginBottom: 20,
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
  trackList: {
    paddingHorizontal: 16,
  },
  centerBox: {
    paddingTop: 40,
    alignItems: 'center',
  },
  emptyContainer: {
    paddingTop: 60,
    paddingHorizontal: 24,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.textSecondary,
  },
  emptySubtext: {
    fontSize: 13,
    color: theme.colors.textMuted,
    textAlign: 'center',
  },
});
