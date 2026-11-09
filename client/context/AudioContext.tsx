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
  loadLastStation,
  loadPlaybackVolume,
  saveLastStation,
  savePlaybackVolume,
  PersistedStation,
  saveStationLibrary,
} from '../../services/playbackPreferences';
import { useSettings } from './SettingsContext';
import { setRemoteHandlers } from '../../services/trackPlayerService';
import { prepareLocalAudioUrl } from '../../services/localAudioFiles';

export type Station = {
  id: string;
  name: string;
  url: string;
  type?: 'stream' | 'file';
};

export type PlaybackState = 'idle' | 'loading' | 'playing' | 'paused';

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
  playbackState: PlaybackState;
  nowPlayingTrack: string | null;
  streamError: string | null;
  volume: number;
  position: number;
  duration: number;
  playStation: (station: Station) => Promise<void>;
  stopPlayback: () => Promise<void>;
  setVolume: (vol: number) => Promise<void>;
  seekTo: (position: number) => Promise<void>;
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
  const [playbackState, setPlaybackState] = useState<PlaybackState>('idle');
  const [nowPlayingTrack, setNowPlayingTrack] = useState<string | null>(null);
  const [streamError, setStreamError] = useState<string | null>(null);
  const [volume, setVolumeState] = useState(1.0);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);

  const audioServiceRef = useRef<AudioService | null>(null);
  const metadataIntervalRef = useRef<ReturnType<typeof setInterval> | null>(
    null
  );
  const metadataStreamUrlRef = useRef<string | null>(null);
  const playStationRef = useRef<(station: Station) => void>(() => {});
  const currentStationRef = useRef<Station | null>(null);
  const playbackStateRef = useRef<PlaybackState>('idle');
  const volumeRef = useRef(1);
  const volumeChangedRef = useRef(false);
  const stationsRef = useRef<Station[]>(stations);
  const autoPlayOnBluetoothRef = useRef(autoPlayOnBluetooth);
  const bluetoothAutoPlayTriggeredAtRef = useRef(0);

  const playQueueRef = useRef<Promise<void>>(Promise.resolve());
  const requestedStationRef = useRef<Station | null>(null);

  const setPlaybackStateSynced = (nextState: PlaybackState) => {
    playbackStateRef.current = nextState;
    setPlaybackState(nextState);
  };

  useEffect(() => {
    currentStationRef.current = currentStation;
  }, [currentStation]);

  useEffect(() => {
    playbackStateRef.current = playbackState;
  }, [playbackState]);

  useEffect(() => {
    stationsRef.current = stations;
  }, [stations]);

  useEffect(() => {
    saveStationLibrary(stations).catch(() => undefined);
  }, [stations]);

  useEffect(() => {
    autoPlayOnBluetoothRef.current = autoPlayOnBluetooth;
  }, [autoPlayOnBluetooth]);

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
    metadataStreamUrlRef.current = streamUrl;
    if (metadataIntervalRef.current) {
      clearInterval(metadataIntervalRef.current);
    }
    if (Platform.OS !== 'web') {
      metadataIntervalRef.current = null;
      return;
    }
    getStreamMetadata(streamUrl).then(track => {
      if (metadataStreamUrlRef.current === streamUrl) {
        setNowPlayingTrack(track);
      }
    });
    metadataIntervalRef.current = setInterval(async () => {
      const track = await getStreamMetadata(streamUrl);
      if (metadataStreamUrlRef.current === streamUrl) {
        setNowPlayingTrack(track);
      }
    }, 15000);
  };

  const stopMetadataPolling = () => {
    metadataStreamUrlRef.current = null;
    if (metadataIntervalRef.current) {
      clearInterval(metadataIntervalRef.current);
      metadataIntervalRef.current = null;
    }
    setNowPlayingTrack(null);
  };

  const stopPlayback = async () => {
    requestedStationRef.current = null;
    stopMetadataPolling();
    const audioService = audioServiceRef.current;
    try {
      if (audioService) {
        await audioService.stop();
      }
    } catch {
      // ignore
    }
    setPlaybackStateSynced('idle');
    setPosition(0);
    setDuration(0);
  };

  const getLastPlayableStation = async (
    fallbackToFirstStation: boolean = false
  ): Promise<Station | null> => {
    const immediateStation = currentStationRef.current;
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
    requestedStationRef.current = station;
    setStreamError(null);
    setPlaybackStateSynced('loading');
    setNowPlayingTrack(null);
    setCurrentStation(station);
    currentStationRef.current = station;
    setPosition(0);
    setDuration(0);

    const queuedPlay = playQueueRef.current
      .catch(() => undefined)
      .then(async () => {
        if (requestedStationRef.current?.id !== station.id) return;

        try {
          const audioService = audioServiceRef.current;
          if (!audioService) {
            throw new Error('Audio service not initialized');
          }

          const playbackUrl =
            station.type === 'file'
              ? await prepareLocalAudioUrl(station.url)
              : station.url;
          await audioService.play(
            playbackUrl,
            station.name,
            station.type === 'file'
          );

          if (requestedStationRef.current?.id !== station.id) {
            await audioService.stop();
            return;
          }

          setPlaybackStateSynced('playing');
          saveLastStation(station).catch(() => undefined);
          if (station.type === 'file') {
            stopMetadataPolling();
          } else {
            startMetadataPolling(station.url);
          }
        } catch {
          if (requestedStationRef.current?.id !== station.id) return;

          setPlaybackStateSynced('idle');
          stopMetadataPolling();
          setStreamError(
            'Unable to play the stream. Check the URL and try again.'
          );
        }
      });

    playQueueRef.current = queuedPlay;
    await queuedPlay;
  };

  playStationRef.current = playStation;

  const setVolume = async (newVolume: number) => {
    const clamped = Math.max(0, Math.min(1, newVolume));
    volumeChangedRef.current = true;
    volumeRef.current = clamped;
    setVolumeState(clamped);
    const audioService = audioServiceRef.current;
    if (audioService) {
      try {
        audioService.setVolume(clamped);
      } catch {
        // ignore volume change errors
      }
    }
  };

  const seekTo = async (nextPosition: number) => {
    const audioService = audioServiceRef.current;
    if (!audioService || currentStationRef.current?.type !== 'file') return;
    const clamped = Math.max(
      0,
      Math.min(duration || nextPosition, nextPosition)
    );
    await audioService.seekTo(clamped);
    setPosition(clamped);
  };

  const handlePrimaryControl = async () => {
    const target = currentStation;
    if (!target) return;
    if (playbackState === 'playing' || playbackState === 'loading') {
      if (target.type === 'file' && playbackState === 'playing') {
        await audioServiceRef.current?.pause();
        setPlaybackStateSynced('paused');
      } else {
        await stopPlayback();
      }
    } else if (playbackState === 'paused' && target.type === 'file') {
      await audioServiceRef.current?.resume();
      setPlaybackStateSynced('playing');
    } else {
      await playStation(target);
    }
  };

  // Initialize audio service
  useEffect(() => {
    const bootstrap = async () => {
      try {
        const storedVolume = await loadPlaybackVolume();
        if (!volumeChangedRef.current) {
          volumeRef.current = storedVolume;
          setVolumeState(storedVolume);
        }

        await initializeAudioMode();
        audioServiceRef.current = getAudioService();
        await audioServiceRef.current.setVolume(volumeRef.current);

        audioServiceRef.current.setCallbacks({
          onMetadata: title => {
            if (
              requestedStationRef.current &&
              playbackStateRef.current !== 'idle'
            ) {
              setNowPlayingTrack(title);
            }
          },
          onEnded: () => {
            const active = currentStationRef.current;
            if (!active || active.type !== 'file') return;
            const currentIndex = stationsRef.current.findIndex(
              station => station.id === active.id
            );
            const nextFile = stationsRef.current
              .slice(currentIndex + 1)
              .find(station => station.type === 'file');
            if (nextFile) {
              playStationRef.current(nextFile);
            } else {
              setPlaybackStateSynced('idle');
            }
          },
        });

        setRemoteHandlers({
          onPlay: () => {
            const target = currentStationRef.current;
            if (target) playStationRef.current(target);
          },
          onPause: () => {
            audioServiceRef.current?.pause().then(() => {
              setPlaybackStateSynced('paused');
            });
          },
          onStop: () => {
            stopPlayback();
          },
          onNext: () => {
            const active = currentStationRef.current;
            const list = stationsRef.current;
            if (!list.length) return;
            const idx = active
              ? list.findIndex(s => s.id === active.id)
              : -1;
            const next = list[(idx + 1 + list.length) % list.length];
            if (next) playStationRef.current(next);
          },
          onPrevious: () => {
            const active = currentStationRef.current;
            const list = stationsRef.current;
            if (!list.length) return;
            const idx = active
              ? list.findIndex(s => s.id === active.id)
              : 0;
            const prev = list[(idx - 1 + list.length) % list.length];
            if (prev) playStationRef.current(prev);
          },
        });
      } catch (e) {
        console.warn('Bootstrap failed:', e);
      }
    };

    bootstrap();

    return () => {
      stopPlayback();
    };
  }, []);

  useEffect(() => {
    if (currentStation?.type !== 'file' || playbackState === 'idle') {
      return;
    }

    let active = true;
    const updateProgress = async () => {
      const progress = await audioServiceRef.current?.getProgress();
      if (!active || !progress) return;
      setPosition(progress.position);
      setDuration(progress.duration);
    };
    updateProgress();
    const interval = setInterval(updateProgress, 500);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [currentStation?.id, currentStation?.type, playbackState]);

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

  const value: AudioContextType = {
    currentStation,
    playbackState,
    nowPlayingTrack,
    streamError,
    volume,
    position,
    duration,
    playStation,
    stopPlayback,
    setVolume,
    seekTo,
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
