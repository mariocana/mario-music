/**
 * ReplayView.tsx — la scheda "Riepilogo" di Ascolti, sul modello di Apple Music Replay.
 *
 * Tutto esce dalla tabella `plays` del server: un ascolto, un istante. I
 * minuti sono la somma delle durate dei brani ascoltati: una stima per
 * eccesso, ma un ascolto si registra solo dopo metà brano, quindi l'errore è
 * piccolo.
 *
 * I grafici sono fatti di View: nessuna libreria. Ognuno porta in
 * accessibilityLabel tutti i suoi numeri, così resta leggibile anche con
 * VoiceOver.
 */
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../api';
import { useNavigation } from '../navigation/NavigationContext';
import { usePlayer } from '../player/PlayerContext';
import {
  altezzaBarra, dataBreve, dataLunga, meseBreve, meseLungo, oreMinuti, riproduzioni,
} from '../replay';
import { theme } from '../theme';
import type { Replay } from '../types';
import { CoverImage } from './CoverImage';

const PERIODI: ReadonlyArray<{ label: string; giorni: number | null }> = [
  { label: 'Sempre', giorni: null },
  { label: 'Ultimo anno', giorni: 365 },
  { label: 'Ultimo mese', giorni: 30 },
  { label: 'Ultima settimana', giorni: 7 },
];

const ALTEZZA_GRAFICO = 110;

type Barra = { chiave: string; valore: number; sotto: string; voce: string };

function Barre({ dati }: { dati: Barra[] }) {
  const massimo = Math.max(...dati.map((d) => d.valore), 1);
  return (
    <View
      style={styles.barre}
      accessible
      accessibilityRole="image"
      accessibilityLabel={dati.map((d) => `${d.voce}: ${riproduzioni(d.valore)}`).join(', ')}
    >
      {dati.map((d) => (
        <View key={d.chiave} style={styles.barra}>
          <View style={styles.barraAsta}>
            <View style={[styles.barraPiena, { height: `${altezzaBarra(d.valore, massimo) * 100}%` }]} />
          </View>
          <Text style={styles.barraSotto} numberOfLines={1}>{d.sotto}</Text>
        </View>
      ))}
    </View>
  );
}

function Tessera({ numero, sotto }: { numero: string; sotto: string }) {
  return (
    <View style={styles.tessera}>
      <Text style={styles.tesseraNumero} numberOfLines={1} adjustsFontSizeToFit>{numero}</Text>
      <Text style={styles.tesseraSotto}>{sotto}</Text>
    </View>
  );
}

