/**
 * KaraokeModal.tsx — il testo a tutto schermo, con la riga che si accende.
 *
 * Stessa fonte della scheda "Testo", altra resa: poche righe, quella in corso
 * grande al centro, e le sue parole che si accendono una alla volta mentre la
 * si canta (vedi karaoke.ts: è una stima dichiarata, perché i tempi di
 * LRCLIB sono per riga, non per parola).
 *
 * IL TEMPO SI LEGGE A OGNI FOTOGRAMMA da getTime(), non dallo stato: quello
 * si aggiorna quattro volte al secondo e le parole avanzerebbero a scatti. Lo
 * stato di React cambia solo quando cambia qualcosa da disegnare (una riga
 * nuova, una parola in più accesa): pochi render al secondo, non sessanta.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { useKeepAwake } from 'expo-keep-awake';
import { Ionicons } from '@expo/vector-icons';
import { api, coverUrl } from '../api';
import { avanzamentoRiga, finestra, parole } from '../karaoke';
import { indiceAttivo } from '../lyricsSync';
import { usePlayer } from '../player/PlayerContext';
import { theme } from '../theme';
import type { LyricLine } from '../types';

type Props = {
  visible: boolean;
  onClose: () => void;
};

/**
 * Lo schermo resta acceso finché il karaoke è aperto: è l'unica schermata che
 * si guarda da lontano, senza toccarla, e iOS la spegnerebbe dopo trenta
 * secondi. Un componente a parte perché useKeepAwake vale finché chi lo usa
 * è montato, e KaraokeModal resta montato anche da chiuso.
 */
function TieniAcceso() {
  // Su Android, se l'Activity è già andata quando si chiude, il rilascio
  // lancerebbe un errore non gestito: non c'è niente da rilasciare, si tace.
  useKeepAwake('karaoke', { suppressDeactivateWarnings: true });
  return null;
}

