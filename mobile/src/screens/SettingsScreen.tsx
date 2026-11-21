import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../api';
import { getServerUrlSync, setServerUrl } from '../config';
import { DURATE_CROSSFADE } from '../gapless';
import { RIFERIMENTO } from '../loudness';
import { avvisiScan, riepilogoScan, type ScanResult } from '../scan';
import { QUALITA } from '../sorgente';
import { usePlayer } from '../player/PlayerContext';
import { theme } from '../theme';
import { formatLength, type Stats } from '../types';

type Props = {
  onBack?: () => void;
};

export const SettingsScreen: React.FC<Props> = ({ onBack }) => {
  const [url, setUrl] = useState(getServerUrlSync());
  const [stats, setStats] = useState<Stats | null>(null);
  const [testing, setTesting] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const { crossfade, setCrossfade, qualita, setQualita, normalizza, setNormalizza } = usePlayer();
  const [scansione, setScansione] = useState<
    { stato: 'in corso' } | { stato: 'fatto'; risultato: ScanResult } | { stato: 'errore'; messaggio: string } | null
  >(null);

  /**
   * Le altre schermate si ricaricano da sole quando ci si torna (si rimontano
   * a ogni cambio di scheda): qui basta aggiornare le statistiche.
   */
  const aggiornaLibreria = async () => {
    setScansione({ stato: 'in corso' });
    try {
      const risultato = await api.scan();
      setScansione({ stato: 'fatto', risultato });
      setStats(await api.stats());
    } catch (err) {
      setScansione({ stato: 'errore', messaggio: err instanceof Error ? err.message : 'Aggiornamento non riuscito' });
    }
  };

  const checkConnection = async (targetUrl = url) => {
    setTesting(true);
    setStatusMsg(null);
    try {
      await setServerUrl(targetUrl);
      const res = await api.stats();
      setStats(res);
      setStatusMsg({ ok: true, text: 'Connessione stabilita con successo!' });
    } catch (err) {
      setStats(null);
      setStatusMsg({
        ok: false,
        text: `Errore di connessione: ${err instanceof Error ? err.message : 'Impossibile raggiungere il server'}`,
      });
    } finally {
      setTesting(false);
    }
  };

  useEffect(() => {
    void checkConnection();
  }, []);

  const handleSave = async () => {
    if (!url.trim()) {
      Alert.alert('Errore', 'Inserisci un URL valido');
      return;
    }
    await checkConnection(url.trim());
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {onBack && (
        <View style={styles.navBar}>
          <Pressable style={styles.backBtn} onPress={onBack} hitSlop={10}>
            <Ionicons name="chevron-back" size={24} color={theme.colors.tint} />
            <Text style={styles.backLabel}>Libreria</Text>
          </Pressable>
        </View>
      )}

      <Text style={styles.pageTitle}>Impostazioni</Text>

      {/* Sezione Server */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>SERVER MARIO MUSIC</Text>
        <View style={styles.card}>
          <Text style={styles.label}>Indirizzo del server:</Text>
          <TextInput
            style={styles.input}
            value={url}
            onChangeText={setUrl}
            placeholder="es. http://192.168.1.100:4000"
            placeholderTextColor={theme.colors.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <Pressable style={styles.saveBtn} onPress={handleSave} disabled={testing}>
            {testing ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.saveBtnText}>Salva e verifica connessione</Text>
            )}
          </Pressable>

          {statusMsg && (
            <View style={[styles.statusBox, statusMsg.ok ? styles.statusBoxOk : styles.statusBoxErr]}>
              <Ionicons
                name={statusMsg.ok ? 'checkmark-circle' : 'alert-circle'}
                size={18}
                color={statusMsg.ok ? theme.colors.success : theme.colors.error}
              />
              <Text style={[styles.statusText, { color: statusMsg.ok ? theme.colors.success : theme.colors.error }]}>
                {statusMsg.text}
              </Text>
            </View>
          )}
        </View>
      </View>

      {/* Statistiche Libreria */}
      {stats && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>STATISTICHE LIBRERIA</Text>
          <View style={styles.card}>
            <View style={styles.statRow}>
              <Text style={styles.statLabel}>Artisti</Text>
              <Text style={styles.statValue}>{stats.artists}</Text>
            </View>
            <View style={styles.statRow}>
              <Text style={styles.statLabel}>Album</Text>
              <Text style={styles.statValue}>{stats.albums}</Text>
            </View>
            <View style={styles.statRow}>
              <Text style={styles.statLabel}>Brani indicizzati</Text>
              <Text style={styles.statValue}>{stats.tracks}</Text>
            </View>
            <View style={[styles.statRow, { borderBottomWidth: 0 }]}>
              <Text style={styles.statLabel}>Durata totale</Text>
              <Text style={styles.statValue}>{formatLength(stats.duration)}</Text>
            </View>

            <Pressable
              style={[styles.saveBtn, styles.scanBtn, scansione?.stato === 'in corso' && styles.scanBtnBusy]}
              onPress={() => void aggiornaLibreria()}
              disabled={scansione?.stato === 'in corso'}
              accessibilityRole="button"
              accessibilityHint="Il server rilegge la cartella della musica e aggiunge i brani nuovi"
            >
              {scansione?.stato === 'in corso' ? (
                <View style={styles.scanBusyRow}>
                  <ActivityIndicator size="small" color="#fff" />
                  <Text style={styles.saveBtnText}>Aggiorno la libreria…</Text>
                </View>
              ) : (
                <Text style={styles.saveBtnText}>Aggiorna libreria</Text>
              )}
            </Pressable>
            {scansione?.stato === 'in corso' && (
              <Text style={styles.hint}>Con molti album nuovi può volerci qualche minuto.</Text>
            )}
            {scansione?.stato === 'fatto' && (
              <>
                <Text style={styles.scanEsito}>{riepilogoScan(scansione.risultato)}</Text>
                {avvisiScan(scansione.risultato).map((a) => (
                  <Text key={a} style={styles.scanAvviso}>{a}</Text>
                ))}
              </>
            )}
            {scansione?.stato === 'errore' && (
              <Text style={styles.scanAvviso}>{scansione.messaggio}</Text>
            )}
          </View>
        </View>
      )}

      {/* Passaggio tra un brano e l'altro */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>RIPRODUZIONE</Text>
        <View style={styles.card}>
          <View style={styles.switchRow}>
            <Text style={styles.switchLabel}>Volume uniforme</Text>
            <Switch
              value={normalizza}
              onValueChange={setNormalizza}
              trackColor={{ true: theme.colors.tint }}
              accessibilityLabel="Volume uniforme"
            />
          </View>
          <Text style={[styles.hint, styles.hintAfterSwitch]}>
            {normalizza
              ? `I brani più forti vengono abbassati al livello di riferimento (${RIFERIMENTO} LUFS): un album rimasterizzato non ti fa sobbalzare dopo uno del 1975. Il volume non viene mai alzato, quindi niente distorsione.`
              : 'Ogni brano suona al volume con cui è stato masterizzato.'}
          </Text>

          <Text style={[styles.label, styles.labelSpaced]}>Dissolvenza incrociata</Text>
          <View style={styles.segmented}>
            {DURATE_CROSSFADE.map((secondi) => {
              const scelto = crossfade === secondi;
              return (
                <Pressable
                  key={secondi}
                  onPress={() => setCrossfade(secondi)}
                  style={[styles.segment, scelto && styles.segmentActive]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: scelto }}
                >
                  <Text style={[styles.segmentText, scelto && styles.segmentTextActive]}>
                    {secondi === 0 ? 'Nessuna' : `${secondi} s`}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <Text style={styles.hint}>
            {crossfade === 0
              ? 'I brani si susseguono senza pause: il successivo è già caricato quando finisce quello in ascolto.'
              : `Gli ultimi ${crossfade} secondi di un brano sfumano nei primi del successivo.`}
          </Text>

          <Text style={[styles.label, styles.labelSpaced]}>Qualità in streaming</Text>
          <View style={styles.segmented}>
            {QUALITA.map((q) => {
              const scelto = qualita === q;
              return (
                <Pressable
                  key={q}
                  onPress={() => setQualita(q)}
                  style={[styles.segment, scelto && styles.segmentActive]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: scelto }}
                >
                  <Text style={[styles.segmentText, scelto && styles.segmentTextActive]}>
                    {q === 'originale' ? 'Originale' : 'Risparmio'}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <Text style={styles.hint}>
            {qualita === 'originale'
              ? 'I brani arrivano come sono sul server: un FLAC di quattro minuti pesa circa 26 MB.'
              : 'FLAC e ALAC arrivano convertiti in AAC a 256 kbps, circa un quarto dei dati. MP3 e AAC restano come sono. La prima volta che ascolti un brano la conversione richiede qualche secondo. I brani scaricati non cambiano.'}
          </Text>
        </View>
      </View>

      {/* Dettagli audio nativi */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>AUDIO NATIVO MOBILE</Text>
        <View style={styles.card}>
          <Text style={styles.infoTitle}>Vantaggi rispetto alla versione Web:</Text>
          <Text style={styles.infoItem}>• Controllo del volume nativo e normalizzazione EBU R128 funzionante su iOS.</Text>
          <Text style={styles.infoItem}>• Riproduzione in background garantita dal sistema operativo.</Text>
          <Text style={styles.infoItem}>• Controlli multimediali su Lock Screen e cuffie Bluetooth.</Text>
          <Text style={styles.infoItem}>• Supporto streaming HTTP Range e transcodifica AAC.</Text>
        </View>
      </View>

      <View style={{ height: 100 }} />
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  content: {
    padding: theme.spacing.md,
    paddingBottom: 120,
  },
  navBar: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
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
  pageTitle: {
    fontSize: 32,
    fontWeight: '800',
    color: theme.colors.textPrimary,
    marginBottom: 20,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: theme.colors.textMuted,
    letterSpacing: 0.8,
    marginBottom: 8,
    marginLeft: 4,
  },
  card: {
    backgroundColor: theme.colors.card,
    borderRadius: theme.radii.md,
    padding: 16,
  },
  label: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    marginBottom: 8,
  },
  input: {
    backgroundColor: theme.colors.cardLight,
    borderRadius: theme.radii.sm,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: theme.colors.textPrimary,
    marginBottom: 14,
  },
  saveBtn: {
    backgroundColor: theme.colors.tint,
    borderRadius: theme.radii.sm,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 15,
  },
  statusBox: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    padding: 10,
    borderRadius: theme.radii.sm,
    gap: 8,
  },
  statusBoxOk: {
    backgroundColor: 'rgba(34, 197, 94, 0.12)',
  },
  statusBoxErr: {
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
  },
  statusText: {
    fontSize: 13,
    fontWeight: '500',
    flex: 1,
  },
  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.separator,
  },
  statLabel: {
    fontSize: 15,
    color: theme.colors.textSecondary,
  },
  statValue: {
    fontSize: 15,
    fontWeight: '600',
    color: theme.colors.textPrimary,
  },
  scanBtn: {
    marginTop: 16,
  },
  scanBtnBusy: {
    opacity: 0.8,
  },
  scanBusyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  scanEsito: {
    fontSize: 13,
    color: theme.colors.textSecondary,
    marginTop: 10,
    lineHeight: 18,
  },
  scanAvviso: {
    fontSize: 13,
    color: theme.colors.error,
    marginTop: 8,
    lineHeight: 18,
  },
  segmented: {
    flexDirection: 'row',
    backgroundColor: theme.colors.cardLight,
    borderRadius: theme.radii.sm,
    padding: 2,
  },
  segment: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: theme.radii.sm - 2,
  },
  segmentActive: {
    backgroundColor: theme.colors.tint,
  },
  segmentText: {
    fontSize: 14,
    fontWeight: '500',
    color: theme.colors.textSecondary,
  },
  segmentTextActive: {
    color: '#fff',
    fontWeight: '700',
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  switchLabel: {
    fontSize: 15,
    color: theme.colors.textPrimary,
  },
  hintAfterSwitch: {
    marginTop: 6,
  },
  labelSpaced: {
    marginTop: 20,
  },
  hint: {
    fontSize: 12,
    color: theme.colors.textMuted,
    lineHeight: 17,
    marginTop: 10,
  },
  infoTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.textPrimary,
    marginBottom: 8,
  },
  infoItem: {
    fontSize: 13,
    color: theme.colors.textSecondary,
    lineHeight: 20,
    marginBottom: 4,
  },
});