export const ReplayView: React.FC = () => {
  const [giorni, setGiorni] = useState<number | null>(null);
  // La risposta si ricorda per quale periodo è arrivata: cambiato periodo, si
  // mostra il caricamento invece dei numeri del periodo precedente.
  const [arrivato, setArrivato] = useState<{ giorni: number | null; data: Replay | null; error: string | null } | null>(null);
  const loading = arrivato?.giorni !== giorni;
  const data = loading ? null : arrivato.data;
  const error = loading ? null : arrivato.error;

  const { playQueue } = usePlayer();
  const { navigateToAlbum, navigateToArtist } = useNavigation();

  useEffect(() => {
    let vivo = true;
    void api.replay(giorni)
      .then((r) => { if (vivo) setArrivato({ giorni, data: r, error: null }); })
      .catch((err) => {
        if (vivo) setArrivato({ giorni, data: null, error: err instanceof Error ? err.message : 'Riepilogo non disponibile' });
      });
    return () => { vivo = false; };
  }, [giorni]);

  /** Come la card "Riprendi" della Home: il brano parte dal suo album, non da solo. */
  const riproduciBrano = async (trackId: number, albumId: number) => {
    const album = await api.album(albumId).catch(() => null);
    if (!album || album.tracks.length === 0) return;
    playQueue(album.tracks, Math.max(0, album.tracks.findIndex((t) => t.id === trackId)));
  };

  return (
    <View>
      <View style={styles.periodi}>
        {PERIODI.map((p) => {
          const attivo = giorni === p.giorni;
          return (
            <Pressable
              key={p.label}
              style={[styles.pill, attivo && styles.pillAttiva]}
              onPress={() => setGiorni(p.giorni)}
              accessibilityRole="button"
              accessibilityState={{ selected: attivo }}
            >
              <Text style={[styles.pillTesto, attivo && styles.pillTestoAttivo]}>{p.label}</Text>
            </Pressable>
          );
        })}
      </View>

      {loading ? (
        <View style={styles.centro}>
          <ActivityIndicator size="large" color={theme.colors.tint} />
        </View>
      ) : error ? (
        <Text style={styles.vuoto}>Errore: {error}</Text>
      ) : !data || data.totali.ascolti === 0 ? (
        <View style={styles.centro}>
          <Ionicons name="stats-chart-outline" size={48} color={theme.colors.textMuted} />
          <Text style={styles.vuoto}>
            Ancora nessun ascolto in questo periodo. Un brano viene contato quando lo ascolti
            almeno a metà: saltare tra le tracce non conta.
          </Text>
        </View>
      ) : (
        <>
          <View style={styles.tessere}>
            <Tessera numero={oreMinuti(data.totali.minuti)} sotto="ascoltati" />
            <Tessera numero={String(data.totali.ascolti)} sotto="riproduzioni" />
            <Tessera numero={String(data.totali.brani)} sotto="brani diversi" />
            <Tessera numero={String(data.totali.artisti)} sotto="artisti" />
          </View>

          {data.record && (
            <Text style={styles.nota}>
              Giornata record: <Text style={styles.notaForte}>{dataLunga(data.record.data)}</Text>
              {' '}con {riproduzioni(data.record.ascolti)}.
              {data.inizio && giorni === null ? ` Conto gli ascolti dal ${dataBreve(data.inizio)}.` : ''}
            </Text>
          )}

          <Text style={styles.sezione}>I tuoi artisti</Text>
          {data.artisti.map((a, i) => (
            <Pressable
              key={a.id}
              style={({ pressed }) => [styles.riga, pressed && styles.rigaPremuta]}
              onPress={() => navigateToArtist(a.id, { name: a.nome })}
            >
              <Text style={styles.posizione}>{i + 1}</Text>
              <View style={styles.rigaTesto}>
                <Text style={styles.rigaTitolo} numberOfLines={1}>{a.nome}</Text>
                <Text style={styles.rigaSotto} numberOfLines={1}>
                  {riproduzioni(a.ascolti)} · {oreMinuti(a.minuti)}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={theme.colors.textMuted} />
            </Pressable>
          ))}

          <Text style={styles.sezione}>I tuoi album</Text>
          {data.album.map((a, i) => (
            <Pressable
              key={a.id}
              style={({ pressed }) => [styles.riga, pressed && styles.rigaPremuta]}
              onPress={() => navigateToAlbum(a.id, { title: a.titolo, artist: a.artista, coverKey: a.coverKey })}
            >
              <Text style={styles.posizione}>{i + 1}</Text>
              <CoverImage albumId={a.id} coverKey={a.coverKey} size={44} borderRadius={theme.radii.sm} />
              <View style={styles.rigaTesto}>
                <Text style={styles.rigaTitolo} numberOfLines={1}>{a.titolo}</Text>
                <Text style={styles.rigaSotto} numberOfLines={1}>{a.artista} · {riproduzioni(a.ascolti)}</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={theme.colors.textMuted} />
            </Pressable>
          ))}

          <Text style={styles.sezione}>I tuoi brani</Text>
          {data.brani.map((b, i) => (
            <Pressable
              key={b.id}
              style={({ pressed }) => [styles.riga, pressed && styles.rigaPremuta]}
              onPress={() => void riproduciBrano(b.id, b.albumId)}
              accessibilityHint="Riproduce il brano dal suo album"
            >
              <Text style={styles.posizione}>{i + 1}</Text>
              <CoverImage albumId={b.albumId} coverKey={b.coverKey} size={44} borderRadius={theme.radii.sm} />
              <View style={styles.rigaTesto}>
                <Text style={styles.rigaTitolo} numberOfLines={1}>{b.titolo}</Text>
                <Text style={styles.rigaSotto} numberOfLines={1}>{b.artista} · {riproduzioni(b.ascolti)}</Text>
              </View>
            </Pressable>
          ))}

          {data.mesi.length > 1 && (
            <>
              <Text style={styles.sezione}>Mese per mese</Text>
              <Barre
                dati={data.mesi.map((m) => ({
                  chiave: m.mese,
                  valore: m.ascolti,
                  sotto: meseBreve(m.mese),
                  voce: meseLungo(m.mese),
                }))}
              />
            </>
          )}

          <Text style={styles.sezione}>A che ora ascolti</Text>
          <Barre
            dati={data.ore.map((o) => ({
              chiave: String(o.ora),
              valore: o.ascolti,
              // Un'etichetta ogni sei ore: ventiquattro numeri in fila non si leggono.
              sotto: o.ora % 6 === 0 ? String(o.ora) : '',
              voce: `ore ${o.ora}`,
            }))}
          />
        </>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  periodi: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  pill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
  },
  pillAttiva: {
    backgroundColor: theme.colors.tint,
  },
  pillTesto: {
    fontSize: 13,
    fontWeight: '500',
    color: theme.colors.textMuted,
  },
  pillTestoAttivo: {
    color: '#fff',
    fontWeight: '600',
  },
  centro: {
    paddingTop: 50,
    alignItems: 'center',
    gap: 12,
  },
  vuoto: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    maxWidth: 300,
    lineHeight: 20,
  },
  tessere: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  tessera: {
    // due per riga, con lo spazio in mezzo
    flexBasis: '47%',
    flexGrow: 1,
    backgroundColor: theme.colors.card,
    borderRadius: theme.radii.md,
    padding: 14,
  },
  tesseraNumero: {
    fontSize: 24,
    fontWeight: '800',
    color: theme.colors.textPrimary,
  },
  tesseraSotto: {
    fontSize: 13,
    color: theme.colors.textSecondary,
    marginTop: 2,
  },
  nota: {
    fontSize: 13,
    color: theme.colors.textSecondary,
    marginTop: 14,
    lineHeight: 19,
  },
  notaForte: {
    fontWeight: '700',
    color: theme.colors.textPrimary,
  },
  sezione: {
    fontSize: 20,
    fontWeight: '800',
    color: theme.colors.textPrimary,
    marginTop: 28,
    marginBottom: 8,
  },
  riga: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    gap: 12,
  },
  rigaPremuta: {
    opacity: 0.6,
  },
  posizione: {
    width: 20,
    fontSize: 15,
    fontWeight: '700',
    color: theme.colors.textMuted,
    textAlign: 'center',
  },
  rigaTesto: {
    flex: 1,
  },
  rigaTitolo: {
    fontSize: 15,
    fontWeight: '600',
    color: theme.colors.textPrimary,
  },
  rigaSotto: {
    fontSize: 13,
    color: theme.colors.textSecondary,
    marginTop: 2,
  },
  barre: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 3,
    paddingTop: 8,
  },
  barra: {
    flex: 1,
    alignItems: 'center',
  },
  barraAsta: {
    width: '100%',
    height: ALTEZZA_GRAFICO,
    justifyContent: 'flex-end',
  },
  barraPiena: {
    width: '100%',
    backgroundColor: theme.colors.tint,
    borderTopLeftRadius: 3,
    borderTopRightRadius: 3,
  },
  barraSotto: {
    fontSize: 11,
    color: theme.colors.textMuted,
    marginTop: 4,
    height: 14,
  },
});
