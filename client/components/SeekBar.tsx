import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { useSettings } from '../context/SettingsContext';

type SeekBarProps = {
  position: number;
  duration: number;
  onSeek: (position: number) => void;
};

function formatTime(seconds: number): string {
  const safeSeconds = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
  const minutes = Math.floor(safeSeconds / 60);
  const remainder = Math.floor(safeSeconds % 60);
  return `${minutes}:${remainder.toString().padStart(2, '0')}`;
}

export function SeekBar({ position, duration, onSeek }: SeekBarProps) {
  const { styles } = useSettings();
  const [trackWidth, setTrackWidth] = useState(1);
  const progress =
    duration > 0 ? Math.max(0, Math.min(1, position / duration)) : 0;

  const handleGesture = (event: any) => {
    if (duration <= 0) return;
    const fraction = Math.max(
      0,
      Math.min(1, event.nativeEvent.locationX / trackWidth)
    );
    onSeek(fraction * duration);
  };

  return (
    <View style={styles.seekRow}>
      <Text style={styles.seekTime}>{formatTime(position)}</Text>
      <View
        style={styles.seekTrack}
        onLayout={event => setTrackWidth(event.nativeEvent.layout.width || 1)}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderGrant={handleGesture}
        onResponderMove={handleGesture}
        onResponderRelease={handleGesture}
        accessibilityRole="adjustable"
        accessibilityLabel="Playback position"
        accessibilityValue={{ min: 0, max: duration, now: position }}
      >
        <View style={[styles.seekFill, { width: `${progress * 100}%` }]} />
        <View style={[styles.seekThumb, { left: `${progress * 100}%` }]} />
      </View>
      <Text style={styles.seekTime}>{formatTime(duration)}</Text>
    </View>
  );
}
