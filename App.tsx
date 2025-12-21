import React, { useEffect, useMemo, useRef, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import {
  useFonts,
  RobotoCondensed_400Regular,
  RobotoCondensed_500Medium,
  RobotoCondensed_700Bold,
} from '@expo-google-fonts/roboto-condensed';
import {
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useColorScheme,
  View,
  Linking,
  StatusBar as RNStatusBar,
  PanResponder,
  Animated,
} from 'react-native';

// Safe area insets for edge-to-edge mode
const INSETS = {
  top: Platform.OS === 'android' ? RNStatusBar.currentHeight || 24 : 0,
  bottom: Platform.OS === 'android' ? 24 : 0, // Android gesture nav bar height
};
import {
  getAudioService,
  initializeAudioMode,
  AudioService,
} from './services/audioService';
import {
  initializeNotifications,
  showPlaybackNotification,
  hidePlaybackNotification,
} from './services/notificationService';
import AsyncStorage from '@react-native-async-storage/async-storage';
import appConfig from './app.json';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { parsePlaylist, generateM3U, generatePLS } from './utils/playlist';

// Add this import for Electron IPC handling
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
  // In Electron environment, ipcRenderer is exposed globally
  ipcRenderer = (window as ElectronWindow).ipcRenderer || null;
}

export type Station = {
  id: string;
  name: string;
  url: string;
};

type PressableState = {
  hovered?: boolean;
  pressed?: boolean;
  focused?: boolean;
};

const STORAGE_KEY = 'Radiolla:stations';

const defaultStations: Station[] = [];

type ThemePref = 'auto' | 'light' | 'dark';

type Palette = {
  background: string;
  surface: string;
  border: string;
  borderStrong: string;
  textPrimary: string;
  textSecondary: string;
  accentSoft: string;
  accentStrong: string;
  neutral: string;
  destructiveSoft: string;
  destructiveStrong: string;
  overlay: string;
};

const THEME_STORAGE_KEY = 'Radiolla:theme-pref';

const palettes: Record<'light' | 'dark', Palette> = {
  light: {
    background: '#f5f4fb',
    surface: '#fcfbff',
    border: '#dcd7ef',
    borderStrong: '#bfb6df',
    textPrimary: '#1f2430',
    textSecondary: '#6e7587',
    accentSoft: '#dcd4ff',
    accentStrong: '#bcb0ff',
    neutral: '#e6e1f3',
    destructiveSoft: '#ffe7ec',
    destructiveStrong: '#ffcdd8',
    overlay: 'rgba(28, 26, 45, 0.35)',
  },
  dark: {
    background: '#0f1220',
    surface: '#15192b',
    border: '#262c42',
    borderStrong: '#333b5a',
    textPrimary: '#f8f7ff',
    textSecondary: '#9ca6c5',
    accentSoft: '#2a2f4b',
    accentStrong: '#7a86ff',
    neutral: '#1e2335',
    destructiveSoft: '#3a1f2a',
    destructiveStrong: '#ff6b8a',
    overlay: 'rgba(6, 7, 12, 0.65)',
  },
};

const THEME_OPTIONS: { key: ThemePref; label: string }[] = [
  { key: 'auto', label: 'Auto' },
  { key: 'light', label: 'Light' },
  { key: 'dark', label: 'Dark' },
];

const fonts = {
  regular: 'RobotoCondensed_400Regular',
  medium: 'RobotoCondensed_500Medium',
  bold: 'RobotoCondensed_700Bold',
};

type AppConfig = {
  expo?: {
    version?: string;
  };
};

const APP_VERSION = (appConfig as AppConfig).expo?.version ?? '1.0.0';
const GITHUB_URL = 'https://github.com/maxdeepfield/Radiolla';
const AF_URL = 'https://absolutefreakout.com';

