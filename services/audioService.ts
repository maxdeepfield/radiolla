import { Platform } from 'react-native';
import { createAudioPlayer, setAudioModeAsync, AudioPlayer } from 'expo-audio';
import {
  setupTrackPlayer,
  playStream,
  stopStream,
  pauseStream,
  resumeStream,
  seekTrackPlayerTo,
  getTrackPlayerProgress,
  setTrackPlayerVolume,
  setTrackPlayerCallbacks,
  TrackPlayerServiceCallbacks,
} from './trackPlayerService';

export type AudioService = {
  play: (url: string, stationName: string, isFile?: boolean) => Promise<void>;
  pause: () => Promise<void>;
  resume: () => Promise<void>;
  stop: () => Promise<void>;
  seekTo: (position: number) => Promise<void>;
  getProgress: () => Promise<{ position: number; duration: number }>;
  setVolume: (volume: number) => Promise<void>;
  setCallbacks: (callbacks: TrackPlayerServiceCallbacks) => void;
};

// Web/Electron audio service using expo-audio as requested
class ExpoAudioService implements AudioService {
  private player: AudioPlayer | null = null;
  private currentUrl: string | null = null;
  private volume = 1;
  private isFile = false;
  private didFinish = false;
  private callbacks: TrackPlayerServiceCallbacks = {};

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
      this.player.volume = this.volume;
      this.currentUrl = url;
    }
    if (!this.player) {
      throw new Error('Failed to create audio player');
    }
    return this.player;
  }

  async play(
    url: string,
    _stationName: string,
    isFile: boolean = false
  ): Promise<void> {
    try {
      this.isFile = isFile;
      this.didFinish = false;
      const player = this.ensurePlayer(url);
      player.play();
    } catch (error) {
      // Ignore "play interrupted by pause" - this is normal when fast-clicking
      const isInterruptedError =
        error instanceof DOMException &&
        (error.name === 'AbortError' || error.message.includes('interrupted'));

      if (!isInterruptedError) {
        console.error('ExpoAudioService play failed:', error);
        throw error;
      }
    }
  }

  async pause(): Promise<void> {
    this.player?.pause();
  }

  async resume(): Promise<void> {
    this.player?.play();
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

  async seekTo(position: number): Promise<void> {
    if (this.player) {
      await this.player.seekTo(Math.max(0, position));
    }
  }

  async getProgress(): Promise<{ position: number; duration: number }> {
    const player = this.player;
    if (!player) return { position: 0, duration: 0 };

    const position = Number.isFinite(player.currentTime)
      ? player.currentTime
      : 0;
    const duration = Number.isFinite(player.duration) ? player.duration : 0;
    if (
      this.isFile &&
      !this.didFinish &&
      duration > 0 &&
      position >= duration - 0.2 &&
      !player.playing
    ) {
      this.didFinish = true;
      this.callbacks.onEnded?.();
    }
    return { position, duration };
  }

  async setVolume(volume: number): Promise<void> {
    this.volume = Math.max(0, Math.min(1, volume));
    const player = this.player;

    if (player) {
      try {
        player.volume = this.volume;
      } catch (error) {
        console.error('ExpoAudioService setVolume failed:', error);
      }
    }
  }

  setCallbacks(callbacks: TrackPlayerServiceCallbacks): void {
    this.callbacks = callbacks;
  }
}

// Mobile audio service using react-native-track-player for proper background playback
class TrackPlayerAudioService implements AudioService {
  private isInitialized = false;
  private volume = 1;

  async play(
    url: string,
    stationName: string,
    isFile: boolean = false
  ): Promise<void> {
    try {
      if (!this.isInitialized) {
        await setupTrackPlayer();
        this.isInitialized = true;
      }
      if (!this.isInitialized) {
        throw new Error('TrackPlayer not initialized');
      }
      await setTrackPlayerVolume(this.volume);
      await playStream(url, stationName, 'Radiolla', !isFile);
      await setTrackPlayerVolume(this.volume);
    } catch (error) {
      console.error('TrackPlayerAudioService play failed:', error);
      throw error;
    }
  }

  async pause(): Promise<void> {
    await pauseStream();
  }

  async resume(): Promise<void> {
    await resumeStream();
  }

  async stop(): Promise<void> {
    try {
      await stopStream();
    } catch (error) {
      console.error('TrackPlayerAudioService stop failed:', error);
    }
  }

  async seekTo(position: number): Promise<void> {
    await seekTrackPlayerTo(position);
  }

  async getProgress(): Promise<{ position: number; duration: number }> {
    return getTrackPlayerProgress();
  }

  async setVolume(volume: number): Promise<void> {
    this.volume = Math.max(0, Math.min(1, volume));
    try {
      await setTrackPlayerVolume(this.volume);
    } catch (error) {
      console.error('TrackPlayerAudioService setVolume failed:', error);
    }
  }

  setCallbacks(callbacks: TrackPlayerServiceCallbacks): void {
    setTrackPlayerCallbacks(callbacks);
  }
}

let sharedService: AudioService | null = null;

export function getAudioService(): AudioService {
  if (!sharedService) {
    if (Platform.OS === 'web') {
      sharedService = new ExpoAudioService();
    } else {
      sharedService = new TrackPlayerAudioService();
    }
  }
  return sharedService;
}

export async function initializeAudioMode(): Promise<void> {
  // Still set audio mode for expo-audio (especially needed for web)
  try {
    await setAudioModeAsync({
      playsInSilentMode: true,
      shouldPlayInBackground: true,
    });
  } catch {
    // Ignore audio mode errors
  }

  // Initialize TrackPlayer only on mobile
  if (Platform.OS !== 'web') {
    await setupTrackPlayer();
  }
}
