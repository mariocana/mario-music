import React, { useRef, useState } from 'react';
import {
  type GestureResponderEvent,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { theme } from '../theme';
import { formatTime } from '../types';

type Props = {
  currentTime: number;
  duration: number;
  onSeek: (seconds: number) => void;
};

const KNOB_SIZE = 14;
const KNOB_ACTIVE_SIZE = 18;

export const Scrubber: React.FC<Props> = ({ currentTime, duration, onSeek }) => {
  const [trackWidth, setTrackWidth] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [dragTime, setDragTime] = useState(0);

  // Lo stato del trascinamento in corso: lo leggono solo i gestori dei tocchi.
  const isDraggingRef = useRef(false);
  const dragTimeRef = useRef(0);
  const initialTouchX = useRef(0);
  const initialTouchPageX = useRef(0);

  /*
   * Gestori di tocco di View, non un PanResponder creato una volta sola:
   * quello si portava dietro duration e onSeek del primo render, e con la
   * schermata aperta su un brano nuovo il trascinamento calcolava la posizione
   * sulla durata del brano vecchio. Questi si ricreano a ogni render, quindi
   * vedono sempre i valori attuali.
   */
  const secondiA = (x: number) => {
    const pct = Math.max(0, Math.min(trackWidth, x)) / trackWidth;
    return Math.max(0, Math.min(duration, pct * duration));
  };

  const onResponderGrant = (evt: GestureResponderEvent) => {
    if (trackWidth <= 0) return;
    const touchX = Math.max(0, Math.min(trackWidth, evt.nativeEvent.locationX));
    const newSec = secondiA(touchX);

    isDraggingRef.current = true;
    dragTimeRef.current = newSec;
    initialTouchX.current = touchX;
    initialTouchPageX.current = evt.nativeEvent.pageX;

    setIsDragging(true);
    setDragTime(newSec);
    void Haptics.selectionAsync().catch(() => undefined);
  };

  const onResponderMove = (evt: GestureResponderEvent) => {
    if (!isDraggingRef.current || trackWidth <= 0) return;
    // Dalla posizione di partenza più lo spostamento sulla pagina: locationX
    // durante il movimento è relativa alla View sotto il dito, che può cambiare.
    const deltaX = evt.nativeEvent.pageX - initialTouchPageX.current;
    const newSec = secondiA(initialTouchX.current + deltaX);
    dragTimeRef.current = newSec;
    setDragTime(newSec);
  };

  const onResponderRelease = () => {
    if (!isDraggingRef.current) return;
    isDraggingRef.current = false;
    setIsDragging(false);
    onSeek(dragTimeRef.current);
    void Haptics.selectionAsync().catch(() => undefined);
  };

  const onResponderTerminate = () => {
    isDraggingRef.current = false;
    setIsDragging(false);
  };

  const displayTime = isDragging ? dragTime : currentTime;
  const progressPct =
    duration > 0 ? Math.max(0, Math.min(1, displayTime / duration)) : 0;
  const knobSize = isDragging ? KNOB_ACTIVE_SIZE : KNOB_SIZE;

  return (
    <View style={styles.container}>
      {/* Area tattile allargata: i tocchi li gestisce questa View */}
      <View
        style={styles.touchArea}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderGrant={onResponderGrant}
        onResponderMove={onResponderMove}
        onResponderRelease={onResponderRelease}
        onResponderTerminate={onResponderTerminate}
        onLayout={(e) => setTrackWidth(e.nativeEvent.layout.width)}
      >
        {/* Barra di sfondo */}
        <View style={styles.track}>
          {/* Barra riempita */}
          <View style={[styles.fill, { width: `${progressPct * 100}%` }]} />
        </View>

        {/* Pallino (Knob) per trascinare col dito */}
        <View
          style={[
            styles.knob,
            {
              width: knobSize,
              height: knobSize,
              borderRadius: knobSize / 2,
              left: `${progressPct * 100}%`,
              transform: [{ translateX: -knobSize / 2 }, { translateY: -knobSize / 2 }],
            },
            isDragging && styles.knobActive,
          ]}
        />
      </View>

      {/* Riga dei tempi: tempo trascorso e tempo rimanente */}
      <View style={styles.timeRow}>
        <Text style={styles.timeText}>{formatTime(displayTime)}</Text>
        <Text style={styles.timeText}>
          {duration > displayTime
            ? `-${formatTime(Math.max(0, duration - displayTime))}`
            : '0:00'}
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginVertical: 12,
  },
  touchArea: {
    height: 36,
    justifyContent: 'center',
    position: 'relative',
  },
  track: {
    height: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    backgroundColor: '#ffffff',
    borderRadius: 2,
  },
  knob: {
    position: 'absolute',
    top: '50%',
    backgroundColor: '#ffffff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.45,
    shadowRadius: 4,
    elevation: 6,
  },
  knobActive: {
    backgroundColor: '#ffffff',
    shadowOpacity: 0.6,
    shadowRadius: 6,
  },
  timeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  timeText: {
    fontSize: 12,
    color: theme.colors.textMuted,
    fontVariant: ['tabular-nums'],
    fontWeight: '500',
  },
});
