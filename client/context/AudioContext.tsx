import React, {
  createContext,
  useContext,
  useState,
  useRef,
  useEffect,
  ReactNode,
} from 'react';
import { Platform } from 'react-native';
import {
  getAudioService,
  initializeAudioMode,
  AudioService,
} from '../../services/audioService';
import {
  addBluetoothAudioConnectedListener,
  isBluetoothAutoPlayAvailable,
  startBluetoothAutoPlayListener,
} from '../../services/bluetoothAutoPlay';
import {
  initializeNotifications,
  showPlaybackNotification,
  hidePlaybackNotification,
} from '../../services/notificationService';
import {
  loadLastStation,
  saveLastStation,
  PersistedStation,
} from '../../services/playbackPreferences';
import { TrackPlayerState } from '../../services/trackPlayerService';
import { useSettings } from './SettingsContext';

export type Station = {
  id: string;
  name: string;
  url: string;
};

export type PlaybackState = 'idle' | 'loading' | 'playing' | 'suspended';

// Electron IPC types
interface ElectronIPCRenderer {
  send?: (channel: string, ...args: unknown[]) => void;
  on?: (channel: string, listener: (...args: unknown[]) => void) => void;
  removeListener?: (
    channel: string,
    listener: (...args: unknown[]) => void
  ) => void;
  invoke?: (channel: string, ...args: unknown[]) => Promise<unknown>;
}

interface ElectronWindow extends Window {
  ipcRenderer?: ElectronIPCRenderer;
}

let ipcRenderer: ElectronIPCRenderer | null = null;
if (Platform.OS === 'web') {
  ipcRenderer = (window as ElectronWindow).ipcRenderer || null;
}

type AudioContextType = {
  currentStation: Station | null;
  lastStation: Station | null;
  playbackState: PlaybackState;
  nowPlayingTrack: string | null;
  streamError: string | null;
  volume: number;
  playStation: (station: Station) => Promise<void>;
  stopPlayback: () => Promise<void>;
  setVolume: (vol: number) => Promise<void>;
  handlePrimaryControl: () => void;
  audioServiceRef: React.MutableRefObject<AudioService | null>;
};

const AudioContext = createContext<AudioContextType | null>(null);

function resolvePersistedStation(
  station: PersistedStation | null,
  stations: Station[]
): Station | null {
  if (!station) return null;
  const savedStation =
    stations.find(item => item.id === station.id) ||
    stations.find(item => item.url === station.url);

  return savedStation || station;
}

