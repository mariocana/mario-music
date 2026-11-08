import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../api';
import { getServerUrlSync, setServerUrl } from '../config';
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
          </View>
        </View>
      )}

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