export const KaraokeModal: React.FC<Props> = ({ visible, onClose }) => {
  const { current, isPlaying, toggle, next, previous, seek, getTime, duration } = usePlayer();
  const trackId = current?.id ?? null;

  // Il testo si ricorda per quale brano è arrivato: a brano cambiato, quello
  // vecchio non si mostra più mentre arriva il nuovo.
  const [arrivato, setArrivato] = useState<{ trackId: number; righe: LyricLine[] | null } | null>(null);
  const loading = trackId !== null && arrivato?.trackId !== trackId;
  const righe = !loading && arrivato ? arrivato.righe : null;

  useEffect(() => {
    if (!visible || trackId === null) return;
    let vivo = true;
    void api.lyrics(trackId)
      .then((l) => { if (vivo) setArrivato({ trackId, righe: l.synced && l.synced.length > 0 ? l.synced : null }); })
      .catch(() => { if (vivo) setArrivato({ trackId, righe: null }); });
    return () => { vivo = false; };
  }, [visible, trackId]);

  // { riga in corso, quante parole ne sono già state cantate }
  const [pos, setPos] = useState({ riga: -1, accese: 0 });

  useEffect(() => {
    if (!visible || !righe) return;
    let frame = 0;
    let ultima = { riga: -2, accese: -1 };
    const tick = () => {
      const t = getTime();
      const i = indiceAttivo(righe, t);
      const avanti = avanzamentoRiga(righe, i, t, duration);
      const accese = i >= 0 ? parole(righe[i].text || '♪').filter((p) => avanti >= p.inizio).length : 0;
      if (i !== ultima.riga || accese !== ultima.accese) {
        ultima = { riga: i, accese };
        setPos(ultima);
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [visible, righe, getTime, duration]);

  const vista = useMemo(() => finestra(righe, pos.riga), [righe, pos.riga]);

  return (
    <Modal visible={visible} animationType="fade" presentationStyle="fullScreen" onRequestClose={onClose}>
      {visible && <TieniAcceso />}
      <View style={styles.container}>
        {/* La copertina ingrandita e sfocata dà un colore alla stanza senza rubare leggibilità. */}
        {current?.coverKey && (
          <Image
            source={{ uri: coverUrl(current.albumId, current.coverKey) }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            blurRadius={60}
          />
        )}
        <View style={[StyleSheet.absoluteFill, styles.velo]} />

        <SafeAreaView style={styles.safe}>
          <View style={styles.testa}>
            <View style={styles.brano}>
              <Text style={styles.titolo} numberOfLines={1}>{current?.title}</Text>
              <Text style={styles.artista} numberOfLines={1}>{current?.artist}</Text>
            </View>
            <Pressable
              onPress={onClose}
              hitSlop={12}
              style={styles.chiudi}
              accessibilityRole="button"
              accessibilityLabel="Esci dal karaoke"
            >
              <Ionicons name="close" size={24} color={theme.colors.textPrimary} />
            </Pressable>
          </View>

          <View style={styles.corpo}>
            {loading && <Text style={styles.avviso}>Cerco il testo…</Text>}
            {!loading && !righe && (
              <View>
                <Text style={styles.avviso}>{"Per questo brano non c'è un testo sincronizzato."}</Text>
                <Text style={styles.nota}>
                  Il karaoke ha bisogno dei tempi di ogni verso: LRCLIB non li ha per tutti i brani.
                </Text>
              </View>
            )}

            {righe && vista.righe.map((riga, k) => {
              const corrente = k === vista.attiva;
              const passata = vista.attiva >= 0 && k < vista.attiva;
              return (
                <Pressable
                  key={`${riga.t}-${riga.indice}`}
                  onPress={() => seek(riga.t)}
                  accessibilityRole="button"
                  accessibilityHint="Salta a questo verso"
                >
                  {corrente ? (
                    <Text style={styles.rigaAttiva}>
                      {parole(riga.text || '♪').map((pa, n) => (
                        <Text key={n} style={n < pos.accese ? styles.parolaDetta : styles.parolaDaDire}>
                          {pa.testo}
                        </Text>
                      ))}
                    </Text>
                  ) : (
                    <Text style={[styles.riga, passata && styles.rigaPassata]}>{riga.text || '♪'}</Text>
                  )}
                </Pressable>
              );
            })}
          </View>

          <View style={styles.piede}>
            <Pressable onPress={previous} hitSlop={12} accessibilityRole="button" accessibilityLabel="Precedente">
              <Ionicons name="play-skip-back" size={30} color={theme.colors.textPrimary} />
            </Pressable>
            <Pressable
              onPress={toggle}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel={isPlaying ? 'Pausa' : 'Riproduci'}
            >
              <Ionicons name={isPlaying ? 'pause' : 'play'} size={44} color={theme.colors.textPrimary} />
            </Pressable>
            <Pressable onPress={next} hitSlop={12} accessibilityRole="button" accessibilityLabel="Successivo">
              <Ionicons name="play-skip-forward" size={30} color={theme.colors.textPrimary} />
            </Pressable>
          </View>
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
  velo: {
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
  },
  safe: {
    flex: 1,
  },
  testa: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 22,
    paddingVertical: 12,
  },
  brano: {
    flex: 1,
    marginRight: 16,
  },
  titolo: {
    fontSize: 15,
    fontWeight: '700',
    color: theme.colors.textPrimary,
  },
  artista: {
    fontSize: 13,
    color: theme.colors.textSecondary,
    marginTop: 2,
  },
  chiudi: {
    padding: 4,
  },
  corpo: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 28,
    gap: 18,
  },
  riga: {
    fontSize: 22,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.45)',
  },
  rigaPassata: {
    color: 'rgba(255, 255, 255, 0.25)',
  },
  rigaAttiva: {
    fontSize: 34,
    fontWeight: '800',
    lineHeight: 42,
  },
  parolaDetta: {
    color: '#fff',
  },
  parolaDaDire: {
    color: 'rgba(255, 255, 255, 0.4)',
  },
  avviso: {
    fontSize: 18,
    fontWeight: '600',
    color: theme.colors.textPrimary,
    textAlign: 'center',
  },
  nota: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    marginTop: 10,
    lineHeight: 20,
  },
  piede: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 48,
    paddingVertical: 20,
  },
});
