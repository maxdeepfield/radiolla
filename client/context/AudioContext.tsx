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
  initializeNotifications,
  showPlaybackNotification,
  hidePlaybackNotification,
} from '../../services/notificationService';

export type Station = {
  id: string;
  name: string;
  url: string;
};

export type PlaybackState = 'idle' | 'loading' | 'playing';

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

export function AudioProvider({
  children,
  stations,
}: {
  children: ReactNode;
  stations: Station[];
}) {
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
    setPlaybackState('idle');
    setCurrentStation(null);
  };

  stopPlaybackRef.current = stopPlayback;

  const playStation = async (station: Station) => {
    setStreamError(null);
    setPlaybackState('loading');
    setNowPlayingTrack(null);
    setLastStation(station);
    setCurrentStation(station);
    try {
      const audioService = audioServiceRef.current;
      if (!audioService) {
        throw new Error('Audio service not initialized');
      }
      await audioService.stop();
      if (Platform.OS !== 'web') {
        await audioService.setActiveForLockScreen(true, {
          title: station.name,
          artist: 'Radiolla',
        });
      }
      await audioService.play(station.url, station.name);
      setPlaybackState('playing');
      startMetadataPolling(station.url);
    } catch (_err) {
      setPlaybackState('idle');
      setCurrentStation(null);
      stopMetadataPolling();
      setStreamError('Unable to play the stream. Check the URL and try again.');
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
    if (playbackState === 'playing' || playbackState === 'loading') return;
    const stationToPlay = currentStation || lastStation || stations[0];
    if (stationToPlay) {
      playStation(stationToPlay);
    }
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
              const target = currentStation || lastStation;
              if (target) {
                playStationRef.current(target);
              }
            },
            onPause: () => stopPlaybackRef.current(),
            onStop: () => stopPlaybackRef.current(),
            onNext: () => {
              const currentIndex = stations.findIndex(
                s => s.id === currentStation?.id
              );
              if (currentIndex >= 0 && currentIndex < stations.length - 1) {
                const nextStation = stations[currentIndex + 1];
                if (nextStation) playStationRef.current(nextStation);
              }
            },
            onPrevious: () => {
              const currentIndex = stations.findIndex(
                s => s.id === currentStation?.id
              );
              if (currentIndex > 0) {
                const prevStation = stations[currentIndex - 1];
                if (prevStation) playStationRef.current(prevStation);
              }
            },
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
