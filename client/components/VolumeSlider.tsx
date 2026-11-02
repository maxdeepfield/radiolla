import React from 'react';
import { View } from 'react-native';
import { useSettings } from '../context/SettingsContext';

type VolumeSliderProps = {
  volume: number;
  onVolumeChange: (volume: number) => void;
};

export function VolumeSlider({ volume, onVolumeChange }: VolumeSliderProps) {
  const { styles } = useSettings();
  const trackWidthRef = React.useRef(80);

  const handleVolumeGesture = (event: any) => {
    const { locationX } = event.nativeEvent;
    const trackWidth = trackWidthRef.current || 80;
    const normalized = locationX / trackWidth;
    const clamped = Math.max(0, Math.min(1, normalized));
    onVolumeChange(clamped);
  };

  return (
    <View style={styles.volumeContainerHorizontal}>
      <View
        style={styles.volumeTrackHorizontal}
        onLayout={(e) => {
          trackWidthRef.current = e.nativeEvent.layout.width;
        }}
        onStartShouldSetResponder={() => true}
        onResponderGrant={handleVolumeGesture}
        onResponderMove={handleVolumeGesture}
        onResponderRelease={handleVolumeGesture}
      >
        <View
          style={[styles.volumeFillHorizontal, { width: `${volume * 100}%` }]}
        />
        <View style={[styles.volumeThumbHorizontal, { left: `${volume * 100}%` }]} />
      </View>
    </View>
  );
}
