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
import { loadLastStation } from './playbackPreferences';

type AudioCommonMetadata = {
  title?: string;
  description?: string;
  subtitle?: string;
};

type AudioMetadata = AudioCommonMetadata & {
  raw?: {
    commonKey?: string;
    key?: string;
    value?: unknown;
  }[];
};

export type TrackPlayerServiceCallbacks = {
  onPlay?: () => void;
  onPause?: () => void;
  onStop?: () => void;
  onNext?: () => void;
  onPrevious?: () => void;
  onMetadata?: (title: string) => void;
  onPlaybackState?: (state: State) => void;
  onAudioFocusChange?: (event: RemoteDuckEvent) => void;
};

let serviceCallbacks: TrackPlayerServiceCallbacks = {};
let metadataListenersRegistered = false;
let playbackStateListenersRegistered = false;

export function setTrackPlayerCallbacks(
  callbacks: TrackPlayerServiceCallbacks
) {
  serviceCallbacks = callbacks;
}

async function playActiveOrPersistedStation(): Promise<void> {
  const activeTrackIndex = await TrackPlayer.getActiveTrackIndex().catch(
    () => undefined
  );

  if (activeTrackIndex !== undefined) {
    await TrackPlayer.play();
    return;
  }

  const station = await loadLastStation();
  if (!station) return;

  await TrackPlayer.reset();
  await TrackPlayer.add({
    id: 'current-stream',
    url: station.url,
    title: station.name,
    artist: 'Radiolla',
    isLiveStream: true,
  });
  await TrackPlayer.play();
}

function emitPlaybackState(state: State) {
  serviceCallbacks.onPlaybackState?.(state);
}

function emitAudioFocusChange(event: RemoteDuckEvent) {
  serviceCallbacks.onAudioFocusChange?.(event);
}

// Playback service - handles remote events (notification controls, lock screen, etc.)
export async function PlaybackService() {
  registerPlaybackStateListeners();

  TrackPlayer.addEventListener(Event.RemotePlay, () => {
    if (serviceCallbacks.onPlay) {
      serviceCallbacks.onPlay();
      return;
    }

    playActiveOrPersistedStation().catch(error => {
      console.error('RemotePlay failed:', error);
    });
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

  TrackPlayer.addEventListener(
    Event.RemoteDuck,
    async (event: RemoteDuckEvent) => {
      emitAudioFocusChange(event);

      if (event.permanent) {
        await TrackPlayer.stop();
        emitPlaybackState(State.Stopped);
      } else if (event.paused) {
        await TrackPlayer.pause();
        emitPlaybackState(State.Paused);
      }
    }
  );
}

let isSetup = false;

function isNoCurrentItemError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.toLowerCase().includes('no current item');
}

function isAlreadyInitializedError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.toLowerCase().includes('already been initialized');
}

function cleanMetadataValue(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const cleaned = value.replace(/\0+$/, '').trim();
  return cleaned.length > 0 ? cleaned : null;
}

function parseStreamTitle(value: string): string | null {
  const match = value.match(/StreamTitle='([^']*)'/i);
  return cleanMetadataValue(match ? match[1] : value);
}

function getCommonMetadataTitle(
  metadata: AudioCommonMetadata | undefined
): string | null {
  if (!metadata) return null;
  return (
    cleanMetadataValue(metadata.title) ||
    cleanMetadataValue(metadata.description) ||
    cleanMetadataValue(metadata.subtitle)
  );
}

function getTimedMetadataTitle(metadata: AudioMetadata[]): string | null {
  for (const item of metadata) {
    const commonTitle = getCommonMetadataTitle(item);
    if (commonTitle) return commonTitle;

    for (const rawEntry of item.raw ?? []) {
      const key =
        `${rawEntry.commonKey ?? ''} ${rawEntry.key ?? ''}`.toLowerCase();
      const value = cleanMetadataValue(rawEntry.value);
      if (!value) continue;

      if (key.includes('streamtitle')) {
        return parseStreamTitle(value);
      }
      if (key.includes('title')) {
        return cleanMetadataValue(value);
      }
    }
  }

  for (const item of metadata) {
    for (const rawEntry of item.raw ?? []) {
      const value = cleanMetadataValue(rawEntry.value);
      if (value?.includes("StreamTitle='")) {
        return parseStreamTitle(value);
      }
    }
  }

  return null;
}

