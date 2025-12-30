import React from 'react';
import { View } from 'react-native';
import { useSettings } from '../context/SettingsContext';

const VOLUME_TRACK_HEIGHT = 160;

type VolumeSliderProps = {
  volume: number;
  onVolumeChange: (volume: number) => void;
};

export function VolumeSlider({ volume, onVolumeChange }: VolumeSliderProps) {
  const { styles } = useSettings();

  const handleVolumeGesture = (event: any) => {
    const { locationY } = event.nativeEvent;
    const normalized = 1 - locationY / VOLUME_TRACK_HEIGHT;
    const clamped = Math.max(0, Math.min(1, normalized));
    onVolumeChange(clamped);
  };

  return (
    <View style={styles.volumePopover}>
      <View
        style={styles.volumeTrackVertical}
        onStartShouldSetResponder={() => true}
        onResponderGrant={handleVolumeGesture}
        onResponderMove={handleVolumeGesture}
        onResponderRelease={handleVolumeGesture}
      >
        <View
          style={[styles.volumeFillVertical, { height: `${volume * 100}%` }]}
        />
        <View style={[styles.volumeThumb, { bottom: `${volume * 100}%` }]} />
      </View>
    </View>
  );
}
