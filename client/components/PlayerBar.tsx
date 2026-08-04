import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { useSettings } from '../context/SettingsContext';
import { useAudio } from '../context/AudioContext';
import { VolumeSlider } from './VolumeSlider';
import { SeekBar } from './SeekBar';

type PlayerBarProps = {
  showVolumeSlider: boolean;
  onVolumeToggle: () => void;
  bottomInset: number;
};

export function PlayerBar({
  showVolumeSlider,
  onVolumeToggle,
  bottomInset,
}: PlayerBarProps) {
  const { styles } = useSettings();
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

  return (
    <View style={[styles.bottomBar, { paddingBottom: bottomInset + 8 }]}>
      <View style={styles.nowPlayingInfo}>
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
      <View style={styles.bottomControls}>
        {showVolumeSlider && (
          <VolumeSlider volume={volume} onVolumeChange={setVolume} />
        )}
        <TouchableOpacity
          onPress={onVolumeToggle}
          style={[styles.button, styles.secondaryButton, styles.volumeButton]}
        >
          <Text style={styles.volumeIcon}>🔊</Text>
        </TouchableOpacity>
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
    </View>
  );
}