function emitMetadataTitle(title: string | null) {
  if (title) {
    serviceCallbacks.onMetadata?.(title);
  }
}

function registerPlaybackStateListeners() {
  if (playbackStateListenersRegistered) return;

  TrackPlayer.addEventListener(Event.PlaybackState, event => {
    emitPlaybackState(event.state);
  });

  TrackPlayer.addEventListener(Event.PlaybackError, () => {
    emitPlaybackState(State.Error);
  });

  playbackStateListenersRegistered = true;
}

function registerMetadataListeners() {
  if (metadataListenersRegistered) return;

  TrackPlayer.addEventListener(Event.MetadataCommonReceived, event => {
    emitMetadataTitle(getCommonMetadataTitle(event.metadata));
  });

  TrackPlayer.addEventListener(Event.MetadataTimedReceived, event => {
    emitMetadataTitle(getTimedMetadataTitle(event.metadata));
  });

  TrackPlayer.addEventListener(Event.MetadataChapterReceived, event => {
    emitMetadataTitle(getTimedMetadataTitle(event.metadata));
  });

  metadataListenersRegistered = true;
}

export async function setupTrackPlayer(): Promise<void> {
  if (Platform.OS === 'web') return; // Guard against Web execution
  if (isSetup) {
    registerMetadataListeners();
    registerPlaybackStateListeners();
    return;
  }

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
      notificationCapabilities: [
        Capability.Play,
        Capability.Pause,
        Capability.Stop,
        Capability.SkipToNext,
        Capability.SkipToPrevious,
      ],
    });

    await TrackPlayer.setRepeatMode(RepeatMode.Off);
    registerMetadataListeners();
    registerPlaybackStateListeners();
    isSetup = true;
  } catch (error) {
    if (isAlreadyInitializedError(error)) {
      registerMetadataListeners();
      registerPlaybackStateListeners();
      isSetup = true;
      return;
    }
    console.error('Failed to setup TrackPlayer:', error);
  }
}

export async function playStream(
  url: string,
  title: string,
  artist: string = 'Radiolla'
): Promise<void> {
  if (Platform.OS === 'web') return; // Guard against Web execution

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
  if (Platform.OS === 'web') return; // Guard against Web execution

  try {
    await TrackPlayer.stop();
    await TrackPlayer.reset();
  } catch (error) {
    console.error('TrackPlayer stopStream failed:', error);
  }
}

export async function pauseStream(): Promise<void> {
  if (Platform.OS === 'web') return; // Guard against Web execution

  try {
    await TrackPlayer.pause();
  } catch (error) {
    console.error('TrackPlayer pauseStream failed:', error);
  }
}

export async function resumeStream(): Promise<void> {
  if (Platform.OS === 'web') return; // Guard against Web execution

  try {
    await TrackPlayer.play();
  } catch (error) {
    console.error('TrackPlayer resumeStream failed:', error);
  }
}

export async function setTrackPlayerVolume(volume: number): Promise<void> {
  if (Platform.OS === 'web') return; // Guard against Web execution

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
  if (Platform.OS === 'web') return; // Guard against Web execution

  try {
    const activeTrackIndex = await TrackPlayer.getActiveTrackIndex();
    if (activeTrackIndex === undefined) return;

    await TrackPlayer.updateNowPlayingMetadata({
      title,
      artist,
    });
  } catch (error) {
    if (isNoCurrentItemError(error)) return;
    console.error('TrackPlayer updateMetadata failed:', error);
  }
}

export async function getPlayerState(): Promise<State | null> {
  if (Platform.OS === 'web') return null; // Guard against Web execution

  try {
    return await TrackPlayer.getPlaybackState().then(
      (state: PlaybackState) => state.state
    );
  } catch {
    return null;
  }
}

export { State as TrackPlayerState };
