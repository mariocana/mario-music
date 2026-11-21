/**
 * NomeDialog.tsx — il riquadro per scrivere un nome (rinominare una playlist).
 *
 * Non Alert.prompt: esiste solo su iOS. Stesso aspetto del modale "Nuova
 * playlist" di PlaylistsScreen. Se il salvataggio fallisce il riquadro resta
 * aperto con il motivo, così il nome scritto non va perso.
 */
import React, { useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { theme } from '../theme';

type Props = {
  visible: boolean;
  titolo: string;
  iniziale: string;
  conferma: string;
  onConferma: (nome: string) => Promise<void>;
  onAnnulla: () => void;
};

export const NomeDialog: React.FC<Props> = ({ visible, onAnnulla, ...resto }) => (
  <Modal visible={visible} transparent animationType="fade" onRequestClose={onAnnulla}>
    {/* Montato solo da aperto: a ogni apertura si riparte dal nome attuale, senza errori vecchi. */}
    {visible && <Contenuto onAnnulla={onAnnulla} {...resto} />}
  </Modal>
);

function Contenuto({ titolo, iniziale, conferma, onConferma, onAnnulla }: Omit<Props, 'visible'>) {
  const [nome, setNome] = useState(iniziale);
  const [salvo, setSalvo] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);

  const pulito = nome.trim();
  // Lo stesso nome di prima non è un cambiamento: niente richiesta inutile.
  const valido = pulito.length > 0 && pulito !== iniziale.trim();

  const salva = async () => {
    if (!valido || salvo) return;
    setSalvo(true);
    setErrore(null);
    try {
      await onConferma(pulito);
    } catch (err) {
      setErrore(err instanceof Error ? err.message : 'Salvataggio non riuscito');
    } finally {
      setSalvo(false);
    }
  };

  return (
    <View style={styles.overlay}>
      <View style={styles.dialog}>
        <Text style={styles.titolo}>{titolo}</Text>
        <TextInput
          style={styles.input}
          value={nome}
          onChangeText={setNome}
          placeholder="Nome della playlist"
          placeholderTextColor={theme.colors.textMuted}
          autoFocus
          selectTextOnFocus
          returnKeyType="done"
          onSubmitEditing={() => void salva()}
          accessibilityLabel="Nome della playlist"
        />
        {errore && <Text style={styles.errore}>{errore}</Text>}
        <View style={styles.azioni}>
          <Pressable style={[styles.btn, styles.btnAnnulla]} onPress={onAnnulla}>
            <Text style={styles.btnAnnullaTesto}>Annulla</Text>
          </Pressable>
          <Pressable
            style={[styles.btn, styles.btnConferma, !valido && styles.disattivo]}
            onPress={() => void salva()}
            disabled={!valido || salvo}
          >
            {salvo ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.btnConfermaTesto}>{conferma}</Text>
            )}
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  dialog: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: theme.colors.card,
    borderRadius: theme.radii.lg,
    padding: 20,
    borderWidth: 1,
    borderColor: theme.colors.separator,
  },
  titolo: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.colors.textPrimary,
    marginBottom: 16,
    textAlign: 'center',
  },
  input: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: theme.radii.sm,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: theme.colors.textPrimary,
    marginBottom: 16,
  },
  errore: {
    fontSize: 13,
    color: '#ef4444',
    marginTop: -8,
    marginBottom: 12,
  },
  azioni: {
    flexDirection: 'row',
    gap: 12,
  },
  btn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: theme.radii.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnAnnulla: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  btnAnnullaTesto: {
    color: theme.colors.textSecondary,
    fontWeight: '600',
    fontSize: 15,
  },
  btnConferma: {
    backgroundColor: theme.colors.tint,
  },
  btnConfermaTesto: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 15,
  },
  disattivo: {
    opacity: 0.5,
  },
});