export default function App() {
  const [fontsLoaded] = useFonts({
    RobotoCondensed_400Regular,
    RobotoCondensed_500Medium,
    RobotoCondensed_700Bold,
  });
  const systemScheme = useColorScheme();
  const [stations, setStations] = useState<Station[]>(defaultStations);
  const [nameInput, setNameInput] = useState('');
  const [urlInput, setUrlInput] = useState('');
  const [currentStation, setCurrentStation] = useState<Station | null>(null);
  const [lastStation, setLastStation] = useState<Station | null>(null);
  const [playbackState, setPlaybackState] = useState<
    'idle' | 'loading' | 'playing'
  >('idle');
  const [nowPlayingTrack, setNowPlayingTrack] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [themePref, setThemePref] = useState<ThemePref>('auto');
  const [themeMenuOpen, setThemeMenuOpen] = useState(false);
  const [contextStationId, setContextStationId] = useState<string | null>(null);
  const [streamError, setStreamError] = useState<string | null>(null);
  const [editingStation, setEditingStation] = useState<Station | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [aboutVisible, setAboutVisible] = useState(false);
  const [unexpectedError, setUnexpectedError] = useState<string | null>(null);
  const [volume, setVolume] = useState(1.0);
  const [showVolumePanel, setShowVolumePanel] = useState(false);
  const [isMuted, setIsMuted] = useState(false);

  // Drag and drop state
  const [draggedStationId, setDraggedStationId] = useState<string | null>(null);
  const [draggedOverIndex, setDraggedOverIndex] = useState<number | null>(null);

  // Import/Export State
  const [showImportModal, setShowImportModal] = useState(false);
  const [importStatus, setImportStatus] = useState<string | null>(null);

  const audioServiceRef = useRef<AudioService | null>(null);
  const stopPlaybackRef = useRef<() => Promise<void>>(async () => undefined);
  const primaryControlRef = useRef<() => void>(() => {});
  const trayPlayRef = useRef<() => void>(() => {});
  const trayMuteRef = useRef<() => void>(() => {});
  const playStationRef = useRef<(station: Station) => void>(() => {});
  const lastVolumeRef = useRef(1);
  const metadataIntervalRef = useRef<ReturnType<typeof setInterval> | null>(
    null
  );
  const stationRefsRef = useRef<Map<string, View>>(new Map());

  const resolvedTheme =
    themePref === 'auto'
      ? systemScheme === 'dark'
        ? 'dark'
        : 'light'
      : themePref;
  const palette = palettes[resolvedTheme];
  const styles = useMemo(() => createStyles(palette), [palette]);
  const statusBarStyle = resolvedTheme === 'dark' ? 'light' : 'dark';

  useEffect(() => {
    const bootstrap = async () => {
      try {
        // Initialize audio service and mode
        await initializeAudioMode();
        await initializeNotifications();
        audioServiceRef.current = getAudioService();

        // Set up TrackPlayer callbacks for notification controls (Android/iOS)
        if (Platform.OS !== 'web' && audioServiceRef.current?.setCallbacks) {
          audioServiceRef.current.setCallbacks({
            onPlay: () => {
              // Resume playback from notification - for live streams, restart
              const target = currentStation || lastStation;
              if (target) {
                playStationRef.current(target);
              }
            },
            onPause: () => {
              // Pause from notification - for radio streams, this acts like stop
              stopPlaybackRef.current();
            },
            onStop: () => {
              // Stop from notification
              stopPlaybackRef.current();
            },
            onNext: () => {
              // Skip to next station
              const currentIndex = stations.findIndex(s => s.id === currentStation?.id);
              if (currentIndex >= 0 && currentIndex < stations.length - 1) {
                const nextStation = stations[currentIndex + 1];
                if (nextStation) {
                  playStationRef.current(nextStation);
                }
              }
            },
            onPrevious: () => {
              // Skip to previous station
              const currentIndex = stations.findIndex(s => s.id === currentStation?.id);
              if (currentIndex > 0) {
                const prevStation = stations[currentIndex - 1];
                if (prevStation) {
                  playStationRef.current(prevStation);
                }
              }
            },
          });
        }

        await loadStoredStations();
        await loadThemePref();
      } catch (e) {
        console.warn('Bootstrap failed:', e);
      }
    };

    bootstrap();

    // Add IPC listener for Electron tray controls
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
            case 'mute':
              trayMuteRef.current();
              break;
            default:
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
      // Clean up IPC listener
      try {
        if (
          ipcRenderer &&
          ipcListener &&
          typeof ipcRenderer.removeListener === 'function'
        ) {
          ipcRenderer.removeListener('playback-control', ipcListener);
        }
      } catch (_e) {
        // Ignore cleanup errors
      }
    };
  }, []);

  // Handle drag-end on mouse up
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!draggedStationId) return;

      const elements = document.elementsFromPoint(e.clientX, e.clientY);
      for (const el of elements) {
        const stationId = (el as any).dataset?.stationId;
        if (stationId) {
          const index = stations.findIndex(s => s.id === stationId);
          if (index >= 0) {
            setDraggedOverIndex(index);
          }
          break;
        }
      }
    };

    const handleMouseUp = () => {
      if (draggedStationId) {
        handleStationDragEnd();
      }
    };

    if (Platform.OS === 'web') {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [draggedStationId, stations]);

  useEffect(() => {
    if (ipcRenderer?.send) {
      ipcRenderer.send('playback-mute-state', { isMuted });
    }
  }, [isMuted]);

  // Sync playback state to Electron tray
  useEffect(() => {
    if (ipcRenderer?.send) {
      ipcRenderer.send('playback-state', playbackState);
    }
  }, [playbackState]);

  useEffect(() => {
    try {
      const globalErrorUtils = (globalThis as any).ErrorUtils;
      let previousHandler: ((error: Error, isFatal?: boolean) => void) | null =
        null;
      if (
        globalErrorUtils &&
        typeof globalErrorUtils.getGlobalHandler === 'function' &&
        typeof globalErrorUtils.setGlobalHandler === 'function'
      ) {
        previousHandler = globalErrorUtils.getGlobalHandler();
        globalErrorUtils.setGlobalHandler((error: Error, isFatal?: boolean) => {
          setUnexpectedError(error?.message ?? 'Something went wrong.');
          if (previousHandler) {
            previousHandler(error, isFatal);
          }
        });
      }

      const handleWindowError = (event: any) => {
        setUnexpectedError(
          event?.error?.message ?? event?.message ?? 'Something went wrong.'
        );
      };
      const handleRejection = (event: any) => {
        const reason = event?.reason?.message ?? String(event?.reason ?? '');
        setUnexpectedError(reason || 'Something went wrong.');
      };
      if (typeof window !== 'undefined' && window.addEventListener) {
        window.addEventListener('error', handleWindowError);
        window.addEventListener('unhandledrejection', handleRejection);
      }

      return () => {
        try {
          if (
            globalErrorUtils &&
            typeof globalErrorUtils.setGlobalHandler === 'function' &&
            previousHandler
          ) {
            globalErrorUtils.setGlobalHandler(previousHandler);
          }
          if (typeof window !== 'undefined' && window.removeEventListener) {
            window.removeEventListener('error', handleWindowError);
            window.removeEventListener('unhandledrejection', handleRejection);
          }
        } catch (_e) {
          // Ignore cleanup errors
        }
      };
    } catch (e) {
      console.warn('Error handler setup failed:', e);
    }
  }, []);

  useEffect(() => {
    loadStoredStations();
  }, []);

  useEffect(() => {
    const updateLockScreenMetadata = async () => {
      const audioService = audioServiceRef.current;
      if (
        audioService &&
        currentStation &&
        playbackState === 'playing' &&
        Platform.OS !== 'web'
      ) {
        try {
          // Update TrackPlayer notification metadata
          if (audioService.updateMetadata) {
            await audioService.updateMetadata(
              nowPlayingTrack || currentStation.name,
              nowPlayingTrack ? currentStation.name : 'Radiolla'
            );
          }
          // Also update legacy lock screen (for expo-audio fallback)
          await audioService.setActiveForLockScreen(true, {
            title: nowPlayingTrack || currentStation.name,
            artist: nowPlayingTrack ? currentStation.name : 'Radiolla',
          });
          // Show expo-notifications as backup (TrackPlayer handles its own notification)
          if (Platform.OS === 'web') {
            await showPlaybackNotification(currentStation.name, nowPlayingTrack);
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

  const loadStoredStations = async () => {
    try {
      const stored = await AsyncStorage.getItem(STORAGE_KEY);
      if (stored) {
        setStations(JSON.parse(stored));
      }
    } catch {
      setStations(defaultStations);
    }
  };

  const persistStations = async (next: Station[]) => {
    setStations(next);
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // ignore persistence errors
    }
  };

  const loadThemePref = async () => {
    try {
      const stored = await AsyncStorage.getItem(THEME_STORAGE_KEY);
      if (stored === 'auto' || stored === 'light' || stored === 'dark') {
        setThemePref(stored);
      }
    } catch {
      // ignore theme load errors
    }
  };

  const updateThemePref = async (next: ThemePref) => {
    setThemePref(next);
    try {
      await AsyncStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // ignore persistence errors
    }
  };

  const stopPlayback = async () => {
    stopMetadataPolling();
    const audioService = audioServiceRef.current;

    try {
      if (audioService) {
        await audioService.stop();
        // Clear lock screen controls on mobile
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

  if (!fontsLoaded) {
    return (
      <View style={styles.container}>
        <StatusBar style="dark" />
      </View>
    );
  }

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

  // Fetch metadata - use IPC for Electron, direct fetch for mobile
  const getStreamMetadata = async (
    streamUrl: string
  ): Promise<string | null> => {
    if (Platform.OS === 'web' && ipcRenderer?.invoke) {
      // Electron: use main process to bypass CORS
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
    // Mobile: direct fetch
    return fetchStreamMetadata(streamUrl);
  };

  const startMetadataPolling = (streamUrl: string) => {
    if (metadataIntervalRef.current) {
      clearInterval(metadataIntervalRef.current);
    }

    // Fetch immediately
    getStreamMetadata(streamUrl).then(setNowPlayingTrack);

    // Then poll every 15 seconds
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

      // Stop existing playback
      await audioService.stop();

      // Set up lock screen controls
      if (Platform.OS !== 'web') {
        await audioService.setActiveForLockScreen(true, {
          title: station.name,
          artist: 'Radiolla',
        });
      }

      // Start playback with the appropriate service
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

  // Update ref for notification callbacks
  playStationRef.current = playStation;

  const handleSaveStation = async () => {
    setFormError(null);
    if (!nameInput.trim() || !urlInput.trim()) {
      setFormError('Name and stream URL are required.');
      return;
    }
    if (!/^https?:\/\//i.test(urlInput.trim())) {
      setFormError('Stream URL should start with http or https.');
      return;
    }
    if (editingStation) {
      const updated: Station = {
        ...editingStation,
        name: nameInput.trim(),
        url: urlInput.trim(),
      };
      const next = stations.map(station =>
        station.id === editingStation.id ? updated : station
      );
      await persistStations(next);
      if (currentStation?.id === editingStation.id) {
        setCurrentStation(updated);
      }
      if (lastStation?.id === editingStation.id) {
        setLastStation(updated);
      }
      setEditingStation(null);
    } else {
      const newStation: Station = {
        id: Date.now().toString(),
        name: nameInput.trim(),
        url: urlInput.trim(),
      };
      const next = [...stations, newStation];
      await persistStations(next);
    }
    setNameInput('');
    setUrlInput('');
    closeStationModal();
  };

  const handleRemove = async (id: string) => {
    const next = stations.filter(s => s.id !== id);
    await persistStations(next);
    if (currentStation?.id === id) {
      await stopPlayback();
    }
    if (lastStation?.id === id) {
      setLastStation(null);
    }
    setContextStationId(current => (current === id ? null : current));
  };

  const toggleStationMenu = (id: string) => {
    setContextStationId(current => (current === id ? null : id));
  };

  const closeStationMenu = () => setContextStationId(null);

  const handleStationPress = (station: Station) => {
    closeStationMenu();
    if (
      currentStation?.id === station.id &&
      (playbackState === 'playing' || playbackState === 'loading')
    ) {
      stopPlayback();
    } else {
      playStation(station);
    }
  };

  const toggleMenu = () =>
    setMenuOpen(prev => {
      const next = !prev;
      if (!next) {
        setThemeMenuOpen(false);
      }
      return next;
    });
  const closeMenu = () => {
    setMenuOpen(false);
    setThemeMenuOpen(false);
  };

  const handleStationLongPress = (station: Station) => {
    setDraggedStationId(station.id);
    closeStationMenu();
  };

  const handleStationDragEnd = () => {
    if (draggedStationId && draggedOverIndex !== null) {
      const fromIndex = stations.findIndex(s => s.id === draggedStationId);
      if (fromIndex !== draggedOverIndex) {
        const newStations = [...stations];
        const [movedStation] = newStations.splice(fromIndex, 1);
        newStations.splice(draggedOverIndex, 0, movedStation);
        persistStations(newStations);
      }
    }
    setDraggedStationId(null);
    setDraggedOverIndex(null);
  };

  const renderStation = ({ item, index }: { item: Station; index: number }) => {
    const isCurrent = currentStation?.id === item.id;
    const playing = isCurrent && playbackState === 'playing';
    const highlighted =
      isCurrent && (playbackState === 'playing' || playbackState === 'loading');
    const showActions = contextStationId === item.id;
    const isDragging = draggedStationId === item.id;
    const isDraggedOver = draggedOverIndex === index;

    return (
      <View
        style={[
          isDraggedOver && styles.draggedOverCard,
        ]}
        {...(Platform.OS === 'web' && { 'data-station-id': item.id } as any)}
      >
        <Pressable
          onLongPress={() => handleStationLongPress(item)}
          delayLongPress={500}
        >
        <TouchableOpacity
          activeOpacity={0.95}
          onPress={() => !isDragging && handleStationPress(item)}
          style={[
            styles.card,
            highlighted && styles.activeCard,
            playing && styles.playingCard,
            isDragging && styles.draggingCard,
          ]}
        >
          <View style={styles.cardMain}>
            <View style={styles.cardText}>
              <Text style={styles.cardTitle} numberOfLines={1}>
                {item.name}
              </Text>
              <Text style={styles.cardSubtitle} numberOfLines={1}>
                {item.url}
              </Text>
            </View>
            <Pressable
              onPress={() => toggleStationMenu(item.id)}
              hitSlop={6}
              style={({ hovered, pressed }: PressableState) => [
                styles.cardMenuButton,
                (hovered || pressed) && styles.cardMenuButtonActive,
                showActions && styles.cardMenuButtonActive,
              ]}
            >
              <Text style={styles.cardMenuIcon}>⋮</Text>
            </Pressable>
          </View>
          {showActions ? (
            <View style={styles.cardMenuSheet}>
              <Pressable
                style={({ hovered, pressed }: PressableState) => [
                  styles.cardMenuItem,
                  (hovered || pressed) && styles.cardMenuItemActive,
                ]}
                onPress={() => openEditModal(item)}
              >
                <Text style={styles.cardMenuLabel}>Edit</Text>
              </Pressable>
              <View style={styles.menuDivider} />
              <Pressable
                style={({ hovered, pressed }: PressableState) => [
                  styles.cardMenuItem,
                  (hovered || pressed) && styles.cardMenuItemActive,
                ]}
                onPress={() => {
                  closeStationMenu();
                  handleRemove(item.id);
                }}
              >
                <Text style={styles.cardMenuLabel}>Remove</Text>
              </Pressable>
              <View style={styles.menuDivider} />
              <Pressable
                style={({ hovered, pressed }: PressableState) => [
                  styles.cardMenuItem,
                  (hovered || pressed) && styles.cardMenuItemActive,
                ]}
                onPress={closeStationMenu}
              >
                <Text style={styles.cardMenuLabel}>Close</Text>
              </Pressable>
            </View>
          ) : null}
        </TouchableOpacity>
        </Pressable>
      </View>
    );
  };

  const openAddModal = () => {
    setFormError(null);
    setEditingStation(null);
    setNameInput('');
    setUrlInput('');
    closeMenu();
    setShowAddModal(true);
  };

  const openEditModal = (station: Station) => {
    setFormError(null);
    setEditingStation(station);
    setNameInput(station.name);
    setUrlInput(station.url);
    closeStationMenu();
    setShowAddModal(true);
  };

  const closeStationModal = () => {
    setShowAddModal(false);
    setEditingStation(null);
    setFormError(null);
  };

  const openAbout = () => {
    closeMenu();
    setAboutVisible(true);
  };

  const openExternalLink = async (target: string) => {
    try {
      await Linking.openURL(target);
    } catch {
      // ignore link failures
    }
  };

  const closeAbout = () => setAboutVisible(false);
  const dismissUnexpectedError = () => setUnexpectedError(null);

  // Auth Handlers
  const openImportModal = () => {
    setImportStatus(null);
    setShowImportModal(true);
    closeMenu();
  };

  const handleImportFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type:
          Platform.OS === 'web'
            ? '.m3u,.pls'
            : ['audio/x-mpegurl', 'audio/mpegurl', 'audio/x-scpls', '*/*'],
        copyToCacheDirectory: true,
        multiple: true,
      });

      if (result.canceled) return;

      const files = result.assets;
      const allNewStations: Station[] = [];

      for (const file of files) {
        let content = '';

        if (Platform.OS === 'web') {
          // On web, read as text directly
          const response = await fetch(file.uri);
          content = await response.text();
        } else {
          // On mobile, use FileSystem
          content = await FileSystem.readAsStringAsync(file.uri);
        }

        const newStations = parsePlaylist(content);
        allNewStations.push(...newStations);
      }

      if (allNewStations.length === 0) {
        setImportStatus('No valid stations found in selected files.');
        return;
      }

      const updated = [...stations, ...allNewStations];
      await persistStations(updated);
      setImportStatus(
        `Imported ${allNewStations.length} stations from ${files.length} file${files.length > 1 ? 's' : ''}!`
      );
      setTimeout(() => setShowImportModal(false), 1500);
    } catch (e: any) {
      setImportStatus(`Error: ${e.message || 'Failed to import file'}`);
    }
  };

  const handleExportM3U = async () => {
    try {
      const content = generateM3U(stations);
      await downloadFile(content, 'radiolla_stations.m3u', 'audio/x-mpegurl');
      setImportStatus('M3U file saved!');
    } catch (e: any) {
      setImportStatus(`Error: ${e.message}`);
    }
  };

  const handleExportPLS = async () => {
    try {
      const content = generatePLS(stations);
      await downloadFile(content, 'radiolla_stations.pls', 'audio/x-scpls');
      setImportStatus('PLS file saved!');
    } catch (e: any) {
      setImportStatus(`Error: ${e.message}`);
    }
  };

  const downloadFile = async (
    content: string,
    filename: string,
    mimeType: string
  ) => {
    if (Platform.OS === 'web') {
      // Web: trigger download
      const blob = new Blob([content], { type: mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } else {
      // Mobile: save to cache and share
      const fileUri = FileSystem.cacheDirectory + filename;
      await FileSystem.writeAsStringAsync(fileUri, content, {
        encoding: FileSystem.EncodingType.UTF8,
      });
      await Sharing.shareAsync(fileUri, {
        mimeType,
        dialogTitle: `Save ${filename}`,
      });
    }
  };

  const toggleVolumePanel = () => {
    if (activeStation) {
      setShowVolumePanel(prev => !prev);
    }
  };

  const handleVolumeChange = async (newVolume: number) => {
    setVolume(newVolume);
    setIsMuted(newVolume === 0);
    if (newVolume > 0) {
      lastVolumeRef.current = newVolume;
    }

    const audioService = audioServiceRef.current;
    if (audioService) {
      try {
        await audioService.setVolume(newVolume);
      } catch {
        // ignore volume change errors
      }
    }

  };

  const toggleMute = () => {
    if (isMuted) {
      void handleVolumeChange(lastVolumeRef.current || 1);
    } else {
      if (volume > 0) {
        lastVolumeRef.current = volume;
      }
      void handleVolumeChange(0);
    }
  };
  trayMuteRef.current = toggleMute;

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

  const activeStation = currentStation || lastStation;
  let statusLabel = 'Ready';
  if (playbackState === 'loading') {
    statusLabel = 'Buffering...';
  } else if (playbackState === 'playing') {
    statusLabel = nowPlayingTrack || 'Streaming';
  } else if (activeStation) {
    statusLabel = streamError ? `Stopped · ${streamError}` : 'Stopped';
  }
  const controlIcon =
    playbackState === 'playing' || playbackState === 'loading' ? '■' : '▶';

  return (
    <View style={styles.container}>
      <StatusBar style={statusBarStyle} />

      <View style={styles.webWrapper}>
        <View style={styles.appFrame}>
          <View style={[styles.topBar, { paddingTop: INSETS.top + 6 }]}>
            <View>
              <Text style={styles.heading}>Radiolla</Text>
              <Text style={styles.headingBadge}>Absolute Freakout</Text>
            </View>
            <TouchableOpacity
              style={styles.menuButton}
              onPress={toggleMenu}
              activeOpacity={0.8}
            >
              <View style={styles.menuIconLine} />
              <View style={styles.menuIconLine} />
              <View style={styles.menuIconLine} />
            </TouchableOpacity>
          </View>

          {menuOpen && (
            <>
              <TouchableOpacity
                style={styles.menuBackdrop}
                activeOpacity={1}
                onPress={closeMenu}
              />
              <View style={styles.menuPanel}>
                <ScrollView
                  contentContainerStyle={styles.menuContent}
                  showsVerticalScrollIndicator={false}
                  bounces={false}
                >
                  {/* Removed User Email Header */}

                  <Pressable
                    style={({ hovered, pressed }: PressableState) => [
                      styles.menuItem,
                      (hovered || pressed) && styles.menuItemActive,
                    ]}
                    onPress={openAddModal}
                  >
                    <Text style={styles.menuItemLabel}>Add station</Text>
                  </Pressable>
                  <View style={styles.menuDivider} />
                  <Pressable
                    style={({ hovered, pressed }: PressableState) => [
                      styles.menuItem,
                      (hovered || pressed) && styles.menuItemActive,
                    ]}
                    onPress={openImportModal}
                  >
                    <Text style={styles.menuItemLabel}>Import / Export</Text>
                  </Pressable>
                  <View style={styles.menuDivider} />
                  <Pressable
                    style={({ hovered, pressed }: PressableState) => [
                      styles.menuItem,
                      (hovered || pressed) && styles.menuItemActive,
                    ]}
                    onPress={() => setThemeMenuOpen(prev => !prev)}
                  >
                    <View style={styles.menuItemRow}>
                      <Text style={styles.menuItemLabel}>Theme</Text>
                      <Text style={styles.menuItemHint}>
                        {themeMenuOpen ? 'v' : '>'}
                      </Text>
                    </View>
                  </Pressable>
                  {themeMenuOpen ? (
                    <View style={styles.submenu}>
                      <Text style={styles.menuSectionLabel}>Theme</Text>
                      <View style={styles.menuThemeOptions}>
                        {THEME_OPTIONS.map(option => {
                          const active = themePref === option.key;
                          return (
                            <Pressable
                              key={option.key}
                              onPress={() => updateThemePref(option.key)}
                              style={({ hovered, pressed }: PressableState) => [
                                styles.menuThemeButton,
                                active && styles.menuThemeButtonActive,
                                (hovered || pressed) &&
                                  styles.menuThemeButtonHover,
                              ]}
                            >
                              <Text
                                style={[
                                  styles.menuThemeButtonLabel,
                                  active && styles.menuThemeButtonLabelActive,
                                ]}
                              >
                                {option.label}
                              </Text>
                            </Pressable>
                          );
                        })}
                      </View>
                    </View>
                  ) : null}
                  <View style={styles.menuDivider} />
                  <Pressable
                    style={({ hovered, pressed }: PressableState) => [
                      styles.menuItem,
                      (hovered || pressed) && styles.menuItemActive,
                    ]}
                    onPress={openAbout}
                  >
                    <Text style={styles.menuItemLabel}>About</Text>
                  </Pressable>
                </ScrollView>
              </View>
            </>
          )}

          <KeyboardAvoidingView
            style={styles.inner}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          >
            <ScrollView
              style={styles.list}
              showsVerticalScrollIndicator={false}
              scrollEnabled={!draggedStationId}
            >
              {stations.map((item, index) => renderStation({ item, index }))}
            </ScrollView>
          </KeyboardAvoidingView>

          <View
            style={[styles.bottomBar, { paddingBottom: INSETS.bottom + 8 }]}
          >
            <View
              style={styles.nowPlayingInfo}
            >
              <Text
                style={styles.nowPlayingTitle}
                numberOfLines={1}
                ellipsizeMode="tail"
              >
                {activeStation ? activeStation.name : 'No station selected'}
              </Text>
              <Text
                style={styles.nowPlayingSubtitle}
                numberOfLines={1}
                ellipsizeMode="tail"
              >
                {statusLabel}
              </Text>
            </View>
            <TouchableOpacity
              onPress={handlePrimaryControl}
              disabled={!activeStation}
              style={[
                styles.button,
                playbackState === 'playing' || playbackState === 'loading'
                  ? styles.secondaryButton
                  : styles.primaryButton,
                styles.controlButton,
                !activeStation && styles.disabledButton,
              ]}
              accessibilityLabel={
                playbackState === 'playing' || playbackState === 'loading'
                  ? 'Stop'
                  : 'Play'
              }
            >
              <Text style={styles.controlIcon}>{controlIcon}</Text>
            </TouchableOpacity>
          </View>

          {showVolumePanel && activeStation && (
            <View style={styles.volumePanel}>
              <View style={styles.volumeHeader}>
                <Text style={styles.volumeLabel}>Volume</Text>
                <Text style={styles.volumeValue}>
                  {Math.round(volume * 100)}%
                </Text>
              </View>
              <View style={styles.volumeSliderContainer}>
                <TouchableOpacity
                  onPress={() => handleVolumeChange(0)}
                  style={styles.volumeIcon}
                >
                  <Text style={styles.volumeIconText}>🔈</Text>
                </TouchableOpacity>
                <View style={styles.volumeTrack}>
                  <View
                    style={[styles.volumeFill, { width: `${volume * 100}%` }]}
                  />
                  <Pressable
                    style={styles.volumeSliderTouch}
                    onPress={e => {
                      const { locationX } = e.nativeEvent;
                      const trackWidth = 200;
                      const newVolume = Math.max(
                        0,
                        Math.min(1, locationX / trackWidth)
                      );
                      handleVolumeChange(newVolume);
                    }}
                  />
                </View>
                <TouchableOpacity
                  onPress={() => handleVolumeChange(1)}
                  style={styles.volumeIcon}
                >
                  <Text style={styles.volumeIconText}>🔊</Text>
                </TouchableOpacity>
              </View>
              <View style={styles.volumePresets}>
                {[0, 0.25, 0.5, 0.75, 1].map(preset => (
                  <TouchableOpacity
                    key={preset}
                    style={[
                      styles.volumePreset,
                      Math.abs(volume - preset) < 0.05 &&
                        styles.volumePresetActive,
                    ]}
                    onPress={() => handleVolumeChange(preset)}
                  >
                    <Text style={styles.volumePresetLabel}>
                      {Math.round(preset * 100)}%
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <TouchableOpacity
                style={styles.volumeClose}
                onPress={() => setShowVolumePanel(false)}
              >
                <Text style={styles.volumeCloseLabel}>Done</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>

      <Modal
        visible={showAddModal}
        animationType="slide"
        transparent
        onRequestClose={closeStationModal}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>
              {editingStation ? 'Edit a station' : 'Add a station'}
            </Text>
            <TextInput
              placeholder="Station name"
              value={nameInput}
              onChangeText={setNameInput}
              style={styles.input}
              placeholderTextColor="#94a3b8"
            />
            <TextInput
              placeholder="Stream URL"
              value={urlInput}
              onChangeText={setUrlInput}
              style={styles.input}
              autoCapitalize="none"
              placeholderTextColor="#94a3b8"
            />
            {formError ? <Text style={styles.error}>{formError}</Text> : null}
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.button, styles.secondaryButton]}
                onPress={closeStationModal}
              >
                <Text style={styles.buttonLabel}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.button, styles.primaryButton]}
                onPress={handleSaveStation}
              >
                <Text style={styles.buttonLabel}>
                  {editingStation ? 'Update' : 'Save'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={aboutVisible}
        animationType="fade"
        transparent
        onRequestClose={closeAbout}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.infoCard}>
            <Text style={styles.modalTitle}>About Radiolla</Text>
            <Text style={styles.infoBody}>
              Absolute Freakout keeps your curated streams close at hand with
              fast theme switching and compact VIP controls.
            </Text>
            <Text style={styles.infoMeta}>Version {APP_VERSION}</Text>
            <View style={styles.linkList}>
              <Pressable
                style={({ hovered, pressed }: PressableState) => [
                  styles.linkRow,
                  (hovered || pressed) && styles.linkRowActive,
                ]}
                onPress={() => openExternalLink(GITHUB_URL)}
              >
                <Text style={styles.linkLabel}>GitHub repo</Text>
                <Text style={styles.linkHint}>{GITHUB_URL}</Text>
              </Pressable>
              <Pressable
                style={({ hovered, pressed }: PressableState) => [
                  styles.linkRow,
                  (hovered || pressed) && styles.linkRowActive,
                ]}
                onPress={() => openExternalLink(AF_URL)}
              >
                <Text style={styles.linkLabel}>AbsoluteFreakout.com</Text>
                <Text style={styles.linkHint}>{AF_URL}</Text>
              </Pressable>
            </View>
            <TouchableOpacity
              style={[styles.button, styles.primaryButton]}
              onPress={closeAbout}
            >
              <Text style={styles.buttonLabel}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal
        visible={!!unexpectedError}
        animationType="fade"
        transparent
        onRequestClose={dismissUnexpectedError}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.infoCard}>
            <Text style={styles.modalTitle}>Unexpected error</Text>
            <Text style={styles.infoBody}>{unexpectedError}</Text>
            <TouchableOpacity
              style={[styles.button, styles.primaryButton]}
              onPress={dismissUnexpectedError}
            >
              <Text style={styles.buttonLabel}>Dismiss</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal
        visible={showImportModal}
        animationType="slide"
        transparent
        onRequestClose={() => setShowImportModal(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Import / Export</Text>
            <Text style={styles.cardSubtitle}>
              Import M3U/PLS files or export your stations.
            </Text>

            {importStatus ? (
              <Text
                style={{
                  color: '#10b981',
                  marginVertical: 10,
                  textAlign: 'center',
                }}
              >
                {importStatus}
              </Text>
            ) : null}

            <TouchableOpacity
              style={[
                styles.button,
                styles.primaryButton,
                { marginBottom: 10 },
              ]}
              onPress={handleImportFile}
            >
              <Text style={styles.buttonLabel}>📂 Import File (M3U/PLS)</Text>
            </TouchableOpacity>

            <View style={{ flexDirection: 'row', gap: 10, marginBottom: 10 }}>
              <TouchableOpacity
                style={[styles.button, styles.secondaryButton, { flex: 1 }]}
                onPress={handleExportM3U}
              >
                <Text style={styles.buttonLabel}>Save M3U</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.button, styles.secondaryButton, { flex: 1 }]}
                onPress={handleExportPLS}
              >
                <Text style={styles.buttonLabel}>Save PLS</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={{ alignSelf: 'center', marginTop: 5 }}
              onPress={() => setShowImportModal(false)}
            >
              <Text style={styles.cardSubtitle}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const createStyles = (palette: Palette) =>
  StyleSheet.create({
    activeCard: {
      borderColor: palette.accentStrong,
    },
    appFrame: {
      backgroundColor: palette.background,
      flex: 1,
      maxWidth: 500,
      overflow: 'hidden',
      width: '100%',
    },
    bottomBar: {
      alignItems: 'center',
      backgroundColor: palette.surface,
      borderTopColor: palette.border,
      borderTopWidth: 1,
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingHorizontal: 14,
      paddingVertical: 8,
    },
    button: {
      alignItems: 'center',
      borderRadius: 4,
      flexGrow: 1,
      justifyContent: 'center',
      minWidth: 0,
      paddingHorizontal: 10,
      paddingVertical: 7,
    },
    buttonLabel: {
      color: palette.textPrimary,
      fontFamily: fonts.bold,
      fontWeight: '700',
    },
    card: {
      backgroundColor: palette.surface,
      borderColor: palette.border,
      borderRadius: 4,
      borderStyle: 'dashed',
      borderWidth: 1,
      marginBottom: 12,
      paddingBottom: 8,
      paddingHorizontal: 8,
      paddingTop: 10,
    },
    cardMain: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: 8,
      justifyContent: 'space-between',
    },
    cardMenuButton: {
      alignItems: 'center',
      backgroundColor: palette.surface,
      borderColor: palette.border,
      borderRadius: 8,
      borderWidth: 1,
      height: 32,
      justifyContent: 'center',
      width: 32,
    },
    cardMenuButtonActive: {
      backgroundColor: palette.accentSoft,
      borderColor: palette.accentStrong,
    },
    cardMenuIcon: {
      color: palette.textPrimary,
      fontFamily: fonts.bold,
      fontSize: 16,
    },
    cardMenuItem: {
      paddingHorizontal: 12,
      paddingVertical: 10,
    },
    cardMenuItemActive: {
      backgroundColor: palette.accentSoft,
    },
    cardMenuLabel: {
      color: palette.textPrimary,
      fontFamily: fonts.bold,
      fontSize: 13,
    },
    cardMenuSheet: {
      backgroundColor: palette.surface,
      borderColor: palette.borderStrong,
      borderRadius: 10,
      borderWidth: 1,
      marginTop: 8,
      overflow: 'hidden',
    },
    cardSubtitle: {
      color: palette.textSecondary,
      fontFamily: fonts.regular,
      fontSize: 10,
    },
    cardText: {
      flex: 1,
      gap: 2,
    },
    cardTitle: {
      color: palette.textPrimary,
      fontFamily: fonts.bold,
      fontSize: 14,
      fontWeight: '700',
    },
    container: {
      backgroundColor: Platform.OS === 'web' ? '#000' : palette.background,
      flex: 1, // Darker bg for web outer
    },
    controlButton: {
      alignSelf: 'flex-end',
      borderRadius: 10,
      flexGrow: 0,
      height: 46,
      marginLeft: 12,
      paddingHorizontal: 0,
      paddingVertical: 0,
      width: 46,
    },
    controlIcon: {
      color: palette.textPrimary,
      fontFamily: fonts.bold,
      fontSize: 18,
    },
    destructiveButton: {
      backgroundColor: palette.destructiveSoft,
      borderColor: palette.destructiveStrong,
      borderStyle: 'dashed',
      borderWidth: 1,
    },
    destructiveLabel: {
      color: '#b02a3c',
    },
    disabledButton: {
      opacity: 0.5,
    },
    error: {
      color: '#b02a3c',
      fontFamily: fonts.medium,
      fontSize: 14,
      marginBottom: 4,
      paddingTop: 2,
    },
    heading: {
      color: palette.textPrimary,
      fontFamily: fonts.bold,
      fontSize: 21,
      fontWeight: '700',
    },
    headingBadge: {
      color: palette.textSecondary,
      fontFamily: fonts.medium,
      fontSize: 10,
      letterSpacing: 1,
      marginTop: 1,
      textTransform: 'uppercase',
    },
    infoBody: {
      color: palette.textSecondary,
      fontFamily: fonts.regular,
      fontSize: 13,
    },
    infoCard: {
      alignSelf: 'center',
      backgroundColor: palette.surface,
      borderColor: palette.borderStrong,
      borderRadius: 10,
      borderStyle: 'dashed',
      borderWidth: 1,
      gap: 10,
      maxWidth: 320,
      padding: 16,
    },
    infoMeta: {
      color: palette.textSecondary,
      fontFamily: fonts.medium,
      fontSize: 12,
    },
    inner: {
      flex: 1,
      paddingHorizontal: 12,
      paddingTop: 12,
    },
    input: {
      backgroundColor: palette.background,
      borderColor: palette.border,
      borderRadius: 4,
      borderWidth: 1,
      color: palette.textPrimary,
      fontFamily: fonts.regular,
      paddingHorizontal: 9,
      paddingVertical: 7,
    },
    linkHint: {
      color: palette.textSecondary,
      fontFamily: fonts.regular,
      fontSize: 12,
    },
    linkLabel: {
      color: palette.textPrimary,
      fontFamily: fonts.bold,
      fontSize: 13,
    },
    linkList: {
      gap: 8,
    },
    linkRow: {
      backgroundColor: palette.surface,
      borderColor: palette.border,
      borderRadius: 8,
      borderWidth: 1,
      gap: 2,
      paddingHorizontal: 10,
      paddingVertical: 8,
    },
    linkRowActive: {
      backgroundColor: palette.accentSoft,
      borderColor: palette.accentStrong,
    },
    list: {
      paddingBottom: 92,
      paddingTop: 2,
    },
    menuBackdrop: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: palette.overlay,
      zIndex: 10,
    },
    menuButton: {
      alignItems: 'center',
      backgroundColor: palette.surface,
      borderColor: palette.border,
      borderRadius: 6,
      borderWidth: 1,
      gap: 4,
      height: 34,
      justifyContent: 'center',
      paddingVertical: 6,
      width: 38,
    },
    menuContent: {
      gap: 12,
      paddingBottom: 4,
    },
    menuDivider: {
      borderBottomWidth: 1,
      borderColor: palette.border,
      borderStyle: 'dashed',
      marginVertical: 4,
      opacity: 0.7,
    },
    menuHeader: {
      gap: 2,
      paddingBottom: 4,
    },
    menuHeaderEmail: {
      color: palette.textPrimary,
      fontFamily: fonts.bold,
      fontSize: 13,
      marginBottom: 4,
    },
    menuHeaderLabel: {
      color: palette.textSecondary,
      fontFamily: fonts.medium,
      fontSize: 10,
      letterSpacing: 0.5,
      textTransform: 'uppercase',
    },
    menuIconLine: {
      backgroundColor: palette.textPrimary,
      borderRadius: 1,
      height: 2,
      width: 16,
    },
    menuItem: {
      borderRadius: 6,
      paddingHorizontal: 10,
      paddingVertical: 8,
    },
    menuItemActive: {
      backgroundColor: palette.accentSoft,
    },
    menuItemDestructive: {
      backgroundColor: palette.destructiveSoft,
      borderColor: palette.destructiveStrong,
      borderStyle: 'dashed',
      borderWidth: 1,
      marginTop: 4,
    },
    menuItemDestructiveActive: {
      backgroundColor: palette.destructiveStrong,
    },
    menuItemHint: {
      color: palette.textSecondary,
      fontFamily: fonts.medium,
      fontSize: 12,
    },
    menuItemLabel: {
      color: palette.textPrimary,
      fontFamily: fonts.bold,
      fontSize: 14,
    },
    menuItemPrimary: {
      backgroundColor: palette.accentSoft,
      borderColor: palette.accentStrong,
      borderStyle: 'dashed',
      borderWidth: 1,
      marginTop: 4,
    },
    menuItemPrimaryActive: {
      backgroundColor: palette.accentStrong,
    },
    menuItemRow: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: 12,
      justifyContent: 'space-between',
    },
    menuPanel: {
      backgroundColor: palette.surface,
      borderColor: palette.borderStrong,
      borderRadius: 10,
      borderStyle: 'dashed',
      borderWidth: 1,
      elevation: 6,
      gap: 12,
      maxHeight: '75%',
      padding: 12,
      position: 'absolute',
      right: 14,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.25,
      shadowRadius: 8,
      top: 54,
      width: 210,
      zIndex: 11,
    },
    menuSection: {
      gap: 6,
    },
    menuSectionLabel: {
      color: palette.textSecondary,
      fontFamily: fonts.medium,
      fontSize: 11,
      letterSpacing: 1,
      textTransform: 'uppercase',
    },
    menuSpacer: {
      flex: 1,
      minHeight: 10,
    },
    menuThemeButton: {
      backgroundColor: palette.surface,
      borderColor: palette.border,
      borderRadius: 4,
      borderWidth: 1,
      paddingHorizontal: 10,
      paddingVertical: 6,
    },
    menuThemeButtonActive: {
      backgroundColor: palette.accentSoft,
      borderColor: palette.accentStrong,
    },
    menuThemeButtonHover: {
      backgroundColor: palette.accentSoft,
      borderColor: palette.accentStrong,
    },
    menuThemeButtonLabel: {
      color: palette.textSecondary,
      fontFamily: fonts.medium,
      fontSize: 12,
    },
    menuThemeButtonLabelActive: {
      color: palette.textPrimary,
    },
    menuThemeOptions: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 6,
    },
    modalActions: {
      flexDirection: 'row',
      gap: 8,
      justifyContent: 'flex-end',
    },
    modalBackdrop: {
      alignItems: 'center',
      backgroundColor: palette.overlay,
      flex: 1,
      justifyContent: 'center',
      padding: 16,
    },
    modalCard: {
      backgroundColor: palette.surface,
      borderColor: palette.borderStrong,
      borderRadius: 6,
      borderStyle: 'dashed',
      borderWidth: 1,
      gap: 6,
      maxWidth: 420,
      minWidth: 300,
      padding: 12,
      width: '90%',
    },
    modalTitle: {
      color: palette.textPrimary,
      fontFamily: fonts.bold,
      fontSize: 17,
      fontWeight: '700',
    },
    nowPlayingInfo: {
      flex: 1,
      paddingRight: 12,
    },
    nowPlayingSubtitle: {
      color: palette.textSecondary,
      fontFamily: fonts.regular,
      fontSize: 12,
    },
    nowPlayingTitle: {
      color: palette.textPrimary,
      fontFamily: fonts.bold,
      fontSize: 14,
      fontWeight: '700',
    },
    playingCard: {
      backgroundColor: palette.accentSoft,
    },
    draggingCard: {
      opacity: 0.5,
      backgroundColor: palette.neutral,
    },
    draggedOverCard: {
      borderTopWidth: 2,
      borderTopColor: palette.accentStrong,
      marginTop: 8,
    },
    primaryButton: {
      backgroundColor: palette.accentSoft,
      borderColor: palette.accentStrong,
      borderStyle: 'dashed',
      borderWidth: 1,
    },
    primaryLabel: {
      color: palette.textPrimary,
    },
    secondaryButton: {
      backgroundColor: palette.neutral,
      borderColor: palette.border,
      borderStyle: 'dashed',
      borderWidth: 1,
    },
    subhead: {
      color: palette.textSecondary,
      fontFamily: fonts.regular,
      fontSize: 13,
      paddingBottom: 4,
    },
    submenu: {
      backgroundColor: palette.background,
      borderColor: palette.border,
      borderRadius: 8,
      borderWidth: 1,
      gap: 8,
      padding: 10,
    },
    themeOption: {
      borderColor: palette.border,
      borderRightWidth: 1,
      paddingHorizontal: 12,
      paddingVertical: 6,
    },
    themeOptionActive: {
      backgroundColor: palette.accentSoft,
    },
    themeOptionLabel: {
      color: palette.textSecondary,
      fontFamily: fonts.medium,
      fontSize: 11,
      letterSpacing: 1,
      textTransform: 'uppercase',
    },
    themeOptionLabelActive: {
      color: palette.textPrimary,
    },
    themeOptionLast: {
      borderRightWidth: 0,
    },
    themeSwitch: {
      alignSelf: 'flex-start',
      backgroundColor: palette.surface,
      borderColor: palette.border,
      borderRadius: 6,
      borderWidth: 1,
      flexDirection: 'row',
      marginBottom: 8,
      overflow: 'hidden',
    },
    topBar: {
      alignItems: 'center',
      backgroundColor: palette.surface,
      borderBottomColor: palette.border,
      borderBottomWidth: 1,
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingBottom: 8,
      paddingHorizontal: 14,
      paddingTop: 6,
    },
    volumeClose: {
      alignItems: 'center',
      backgroundColor: palette.accentSoft,
      borderColor: palette.accentStrong,
      borderRadius: 6,
      borderStyle: 'dashed',
      borderWidth: 1,
      paddingVertical: 10,
    },
    volumeCloseLabel: {
      color: palette.textPrimary,
      fontFamily: fonts.bold,
      fontSize: 13,
      fontWeight: '700',
    },
    volumeFill: {
      backgroundColor: palette.accentStrong,
      borderRadius: 4,
      bottom: 0,
      left: 0,
      position: 'absolute',
      top: 0,
    },
    volumeHeader: {
      alignItems: 'center',
      flexDirection: 'row',
      justifyContent: 'space-between',
    },
    volumeIcon: {
      padding: 4,
    },
    volumeIconText: {
      fontSize: 18,
    },
    volumeLabel: {
      color: palette.textPrimary,
      fontFamily: fonts.bold,
      fontSize: 14,
      fontWeight: '700',
    },
    volumePanel: {
      backgroundColor: palette.surface,
      borderColor: palette.borderStrong,
      borderRadius: 10,
      borderStyle: 'dashed',
      borderWidth: 1,
      bottom: 70,
      elevation: 8,
      gap: 12,
      left: 14,
      padding: 14,
      position: 'absolute',
      right: 14,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: -2 },
      shadowOpacity: 0.2,
      shadowRadius: 8,
    },
    volumePreset: {
      alignItems: 'center',
      backgroundColor: palette.background,
      borderColor: palette.border,
      borderRadius: 6,
      borderWidth: 1,
      flex: 1,
      paddingVertical: 8,
    },
    volumePresetActive: {
      backgroundColor: palette.accentSoft,
      borderColor: palette.accentStrong,
    },
    volumePresetLabel: {
      color: palette.textSecondary,
      fontFamily: fonts.medium,
      fontSize: 11,
    },
    volumePresets: {
      flexDirection: 'row',
      gap: 6,
      justifyContent: 'space-between',
    },
    volumeSliderContainer: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: 10,
    },
    volumeSliderTouch: {
      ...StyleSheet.absoluteFillObject,
    },
    volumeTrack: {
      backgroundColor: palette.neutral,
      borderRadius: 4,
      flex: 1,
      height: 8,
      overflow: 'hidden',
      position: 'relative',
    },
    volumeValue: {
      color: palette.textSecondary,
      fontFamily: fonts.medium,
      fontSize: 13,
    },
    webWrapper: {
      alignItems: 'center',
      flex: 1,
      justifyContent: 'center',
      width: '100%',
    },
  });