export function AudioProvider({
  children,
  stations,
}: {
  children: ReactNode;
  stations: Station[];
}) {
  const { autoPlayOnBluetooth } = useSettings();
  const [currentStation, setCurrentStation] = useState<Station | null>(null);
  const [lastStation, setLastStation] = useState<Station | null>(null);
  const [playbackState, setPlaybackState] = useState<PlaybackState>('idle');
  const [nowPlayingTrack, setNowPlayingTrack] = useState<string | null>(null);
  const [streamError, setStreamError] = useState<string | null>(null);
  const [volume, setVolumeState] = useState(1.0);

  const audioServiceRef = useRef<AudioService | null>(null);
  const metadataIntervalRef = useRef<ReturnType<typeof setInterval> | null>(
    null
  );
  const playStationRef = useRef<(station: Station) => void>(() => {});
  const stopPlaybackRef = useRef<() => Promise<void>>(async () => undefined);
  const primaryControlRef = useRef<() => void>(() => {});
  const trayPlayRef = useRef<() => void>(() => {});
  const currentStationRef = useRef<Station | null>(null);
  const lastStationRef = useRef<Station | null>(null);
  const playbackStateRef = useRef<PlaybackState>('idle');
  const stationsRef = useRef<Station[]>(stations);
  const autoPlayOnBluetoothRef = useRef(autoPlayOnBluetooth);
  const bluetoothAutoPlayTriggeredAtRef = useRef(0);

  // Track current play operation to prevent race conditions
  const playOperationIdRef = useRef<number>(0);
  const isPlayingRef = useRef<boolean>(false);
  const isStartingPlaybackRef = useRef<boolean>(false);
  const temporaryInterruptionActiveRef = useRef<boolean>(false);
  const resumeAfterTemporaryInterruptionRef = useRef<boolean>(false);

  const setPlaybackStateSynced = (nextState: PlaybackState) => {
    playbackStateRef.current = nextState;
    setPlaybackState(nextState);
  };

  useEffect(() => {
    currentStationRef.current = currentStation;
  }, [currentStation]);

  useEffect(() => {
    lastStationRef.current = lastStation;
  }, [lastStation]);

  useEffect(() => {
    playbackStateRef.current = playbackState;
  }, [playbackState]);

  useEffect(() => {
    stationsRef.current = stations;
  }, [stations]);

  useEffect(() => {
    autoPlayOnBluetoothRef.current = autoPlayOnBluetooth;
  }, [autoPlayOnBluetooth]);

  useEffect(() => {
    let cancelled = false;

    loadLastStation()
      .then(storedStation => {
        const station = resolvePersistedStation(
          storedStation,
          stationsRef.current
        );
        if (!cancelled && station) {
          setLastStation(station);
          lastStationRef.current = station;
        }
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [stations]);

  // Fetch ICY metadata from stream
  const fetchStreamMetadata = async (streamUrl: string) => {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      const response = await fetch(streamUrl, {
        method: 'GET',
        headers: { 'Icy-MetaData': '1' },
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      const icyMetaInt = response.headers.get('icy-metaint');
      if (!icyMetaInt) return null;

      const metaInt = parseInt(icyMetaInt, 10);
      const reader = response.body?.getReader();
      if (!reader) return null;

      let bytesRead = 0;
      const chunks: Uint8Array[] = [];

      while (bytesRead < metaInt + 4081) {
        const { value, done } = await reader.read();
        if (done || !value) break;
        chunks.push(value);
        bytesRead += value.length;
        if (bytesRead > metaInt) break;
      }
      reader.cancel();

      const allBytes = new Uint8Array(bytesRead);
      let offset = 0;
      for (const chunk of chunks) {
        allBytes.set(chunk, offset);
        offset += chunk.length;
      }

      if (allBytes.length <= metaInt) return null;

      const metaLength = allBytes[metaInt] * 16;
      if (metaLength === 0) return null;

      const metaBytes = allBytes.slice(metaInt + 1, metaInt + 1 + metaLength);
      const metaStr = new TextDecoder('utf-8')
        .decode(metaBytes)
        .replace(/\0+$/, '');

      const match = metaStr.match(/StreamTitle='([^']*)'/);
      return match ? match[1] : null;
    } catch {
      return null;
    }
  };

  const getStreamMetadata = async (
    streamUrl: string
  ): Promise<string | null> => {
    if (Platform.OS === 'web' && ipcRenderer?.invoke) {
      try {
        const metadata = await ipcRenderer.invoke(
          'fetch-stream-metadata',
          streamUrl
        );
        return typeof metadata === 'string' ? metadata : null;
      } catch {
        return null;
      }
    }
    return fetchStreamMetadata(streamUrl);
  };

  const startMetadataPolling = (streamUrl: string) => {
    if (metadataIntervalRef.current) {
      clearInterval(metadataIntervalRef.current);
    }
    if (Platform.OS !== 'web') {
      metadataIntervalRef.current = null;
      return;
    }
    getStreamMetadata(streamUrl).then(setNowPlayingTrack);
    metadataIntervalRef.current = setInterval(async () => {
      const track = await getStreamMetadata(streamUrl);
      setNowPlayingTrack(track);
    }, 15000);
  };

  const stopMetadataPolling = () => {
    if (metadataIntervalRef.current) {
      clearInterval(metadataIntervalRef.current);
      metadataIntervalRef.current = null;
    }
    setNowPlayingTrack(null);
  };

  const stopPlayback = async () => {
    stopMetadataPolling();
    isPlayingRef.current = false;
    temporaryInterruptionActiveRef.current = false;
    resumeAfterTemporaryInterruptionRef.current = false;
    const audioService = audioServiceRef.current;
    try {
      if (audioService) {
        await audioService.stop();
        if (Platform.OS !== 'web') {
          await audioService.setActiveForLockScreen(false);
        }
      }
      await hidePlaybackNotification();
    } catch {
      // ignore
    }
    setPlaybackStateSynced('idle');
    setCurrentStation(null);
  };

  stopPlaybackRef.current = stopPlayback;

  const markPlaybackSuspended = () => {
    stopMetadataPolling();
    isPlayingRef.current = false;
    setPlaybackStateSynced(
      currentStationRef.current || lastStationRef.current ? 'suspended' : 'idle'
    );
  };

  const syncNativePlaybackState = (nativeState: TrackPlayerState) => {
    if (isStartingPlaybackRef.current) return;

    switch (nativeState) {
      case TrackPlayerState.Playing:
        if (currentStationRef.current || lastStationRef.current) {
          isPlayingRef.current = true;
          setPlaybackStateSynced('playing');
        }
        break;
      case TrackPlayerState.Loading:
      case TrackPlayerState.Buffering:
        if (
          isPlayingRef.current ||
          playbackStateRef.current === 'playing' ||
          playbackStateRef.current === 'loading'
        ) {
          setPlaybackStateSynced('loading');
        }
        break;
      case TrackPlayerState.Ready:
      case TrackPlayerState.Paused:
      case TrackPlayerState.Stopped:
      case TrackPlayerState.None:
      case TrackPlayerState.Ended:
      case TrackPlayerState.Error:
        if (
          isPlayingRef.current ||
          playbackStateRef.current === 'playing' ||
          playbackStateRef.current === 'loading'
        ) {
          markPlaybackSuspended();
        }
        break;
    }
  };

  const handleAudioFocusChange = (event: {
    paused: boolean;
    permanent: boolean;
  }) => {
    if (event.permanent) {
      temporaryInterruptionActiveRef.current = false;
      resumeAfterTemporaryInterruptionRef.current = false;
      return;
    }

    if (event.paused) {
      const shouldResume =
        isPlayingRef.current ||
        playbackStateRef.current === 'playing' ||
        playbackStateRef.current === 'loading';

      temporaryInterruptionActiveRef.current = true;
      resumeAfterTemporaryInterruptionRef.current = shouldResume;

      if (shouldResume) {
        markPlaybackSuspended();
      }
      return;
    }

    const shouldResume =
      temporaryInterruptionActiveRef.current &&
      resumeAfterTemporaryInterruptionRef.current;

    temporaryInterruptionActiveRef.current = false;
    resumeAfterTemporaryInterruptionRef.current = false;

    if (shouldResume) {
      startLastStationPlayback();
    }
  };

  const getLastPlayableStation = async (
    fallbackToFirstStation: boolean = false
  ): Promise<Station | null> => {
    const immediateStation =
      currentStationRef.current || lastStationRef.current;
    if (immediateStation) return immediateStation;

    const storedStation = await loadLastStation().catch(() => null);
    const resolvedStation = resolvePersistedStation(
      storedStation,
      stationsRef.current
    );
    if (resolvedStation) return resolvedStation;

    return fallbackToFirstStation ? (stationsRef.current[0] ?? null) : null;
  };

  const startLastStationPlayback = async (
    fallbackToFirstStation: boolean = false
  ) => {
    if (
      playbackStateRef.current === 'playing' ||
      playbackStateRef.current === 'loading'
    ) {
      return;
    }

    const target = await getLastPlayableStation(fallbackToFirstStation);
    if (target) {
      playStationRef.current(target);
    }
  };

  const playStation = async (station: Station) => {
    // Increment operation ID to invalidate any pending play operations
    const operationId = ++playOperationIdRef.current;

    setStreamError(null);
    setPlaybackStateSynced('loading');
    temporaryInterruptionActiveRef.current = false;
    resumeAfterTemporaryInterruptionRef.current = false;
    setNowPlayingTrack(null);
    setLastStation(station);
    lastStationRef.current = station;
    setCurrentStation(station);

    try {
      const audioService = audioServiceRef.current;
      if (!audioService) {
        throw new Error('Audio service not initialized');
      }

      // Stop any current playback first
      if (isPlayingRef.current) {
        isPlayingRef.current = false;
        await audioService.stop();
      }

      // Check if this operation was superseded by a newer one
      if (operationId !== playOperationIdRef.current) {
        return; // Another station was selected, abort this operation
      }

      // Check again before the actual play call
      if (operationId !== playOperationIdRef.current) {
        return;
      }

      isPlayingRef.current = true;
      isStartingPlaybackRef.current = true;
      await audioService.play(station.url, station.name);
      isStartingPlaybackRef.current = false;

      // Verify this is still the current operation before updating state
      if (operationId !== playOperationIdRef.current) {
        // This play succeeded but was superseded, stop it
        await audioService.stop();
        return;
      }

      setPlaybackStateSynced('playing');
      saveLastStation(station).catch(() => undefined);
      startMetadataPolling(station.url);
    } catch (err) {
      isStartingPlaybackRef.current = false;
      // Ignore "play interrupted by pause" errors - this is normal when fast-clicking
      const errorMessage = err instanceof Error ? err.message : String(err);
      const isInterruptedError =
        errorMessage.includes('interrupted') ||
        errorMessage.includes('AbortError') ||
        (err instanceof DOMException && err.name === 'AbortError');

      // Only update error state if this is still the current operation and not an interrupt
      if (operationId === playOperationIdRef.current && !isInterruptedError) {
        isPlayingRef.current = false;
        setPlaybackStateSynced('idle');
        setCurrentStation(null);
        stopMetadataPolling();
        setStreamError(
          'Unable to play the stream. Check the URL and try again.'
        );
      }
    }
  };

  playStationRef.current = playStation;

  const setVolume = async (newVolume: number) => {
    const clamped = Math.max(0, Math.min(1, newVolume));
    setVolumeState(clamped);
    const audioService = audioServiceRef.current;
    if (audioService) {
      try {
        await audioService.setVolume(clamped);
      } catch {
        // ignore volume change errors
      }
    }
  };

  const handlePrimaryControl = () => {
    const target = currentStation || lastStation;
    if (!target) return;
    if (playbackState === 'playing' || playbackState === 'loading') {
      stopPlayback();
    } else {
      playStation(target);
    }
  };

  primaryControlRef.current = handlePrimaryControl;

  const startTrayPlay = () => {
    startLastStationPlayback(true);
  };

  trayPlayRef.current = startTrayPlay;

  // Initialize audio service
  useEffect(() => {
    const bootstrap = async () => {
      try {
        await initializeAudioMode();
        await initializeNotifications();
        audioServiceRef.current = getAudioService();

        if (audioServiceRef.current?.setCallbacks) {
          audioServiceRef.current.setCallbacks({
            onPlay: () => {
              startLastStationPlayback();
            },
            onPause: () => stopPlaybackRef.current(),
            onStop: () => stopPlaybackRef.current(),
            onNext: () => {
              const currentIndex = stationsRef.current.findIndex(
                s => s.id === currentStationRef.current?.id
              );
              if (
                currentIndex >= 0 &&
                currentIndex < stationsRef.current.length - 1
              ) {
                const nextStation = stationsRef.current[currentIndex + 1];
                if (nextStation) playStationRef.current(nextStation);
              }
            },
            onPrevious: () => {
              const currentIndex = stationsRef.current.findIndex(
                s => s.id === currentStationRef.current?.id
              );
              if (currentIndex > 0) {
                const prevStation = stationsRef.current[currentIndex - 1];
                if (prevStation) playStationRef.current(prevStation);
              }
            },
            onMetadata: title => {
              if (isPlayingRef.current) {
                setNowPlayingTrack(title);
              }
            },
            onPlaybackState: syncNativePlaybackState,
            onAudioFocusChange: handleAudioFocusChange,
          });
        }
      } catch (e) {
        console.warn('Bootstrap failed:', e);
      }
    };

    bootstrap();

    // IPC listener for Electron tray controls
    let ipcListener: ((...args: unknown[]) => void) | null = null;
    try {
      if (ipcRenderer && typeof ipcRenderer.on === 'function') {
        ipcListener = (...args: unknown[]) => {
          const action = args[1] as string | undefined;
          switch (action) {
            case 'toggle':
              primaryControlRef.current();
              break;
            case 'play':
              trayPlayRef.current();
              break;
            case 'stop':
              stopPlaybackRef.current();
              break;
          }
        };
        ipcRenderer.on('playback-control', ipcListener);
      }
    } catch (e) {
      console.warn('IPC setup failed:', e);
    }

    return () => {
      stopPlayback();
      try {
        if (
          ipcRenderer &&
          ipcListener &&
          typeof ipcRenderer.removeListener === 'function'
        ) {
          ipcRenderer.removeListener('playback-control', ipcListener);
        }
      } catch {
        // Ignore cleanup errors
      }
    };
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'android' || !isBluetoothAutoPlayAvailable()) return;

    const triggerBluetoothAutoPlay = () => {
      if (!autoPlayOnBluetoothRef.current) return;

      const now = Date.now();
      if (now - bluetoothAutoPlayTriggeredAtRef.current < 10000) return;

      bluetoothAutoPlayTriggeredAtRef.current = now;
      startLastStationPlayback();
    };

    startBluetoothAutoPlayListener().catch(error => {
      console.warn('Bluetooth auto-play listener failed:', error);
    });

    const subscription = addBluetoothAudioConnectedListener(() => {
      triggerBluetoothAutoPlay();
    });

    return () => {
      subscription?.remove();
    };
  }, []);

  // Sync playback state to Electron tray
  useEffect(() => {
    if (ipcRenderer?.send) {
      ipcRenderer.send('playback-state', playbackState);
    }
  }, [playbackState]);

  // Update lock screen metadata
  useEffect(() => {
    const updateLockScreenMetadata = async () => {
      const audioService = audioServiceRef.current;
      if (audioService && currentStation && playbackState === 'playing') {
        try {
          if (audioService.updateMetadata) {
            await audioService.updateMetadata(
              nowPlayingTrack || currentStation.name,
              nowPlayingTrack ? currentStation.name : 'Radiolla'
            );
          }
          await audioService.setActiveForLockScreen(true, {
            title: nowPlayingTrack || currentStation.name,
            artist: nowPlayingTrack ? currentStation.name : 'Radiolla',
          });
          if (Platform.OS === 'web') {
            await showPlaybackNotification(
              currentStation.name,
              nowPlayingTrack
            );
          }
        } catch (error) {
          console.error('Failed to update lock screen metadata:', error);
        }
      } else if (playbackState !== 'playing') {
        await hidePlaybackNotification();
      }
    };
    updateLockScreenMetadata();
  }, [nowPlayingTrack, currentStation, playbackState]);

  const value: AudioContextType = {
    currentStation,
    lastStation,
    playbackState,
    nowPlayingTrack,
    streamError,
    volume,
    playStation,
    stopPlayback,
    setVolume,
    handlePrimaryControl,
    audioServiceRef,
  };

  return (
    <AudioContext.Provider value={value}>{children}</AudioContext.Provider>
  );
}

export function useAudio() {
  const context = useContext(AudioContext);
  if (!context) {
    throw new Error('useAudio must be used within an AudioProvider');
  }
  return context;
}
