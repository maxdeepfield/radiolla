import React, { useRef } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { useSettings } from '../context/SettingsContext';
import { useAudio } from '../context/AudioContext';
import { SeekBar } from './SeekBar';

type PlayerBarProps = {
  bottomInset: number;
};

export function PlayerBar({ bottomInset }: PlayerBarProps) {
  const { styles, palette } = useSettings();
  const {
    currentStation,
    playbackState,
    nowPlayingTrack,
    streamError,
    volume,
    position,
    duration,
    setVolume,
    seekTo,
    handlePrimaryControl,
  } = useAudio();

  const trackWidthRef = useRef(0);

  let statusLabel = 'Ready';
  if (playbackState === 'loading') {
    statusLabel = nowPlayingTrack || 'Buffering...';
  } else if (playbackState === 'playing') {
    statusLabel =
      currentStation?.type === 'file'
        ? 'Playing local audio'
        : nowPlayingTrack || 'Streaming';
  } else if (playbackState === 'paused') {
    statusLabel = 'Paused';
  } else if (currentStation) {
    statusLabel = streamError ? `Stopped · ${streamError}` : 'Stopped';
  }

  const controlIcon =
    playbackState === 'playing' && currentStation?.type === 'file'
      ? 'Ⅱ'
      : playbackState === 'playing' || playbackState === 'loading'
        ? '■'
        : '▶';

  const handleVolumeGesture = (event: any) => {
    const { locationX } = event.nativeEvent;
    const trackWidth = trackWidthRef.current || 1;
    const normalized = locationX / trackWidth;
    const clamped = Math.max(0, Math.min(1, normalized));
    setVolume(clamped);
  };

  return (
    <View style={[styles.bottomBar, { paddingBottom: bottomInset + 8 }]}>
      <View
        style={styles.nowPlayingInfo}
        onLayout={(e) => {
          trackWidthRef.current = e.nativeEvent.layout.width;
        }}
        onStartShouldSetResponder={() => true}
        onResponderGrant={handleVolumeGesture}
        onResponderMove={handleVolumeGesture}
        onResponderRelease={handleVolumeGesture}
      >
        <View
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            bottom: 0,
            width: `${volume * 100}%`,
            backgroundColor: palette.accentStrong + '33',
          }}
        />
        <Text
          style={styles.nowPlayingTitle}
          numberOfLines={1}
          ellipsizeMode="tail"
        >
          {currentStation ? currentStation.name : 'No station selected'}
        </Text>
        <Text
          style={styles.nowPlayingSubtitle}
          numberOfLines={1}
          ellipsizeMode="tail"
        >
          {statusLabel}
        </Text>
        {currentStation?.type === 'file' && (
          <SeekBar position={position} duration={duration} onSeek={seekTo} />
        )}
      </View>
      <TouchableOpacity
        onPress={handlePrimaryControl}
        disabled={!currentStation}
        style={[
          styles.button,
          playbackState === 'playing' || playbackState === 'loading'
            ? styles.secondaryButton
            : styles.primaryButton,
          styles.controlButton,
          !currentStation && styles.disabledButton,
        ]}
        accessibilityLabel={
          playbackState === 'playing' && currentStation?.type === 'file'
            ? 'Pause'
            : playbackState === 'playing' || playbackState === 'loading'
              ? 'Stop'
              : 'Play'
        }
      >
        <Text style={styles.controlIcon}>{controlIcon}</Text>
      </TouchableOpacity>
    </View>
  );
}
