import TrackPlayer, {
  Event,
  State,
  Capability,
  AppKilledPlaybackBehavior,
  RepeatMode,
  RemoteDuckEvent,
  PlaybackState,
} from 'react-native-track-player';
import { Platform } from 'react-native';

export type TrackPlayerServiceCallbacks = {
  onPlay?: () => void;
  onPause?: () => void;
  onStop?: () => void;
  onNext?: () => void;
  onPrevious?: () => void;
};

let serviceCallbacks: TrackPlayerServiceCallbacks = {};

export function setTrackPlayerCallbacks(callbacks: TrackPlayerServiceCallbacks) {
  serviceCallbacks = callbacks;
}

// Playback service - handles remote events (notification controls, lock screen, etc.)
export async function PlaybackService() {
  TrackPlayer.addEventListener(Event.RemotePlay, () => {
    TrackPlayer.play();
    serviceCallbacks.onPlay?.();
  });

  TrackPlayer.addEventListener(Event.RemotePause, () => {
    TrackPlayer.pause();
    serviceCallbacks.onPause?.();
  });

  TrackPlayer.addEventListener(Event.RemoteStop, () => {
    TrackPlayer.stop();
    serviceCallbacks.onStop?.();
  });

  TrackPlayer.addEventListener(Event.RemoteNext, () => {
    serviceCallbacks.onNext?.();
  });

  TrackPlayer.addEventListener(Event.RemotePrevious, () => {
    serviceCallbacks.onPrevious?.();
  });

  TrackPlayer.addEventListener(Event.RemoteDuck, async (event: RemoteDuckEvent) => {
    if (event.paused) {
      await TrackPlayer.pause();
    } else if (event.permanent) {
      await TrackPlayer.stop();
    } else {
      await TrackPlayer.setVolume(event.ducking ? 0.3 : 1);
    }
  });
}

let isSetup = false;

export async function setupTrackPlayer(): Promise<boolean> {
  if (isSetup) return true;
  if (Platform.OS === 'web') return false;

  try {
    await TrackPlayer.setupPlayer({
      autoHandleInterruptions: true,
    });

    await TrackPlayer.updateOptions({
      android: {
        appKilledPlaybackBehavior: AppKilledPlaybackBehavior.ContinuePlayback,
      },
      capabilities: [
        Capability.Play,
        Capability.Pause,
        Capability.Stop,
        Capability.SkipToNext,
        Capability.SkipToPrevious,
      ],
      compactCapabilities: [
        Capability.Play,
        Capability.Pause,
        Capability.Stop,
      ],
      notificationCapabilities: [
        Capability.Play,
        Capability.Pause,
        Capability.Stop,
        Capability.SkipToNext,
        Capability.SkipToPrevious,
      ],
    });

    await TrackPlayer.setRepeatMode(RepeatMode.Off);
    isSetup = true;
    return true;
  } catch (error) {
    console.error('Failed to setup TrackPlayer:', error);
    return false;
  }
}

export async function playStream(
  url: string,
  title: string,
  artist: string = 'Radiolla'
): Promise<void> {
  if (Platform.OS === 'web') return;

  try {
    await TrackPlayer.reset();
    await TrackPlayer.add({
      id: 'current-stream',
      url,
      title,
      artist,
      isLiveStream: true,
    });
    await TrackPlayer.play();
  } catch (error) {
    console.error('TrackPlayer playStream failed:', error);
    throw error;
  }
}

export async function stopStream(): Promise<void> {
  if (Platform.OS === 'web') return;

  try {
    await TrackPlayer.stop();
    await TrackPlayer.reset();
  } catch (error) {
    console.error('TrackPlayer stopStream failed:', error);
  }
}

export async function pauseStream(): Promise<void> {
  if (Platform.OS === 'web') return;

  try {
    await TrackPlayer.pause();
  } catch (error) {
    console.error('TrackPlayer pauseStream failed:', error);
  }
}

export async function resumeStream(): Promise<void> {
  if (Platform.OS === 'web') return;

  try {
    await TrackPlayer.play();
  } catch (error) {
    console.error('TrackPlayer resumeStream failed:', error);
  }
}

export async function setTrackPlayerVolume(volume: number): Promise<void> {
  if (Platform.OS === 'web') return;

  try {
    await TrackPlayer.setVolume(volume);
  } catch (error) {
    console.error('TrackPlayer setVolume failed:', error);
  }
}

export async function updateTrackMetadata(
  title: string,
  artist: string = 'Radiolla'
): Promise<void> {
  if (Platform.OS === 'web') return;

  try {
    await TrackPlayer.updateNowPlayingMetadata({
      title,
      artist,
    });
  } catch (error) {
    console.error('TrackPlayer updateMetadata failed:', error);
  }
}

export async function getPlayerState(): Promise<State | null> {
  if (Platform.OS === 'web') return null;

  try {
    return await TrackPlayer.getPlaybackState().then((state: PlaybackState) => state.state);
  } catch {
    return null;
  }
}

export { State as TrackPlayerState };
