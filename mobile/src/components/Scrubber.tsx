import React, { useRef, useState } from 'react';
import {
  PanResponder,
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

  const isDraggingRef = useRef(false);
  const dragTimeRef = useRef(0);
  const trackWidthRef = useRef(0);
  const initialTouchX = useRef(0);
  const initialTouchPageX = useRef(0);

  trackWidthRef.current = trackWidth;

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,

      onPanResponderGrant: (evt) => {
        const width = trackWidthRef.current;
        if (width <= 0) return;

        const touchX = Math.max(0, Math.min(width, evt.nativeEvent.locationX));
        const pct = touchX / width;
        const newSec = Math.max(0, Math.min(duration, pct * duration));

        isDraggingRef.current = true;
        dragTimeRef.current = newSec;
        initialTouchX.current = touchX;
        initialTouchPageX.current = evt.nativeEvent.pageX;

        setIsDragging(true);
        setDragTime(newSec);
        void Haptics.selectionAsync().catch(() => undefined);
      },

      onPanResponderMove: (evt) => {
        const width = trackWidthRef.current;
        if (!isDraggingRef.current || width <= 0) return;

        const deltaX = evt.nativeEvent.pageX - initialTouchPageX.current;
        const currentX = Math.max(0, Math.min(width, initialTouchX.current + deltaX));
        const pct = currentX / width;
        const newSec = Math.max(0, Math.min(duration, pct * duration));

        dragTimeRef.current = newSec;
        setDragTime(newSec);
      },

      onPanResponderRelease: () => {
        if (isDraggingRef.current) {
          const finalSec = dragTimeRef.current;
          isDraggingRef.current = false;
          setIsDragging(false);
          onSeek(finalSec);
          void Haptics.selectionAsync().catch(() => undefined);
        }
      },

      onPanResponderTerminate: () => {
        isDraggingRef.current = false;
        setIsDragging(false);
      },
    })
  ).current;

  const displayTime = isDragging ? dragTime : currentTime;
  const progressPct =
    duration > 0 ? Math.max(0, Math.min(1, displayTime / duration)) : 0;
  const knobSize = isDragging ? KNOB_ACTIVE_SIZE : KNOB_SIZE;

  return (
    <View style={styles.container}>
      {/* Area tattile allargata con PanResponder */}
      <View
        style={styles.touchArea}
        {...panResponder.panHandlers}
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
