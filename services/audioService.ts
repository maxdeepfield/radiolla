import { Platform } from 'react-native';
import { createAudioPlayer, setAudioModeAsync, AudioPlayer } from 'expo-audio';
import {
  setupTrackPlayer,
  playStream,
  stopStream,
  setTrackPlayerVolume,
  updateTrackMetadata,
  setTrackPlayerCallbacks,
  TrackPlayerServiceCallbacks,
} from './trackPlayerService';

export type AudioService = {
  play: (url: string, stationName: string) => Promise<void>;
  stop: () => Promise<void>;
  setVolume: (volume: number) => Promise<void>;
  setActiveForLockScreen: (
    active: boolean,
    metadata?: { title: string; artist: string }
  ) => Promise<void>;
  setCallbacks: (callbacks: TrackPlayerServiceCallbacks) => void;
  updateMetadata: (title: string, artist?: string) => Promise<void>;
};

// Web/Electron audio service using expo-audio
class ExpoAudioService implements AudioService {
  private player: AudioPlayer | null = null;
  private currentUrl: string | null = null;

  private teardownPlayer(): void {
    if (!this.player) return;
    try {
      this.player.pause();
    } catch {
      // ignore
    }
    try {
      this.player.remove();
    } catch {
      // ignore
    }
    this.player = null;
    this.currentUrl = null;
  }

  private ensurePlayer(url: string): AudioPlayer {
    if (!this.player || this.currentUrl !== url) {
      this.teardownPlayer();
      this.player = createAudioPlayer(url);
      this.currentUrl = url;
    }
    if (!this.player) {
      throw new Error('Failed to create audio player');
    }
    return this.player;
  }

  async play(url: string, _stationName: string): Promise<void> {
    try {
      const player = this.ensurePlayer(url);
      await player.play();
    } catch (error) {
      console.error('ExpoAudioService play failed:', error);
      throw error;
    }
  }

  async stop(): Promise<void> {
    try {
      const player = this.player;
      if (player) {
        await player.pause();
      }
      this.teardownPlayer();
    } catch (error) {
      console.error('ExpoAudioService stop failed:', error);
      this.teardownPlayer();
    }
  }

  async setVolume(volume: number): Promise<void> {
    const player = this.player;

    if (player) {
      try {
        player.volume = volume;
      } catch (error) {
        console.error('ExpoAudioService setVolume failed:', error);
      }
    }
  }

  async setActiveForLockScreen(
    _active: boolean,
    _metadata?: { title: string; artist: string }
  ): Promise<void> {
    // Not supported on web
  }

  setCallbacks(_callbacks: TrackPlayerServiceCallbacks): void {
    // Not needed on web
  }

  async updateMetadata(_title: string, _artist?: string): Promise<void> {
    // Not supported on web
  }
}

// Mobile audio service using react-native-track-player for proper background playback
class TrackPlayerAudioService implements AudioService {
  private isInitialized = false;
  private currentStationName: string | null = null;

  async play(url: string, stationName: string): Promise<void> {
    try {
      if (!this.isInitialized) {
        this.isInitialized = await setupTrackPlayer();
      }
      if (!this.isInitialized) {
        throw new Error('TrackPlayer not initialized');
      }
      this.currentStationName = stationName;
      await playStream(url, stationName, 'Radiolla');
    } catch (error) {
      console.error('TrackPlayerAudioService play failed:', error);
      throw error;
    }
  }

  async stop(): Promise<void> {
    try {
      await stopStream();
      this.currentStationName = null;
    } catch (error) {
      console.error('TrackPlayerAudioService stop failed:', error);
    }
  }

  async setVolume(volume: number): Promise<void> {
    try {
      await setTrackPlayerVolume(volume);
    } catch (error) {
      console.error('TrackPlayerAudioService setVolume failed:', error);
    }
  }

  async setActiveForLockScreen(
    _active: boolean,
    metadata?: { title: string; artist: string }
  ): Promise<void> {
    // TrackPlayer handles this automatically, but we can update metadata
    if (metadata) {
      await this.updateMetadata(metadata.title, metadata.artist);
    }
  }

  setCallbacks(callbacks: TrackPlayerServiceCallbacks): void {
    setTrackPlayerCallbacks(callbacks);
  }

  async updateMetadata(title: string, artist: string = 'Radiolla'): Promise<void> {
    try {
      await updateTrackMetadata(title, artist);
    } catch (error) {
      console.error('TrackPlayerAudioService updateMetadata failed:', error);
    }
  }
}

let sharedService: AudioService | null = null;

export function getAudioService(): AudioService {
  if (!sharedService) {
    // Use TrackPlayer on mobile for proper background playback and notification controls
    if (Platform.OS === 'android' || Platform.OS === 'ios') {
      sharedService = new TrackPlayerAudioService();
    } else {
      sharedService = new ExpoAudioService();
    }
  }
  return sharedService;
}

export async function initializeAudioMode(): Promise<void> {
  // Still set audio mode for expo-audio (used as fallback and for web)
  await setAudioModeAsync({
    playsInSilentMode: true,
    shouldPlayInBackground: true,
    interruptionMode: 'duckOthers',
    interruptionModeAndroid: 'duckOthers',
  });

  // Initialize TrackPlayer on mobile
  if (Platform.OS === 'android' || Platform.OS === 'ios') {
    await setupTrackPlayer();
  }
}
