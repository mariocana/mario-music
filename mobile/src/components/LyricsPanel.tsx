/**
 * LyricsPanel.tsx — la scheda "Testo" della schermata di riproduzione.
 *
 * Il verso in corso resta al centro da solo, come nel web (scrollIntoView) e
 * in Apple Music. Ma se si scorre col dito per leggere più avanti o tornare
 * indietro, lo scorrimento automatico si fa da parte per qualche secondo:
 * strappare la lista di mano a chi la sta leggendo è la cosa più fastidiosa
 * che un testo sincronizzato possa fare.
 *
 * Il tempo si legge a ogni fotogramma da getTime() (vedi KaraokeModal), ma lo
 * stato cambia solo quando cambia il verso: un render per riga, non sessanta
 * al secondo.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, type ScrollViewInstance } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../api';
import { indiceAttivo } from '../lyricsSync';
import { usePlayer } from '../player/PlayerContext';
import { theme } from '../theme';
import type { Lyrics } from '../types';

/** Dopo quanto, da quando si è smesso di toccare, lo scorrimento torna automatico. */
const PAUSA_DOPO_TOCCO_MS = 3000;

type Props = {
  trackId: number;
  onKaraoke: () => void;
};

export const LyricsPanel: React.FC<Props> = ({ trackId, onKaraoke }) => {
  const { getTime, seek } = usePlayer();

  // Il testo è del brano: si ricorda per quale brano è arrivato. Cambiato
  // brano, quello vecchio non vale più subito, invece di restare evidenziato
  // a tempo sbagliato finché arriva il nuovo.
  const [arrivato, setArrivato] = useState<{ trackId: number; lyrics: Lyrics | null } | null>(null);
  const loading = arrivato?.trackId !== trackId;
  const lyrics = loading ? null : arrivato.lyrics;

  useEffect(() => {
    let vivo = true;
    void api.lyrics(trackId)
      .then((l) => { if (vivo) setArrivato({ trackId, lyrics: l }); })
      .catch(() => { if (vivo) setArrivato({ trackId, lyrics: null }); });
    return () => { vivo = false; };
  }, [trackId]);

  const righe = useMemo(
    () => (lyrics?.synced && lyrics.synced.length > 0 ? lyrics.synced : null),
    [lyrics],
  );

  // Il verso in corso, legato al testo a cui si riferisce: con un testo nuovo
  // vale -1 finché il ciclo qui sotto non ha letto il tempo.
  const [stato, setStato] = useState<{ righe: typeof righe; i: number }>({ righe: null, i: -1 });
  const attiva = stato.righe === righe ? stato.i : -1;
  const attivaRef = useRef(attiva);
  useEffect(() => {
    attivaRef.current = attiva;
  }, [attiva]);

  useEffect(() => {
    if (!righe) return;
    let frame = 0;
    let ultima = -2;
    const tick = () => {
      const i = indiceAttivo(righe, getTime());
      if (i !== ultima) {
        ultima = i;
        setStato({ righe, i });
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [righe, getTime]);

  /* ── scorrimento automatico ── */
  const scrollRef = useRef<ScrollViewInstance>(null);
  /** posizione e altezza di ogni verso, come le riporta onLayout */
  const posizioni = useRef<Array<{ y: number; h: number }>>([]);
  const altezzaVista = useRef(0);
  /** fino a quando lo scorrimento resta in mano all'utente */
  const manualeFino = useRef(0);
  const dentroTocco = useRef(false);

  const centra = useCallback((i: number, animato: boolean) => {
    const p = posizioni.current[i];
    if (!p || altezzaVista.current === 0) return;
    const y = Math.max(0, p.y + p.h / 2 - altezzaVista.current / 2);
    scrollRef.current?.scrollTo({ y, animated: animato });
  }, []);

  useEffect(() => {
    if (attiva < 0) return;
    if (dentroTocco.current || Date.now() < manualeFino.current) return;
    centra(attiva, true);
  }, [attiva, centra]);

  // Brano nuovo: si riparte dall'alto, e le misure vecchie non valgono più.
  useEffect(() => {
    posizioni.current = [];
    manualeFino.current = 0;
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }, [trackId]);

  const iniziaTocco = () => {
    dentroTocco.current = true;
  };
  const fineTocco = () => {
    dentroTocco.current = false;
    manualeFino.current = Date.now() + PAUSA_DOPO_TOCCO_MS;
  };

  // Passata la pausa, si torna al verso in corso anche se nel frattempo non è cambiato.
  useEffect(() => {
    if (!righe) return;
    const timer = setInterval(() => {
      if (dentroTocco.current || manualeFino.current === 0 || Date.now() < manualeFino.current) return;
      manualeFino.current = 0;
      if (attivaRef.current >= 0) centra(attivaRef.current, true);
    }, 500);
    return () => clearInterval(timer);
  }, [righe, centra]);

  if (loading) {
    return <Text style={styles.avviso}>Cerco il testo…</Text>;
  }

  return (
    <ScrollView
      ref={scrollRef}
      style={styles.scroll}
      contentContainerStyle={styles.content}
      onLayout={(e) => { altezzaVista.current = e.nativeEvent.layout.height; }}
      onScrollBeginDrag={iniziaTocco}
      onScrollEndDrag={fineTocco}
      onMomentumScrollEnd={() => { if (!dentroTocco.current) manualeFino.current = Date.now() + PAUSA_DOPO_TOCCO_MS; }}
      scrollEventThrottle={16}
    >
      {righe && (
        <Pressable
          onPress={onKaraoke}
          style={styles.karaokeBtn}
          accessibilityRole="button"
          accessibilityLabel="Apri il karaoke a tutto schermo"
        >
          <Ionicons name="mic" size={16} color={theme.colors.tint} />
          <Text style={styles.karaokeBtnText}>Karaoke</Text>
        </Pressable>
      )}

      {righe ? (
        righe.map((line, i) => (
          <Pressable
            key={`${line.t}-${i}`}
            onPress={() => {
              // Toccare un verso è un "portami qui": lo scorrimento torna automatico subito.
              manualeFino.current = 0;
              seek(line.t);
            }}
            onLayout={(e) => {
              const { y, height } = e.nativeEvent.layout;
              posizioni.current[i] = { y, h: height };
              // La prima misura del verso in corso arriva dopo che è già attivo: centralo ora.
              if (i === attivaRef.current && !dentroTocco.current && Date.now() >= manualeFino.current) {
                centra(i, false);
              }
            }}
            style={styles.riga}
            accessibilityRole="button"
            accessibilityHint="Salta a questo verso"
          >
            <Text style={[styles.testo, i < attiva && styles.testoPassato, i === attiva && styles.testoAttivo]}>
              {line.text || '♪'}
            </Text>
          </Pressable>
        ))
      ) : lyrics?.plain ? (
        <View>
          <Text style={styles.semplice}>{lyrics.plain}</Text>
          {lyrics.source === 'tag' && (
            <Text style={styles.fonte}>Testo preso dai tag del file, senza tempi.</Text>
          )}
        </View>
      ) : (
        <View>
          <Text style={styles.avviso}>Nessun testo trovato per questo brano.</Text>
          <Text style={styles.fonte}>Cercato su LRCLIB per titolo, artista e durata.</Text>
        </View>
      )}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
    paddingHorizontal: theme.spacing.lg,
  },
  content: {
    paddingVertical: 32,
  },
  riga: {
    paddingVertical: 12,
  },
  testo: {
    fontSize: 22,
    fontWeight: '600',
    color: theme.colors.textMuted,
    lineHeight: 32,
  },
  testoPassato: {
    opacity: 0.6,
  },
  testoAttivo: {
    color: theme.colors.textPrimary,
    fontSize: 26,
    fontWeight: '800',
  },
  semplice: {
    fontSize: 18,
    color: theme.colors.textSecondary,
    lineHeight: 28,
  },
  fonte: {
    fontSize: 13,
    color: theme.colors.textMuted,
    textAlign: 'center',
    marginTop: 16,
  },
  avviso: {
    fontSize: 16,
    color: theme.colors.textMuted,
    textAlign: 'center',
    marginTop: 40,
  },
  karaokeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginBottom: 16,
    borderRadius: 999,
    backgroundColor: theme.colors.tintSubtle,
  },
  karaokeBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.tint,
  },
});
