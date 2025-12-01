import React, { useEffect, useMemo, useRef, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { useFonts, RobotoCondensed_400Regular, RobotoCondensed_500Medium, RobotoCondensed_700Bold } from '@expo-google-fonts/roboto-condensed';
import {
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useColorScheme,
  View,
  Linking,
} from 'react-native';
import { Audio, InterruptionModeAndroid, InterruptionModeIOS } from 'expo-av';
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import appConfig from './app.json';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { parsePlaylist, generateM3U, generatePLS } from './utils/playlist';

// Add this import for Electron IPC handling
let ipcRenderer: any = null;
if (Platform.OS === 'web') {
  // In Electron environment, ipcRenderer is exposed globally
  ipcRenderer = (window as any).ipcRenderer || null;
}

export type Station = {
  id: string;
  name: string;
  url: string;
};

const STORAGE_KEY = 'Radiolla:stations';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

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

const PLAYBACK_CATEGORY_ID = 'playback';
const STOP_ACTION_ID = 'stop-playback';

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
  const [playbackState, setPlaybackState] = useState<'idle' | 'loading' | 'playing'>('idle');
  const [formError, setFormError] = useState<string | null>(null);
  const [notificationsAllowed, setNotificationsAllowed] = useState(false);
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

  // Import/Export State
  const [showImportModal, setShowImportModal] = useState(false);
  const [importStatus, setImportStatus] = useState<string | null>(null);

  const soundRef = useRef<Audio.Sound | null>(null);
  const playbackNotificationIdRef = useRef<string | null>(null);
  const responseListenerRef = useRef<any>(null);
  const stopPlaybackRef = useRef<() => Promise<void>>(async () => undefined);
  const primaryControlRef = useRef<() => void>(() => {});
  const trayPlayRef = useRef<() => void>(() => {});
  const trayMuteRef = useRef<() => void>(() => {});
  const lastVolumeRef = useRef(1);

  const resolvedTheme = themePref === 'auto' ? (systemScheme === 'dark' ? 'dark' : 'light') : themePref;
  const palette = palettes[resolvedTheme];
  const styles = useMemo(() => createStyles(palette), [palette]);
  const statusBarStyle = resolvedTheme === 'dark' ? 'light' : 'dark';

  useEffect(() => {
    const bootstrap = async () => {
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        staysActiveInBackground: true,
        playsInSilentModeIOS: true,
        shouldDuckAndroid: true,
        playThroughEarpieceAndroid: false,
        interruptionModeAndroid: InterruptionModeAndroid.DuckOthers,
        interruptionModeIOS: InterruptionModeIOS.DuckOthers,
      });
      await ensureNotificationPermissions();
      await loadStoredStations();
      await loadThemePref();
    };

    bootstrap();

    // Add IPC listener for Electron tray controls
    let ipcListener: any = null;
    if (ipcRenderer) {
      ipcListener = (_event: any, action: string) => {
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

    return () => {
      stopPlayback();
      // Clean up IPC listener
      if (ipcRenderer && ipcListener) {
        ipcRenderer.removeListener('playback-control', ipcListener);
      }
    };
  }, []);

  useEffect(() => {
    const globalErrorUtils = (globalThis as any).ErrorUtils;
    let previousHandler: ((error: Error, isFatal?: boolean) => void) | null = null;
    if (globalErrorUtils?.getGlobalHandler && globalErrorUtils?.setGlobalHandler) {
      previousHandler = globalErrorUtils.getGlobalHandler();
      globalErrorUtils.setGlobalHandler((error: Error, isFatal?: boolean) => {
        setUnexpectedError(error?.message ?? 'Something went wrong.');
        if (previousHandler) {
          previousHandler(error, isFatal);
        }
      });
    }

    const handleWindowError = (event: any) => {
      setUnexpectedError(event?.error?.message ?? event?.message ?? 'Something went wrong.');
    };
    const handleRejection = (event: any) => {
      const reason = event?.reason?.message ?? String(event?.reason ?? '');
      setUnexpectedError(reason || 'Something went wrong.');
    };
    if (typeof window !== 'undefined') {
      window.addEventListener('error', handleWindowError);
      window.addEventListener('unhandledrejection', handleRejection);
    }

    return () => {
      if (globalErrorUtils?.setGlobalHandler && previousHandler) {
        globalErrorUtils.setGlobalHandler(previousHandler);
      }
      if (typeof window !== 'undefined') {
        window.removeEventListener('error', handleWindowError);
        window.removeEventListener('unhandledrejection', handleRejection);
      }
    };
  }, []);

  const ensureNotificationPermissions = async () => {
    const existing = await Notifications.getPermissionsAsync();
    if (existing.status !== 'granted') {
      const requested = await Notifications.requestPermissionsAsync();
      setNotificationsAllowed(requested.status === 'granted');
    } else {
      setNotificationsAllowed(true);
    }

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('playback', {
        name: 'Playback',
        importance: Notifications.AndroidImportance.DEFAULT,
      });
      await Notifications.setNotificationCategoryAsync(PLAYBACK_CATEGORY_ID, [
        {
          identifier: STOP_ACTION_ID,
          buttonTitle: 'Stop',
          options: { isDestructive: true },
        },
      ]);
    }
  };

  useEffect(() => {
    loadStoredStations();
  }, []);

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

  const sendNotification = async (title: string, body?: string) => {
    if (!notificationsAllowed) return;
    try {
      await Notifications.scheduleNotificationAsync({
        content: { title, body, sound: null },
        trigger: null,
      });
    } catch {
      // ignore notification failures to avoid blocking playback
    }
  };

  const dismissPlaybackNotification = async () => {
    const id = playbackNotificationIdRef.current;
    playbackNotificationIdRef.current = null;
    if (!id) return;
    try {
      await Notifications.dismissNotificationAsync(id);
    } catch {
      // ignore dismiss errors
    }
  };

  const showPlaybackNotification = async (station: Station) => {
    if (!notificationsAllowed || Platform.OS !== 'android') return;
    await dismissPlaybackNotification();
    try {
      const id = await Notifications.scheduleNotificationAsync({
        content: {
          title: 'Now playing',
          body: station.name,
          categoryIdentifier: PLAYBACK_CATEGORY_ID,
          sound: null,
          sticky: true,
        },
        trigger: null,
      });
      playbackNotificationIdRef.current = id;
    } catch {
      // ignore notification failures to avoid blocking playback
    }
  };

  const stopPlayback = async () => {
    const sound = soundRef.current;
    if (sound) {
      try {
        await sound.stopAsync();
        await sound.unloadAsync();
      } catch {
        // ignore
      }
    }
    soundRef.current = null;
    await dismissPlaybackNotification();
    setPlaybackState('idle');
    setCurrentStation(null);
    sendNotification('Playback stopped');
  };

  stopPlaybackRef.current = stopPlayback;

  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      if (response.actionIdentifier === STOP_ACTION_ID) {
        stopPlaybackRef.current();
      }
    });
    responseListenerRef.current = sub;
    return () => {
      // Notification subscription cleanup handled automatically
      responseListenerRef.current = null;
    };
  }, []);

  if (!fontsLoaded) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar style="dark" />
      </SafeAreaView>
    );
  }

  const playStation = async (station: Station) => {
    setStreamError(null);
    setPlaybackState('loading');
    setLastStation(station);
    setCurrentStation(station);
    try {
      if (soundRef.current) {
        await soundRef.current.unloadAsync();
      }
      const { sound } = await Audio.Sound.createAsync(
        { uri: station.url },
        { shouldPlay: true },
        (status) => {
          if (!status.isLoaded) return;
          if (status.isPlaying) setPlaybackState('playing');
          if (status.didJustFinish) {
            setPlaybackState('idle');
            setCurrentStation(null);
          }
        },
      );
      soundRef.current = sound;
      setPlaybackState('playing');
      await showPlaybackNotification(station);
      await sendNotification('Now playing', station.name);
    } catch (err) {
      setPlaybackState('idle');
      setCurrentStation(null);
      setStreamError('Unable to play the stream. Check the URL and try again.');
    }
  };

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
      const updated: Station = { ...editingStation, name: nameInput.trim(), url: urlInput.trim() };
      const next = stations.map((station) => (station.id === editingStation.id ? updated : station));
      await persistStations(next);
      if (currentStation?.id === editingStation.id) {
        setCurrentStation(updated);
      }
      if (lastStation?.id === editingStation.id) {
        setLastStation(updated);
      }
      setEditingStation(null);
      sendNotification('Station updated', updated.name);
    } else {
      const newStation: Station = {
        id: Date.now().toString(),
        name: nameInput.trim(),
        url: urlInput.trim(),
      };
      const next = [...stations, newStation];
      await persistStations(next);
      sendNotification('Station added', newStation.name);
    }
    setNameInput('');
    setUrlInput('');
    closeStationModal();
  };

  const handleRemove = async (id: string) => {
    const next = stations.filter((s) => s.id !== id);
    await persistStations(next);
    if (currentStation?.id === id) {
      await stopPlayback();
    }
    if (lastStation?.id === id) {
      setLastStation(null);
    }
    setContextStationId((current) => (current === id ? null : current));
  };

  const toggleStationMenu = (id: string) => {
    setContextStationId((current) => (current === id ? null : id));
  };

  const closeStationMenu = () => setContextStationId(null);

  const handleStationPress = (station: Station) => {
    closeStationMenu();
    if (currentStation?.id === station.id && (playbackState === 'playing' || playbackState === 'loading')) {
      stopPlayback();
    } else {
      playStation(station);
    }
  };

  const toggleMenu = () =>
    setMenuOpen((prev) => {
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

  const renderStation = ({ item }: { item: Station }) => {
    const isCurrent = currentStation?.id === item.id;
    const playing = isCurrent && playbackState === 'playing';
    const highlighted = isCurrent && (playbackState === 'playing' || playbackState === 'loading');
    const showActions = contextStationId === item.id;
    return (
      <TouchableOpacity
        activeOpacity={0.95}
        onPress={() => handleStationPress(item)}
        style={[styles.card, highlighted && styles.activeCard, playing && styles.playingCard]}
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
            style={({ hovered, pressed }) => [
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
              style={({ hovered, pressed }) => [
                styles.cardMenuItem,
                (hovered || pressed) && styles.cardMenuItemActive,
              ]}
              onPress={() => openEditModal(item)}
            >
              <Text style={styles.cardMenuLabel}>Edit</Text>
            </Pressable>
            <View style={styles.menuDivider} />
            <Pressable
              style={({ hovered, pressed }) => [
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
              style={({ hovered, pressed }) => [
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
        type: Platform.OS === 'web' ? '.m3u,.pls' : ['audio/x-mpegurl', 'audio/mpegurl', 'audio/x-scpls', '*/*'],
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
      setImportStatus(`Imported ${allNewStations.length} stations from ${files.length} file${files.length > 1 ? 's' : ''}!`);
      sendNotification(`Imported ${allNewStations.length} stations`);
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

  const downloadFile = async (content: string, filename: string, mimeType: string) => {
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
      await FileSystem.writeAsStringAsync(fileUri, content, { encoding: FileSystem.EncodingType.UTF8 });
      await Sharing.shareAsync(fileUri, {
        mimeType,
        dialogTitle: `Save ${filename}`,
      });
    }
  };

  const toggleVolumePanel = () => {
    if (activeStation) {
      setShowVolumePanel((prev) => !prev);
    }
  };

  const handleVolumeChange = async (newVolume: number) => {
    setVolume(newVolume);
    setIsMuted(newVolume === 0);
    if (newVolume > 0) {
      lastVolumeRef.current = newVolume;
    }
    if (soundRef.current) {
      try {
        await soundRef.current.setVolumeAsync(newVolume);
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
    statusLabel = 'Streaming';
  } else if (activeStation) {
    statusLabel = streamError ? `Stopped · ${streamError}` : 'Stopped';
  }
  const controlIcon = playbackState === 'playing' || playbackState === 'loading' ? '■' : '▶';

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style={statusBarStyle} />

      <View style={styles.webWrapper}>
        <View style={styles.appFrame}>
          <View style={styles.topBar}>
            <View>
              <Text style={styles.heading}>Radiolla</Text>
              <Text style={styles.headingBadge}>Absolute Freakout</Text>
            </View>
            <TouchableOpacity style={styles.menuButton} onPress={toggleMenu} activeOpacity={0.8}>
              <View style={styles.menuIconLine} />
              <View style={styles.menuIconLine} />
              <View style={styles.menuIconLine} />
            </TouchableOpacity>
          </View>

          {menuOpen && (
            <>
              <TouchableOpacity style={styles.menuBackdrop} activeOpacity={1} onPress={closeMenu} />
              <View style={styles.menuPanel}>
                <ScrollView contentContainerStyle={styles.menuContent} showsVerticalScrollIndicator={false} bounces={false}>
                  {/* Removed User Email Header */}

                  <Pressable
                    style={({ hovered, pressed }) => [
                      styles.menuItem,
                      (hovered || pressed) && styles.menuItemActive,
                    ]}
                    onPress={openAddModal}
                  >
                    <Text style={styles.menuItemLabel}>Add station</Text>
                  </Pressable>
                  <View style={styles.menuDivider} />
                  <Pressable
                    style={({ hovered, pressed }) => [
                      styles.menuItem,
                      (hovered || pressed) && styles.menuItemActive,
                    ]}
                    onPress={openImportModal}
                  >
                    <Text style={styles.menuItemLabel}>Import / Export</Text>
                  </Pressable>
                  <View style={styles.menuDivider} />
                  <Pressable
                    style={({ hovered, pressed }) => [
                      styles.menuItem,
                      (hovered || pressed) && styles.menuItemActive,
                    ]}
                    onPress={() => setThemeMenuOpen((prev) => !prev)}
                  >
                    <View style={styles.menuItemRow}>
                      <Text style={styles.menuItemLabel}>Theme</Text>
                      <Text style={styles.menuItemHint}>{themeMenuOpen ? 'v' : '>'}</Text>
                    </View>
                  </Pressable>
                  {themeMenuOpen ? (
                    <View style={styles.submenu}>
                      <Text style={styles.menuSectionLabel}>Theme</Text>
                      <View style={styles.menuThemeOptions}>
                        {THEME_OPTIONS.map((option) => {
                          const active = themePref === option.key;
                          return (
                            <Pressable
                              key={option.key}
                              onPress={() => updateThemePref(option.key)}
                              style={({ hovered, pressed }) => [
                                styles.menuThemeButton,
                                active && styles.menuThemeButtonActive,
                                (hovered || pressed) && styles.menuThemeButtonHover,
                              ]}
                            >
                              <Text style={[styles.menuThemeButtonLabel, active && styles.menuThemeButtonLabelActive]}>
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
                    style={({ hovered, pressed }) => [
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

          <KeyboardAvoidingView style={styles.inner} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <FlatList
              data={stations}
              renderItem={renderStation}
              keyExtractor={(item) => item.id}
              extraData={{ contextStationId, currentId: currentStation?.id, playbackState }}
              contentContainerStyle={styles.list}
              showsVerticalScrollIndicator={false}
            />
          </KeyboardAvoidingView>

          <View style={styles.bottomBar}>
            <TouchableOpacity
              style={styles.nowPlayingInfo}
              onPress={toggleVolumePanel}
              activeOpacity={activeStation ? 0.7 : 1}
              disabled={!activeStation}
            >
              <Text style={styles.nowPlayingTitle} numberOfLines={1} ellipsizeMode="tail">
                {activeStation ? activeStation.name : 'No station selected'}
              </Text>
              <Text style={styles.nowPlayingSubtitle} numberOfLines={1} ellipsizeMode="tail">
                {statusLabel}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handlePrimaryControl}
              disabled={!activeStation}
              style={[
                styles.button,
                playbackState === 'playing' || playbackState === 'loading' ? styles.secondaryButton : styles.primaryButton,
                styles.controlButton,
                !activeStation && styles.disabledButton,
              ]}
              accessibilityLabel={playbackState === 'playing' || playbackState === 'loading' ? 'Stop' : 'Play'}
            >
              <Text style={styles.controlIcon}>{controlIcon}</Text>
            </TouchableOpacity>
          </View>

          {showVolumePanel && activeStation && (
            <View style={styles.volumePanel}>
              <View style={styles.volumeHeader}>
                <Text style={styles.volumeLabel}>Volume</Text>
                <Text style={styles.volumeValue}>{Math.round(volume * 100)}%</Text>
              </View>
              <View style={styles.volumeSliderContainer}>
                <TouchableOpacity onPress={() => handleVolumeChange(0)} style={styles.volumeIcon}>
                  <Text style={styles.volumeIconText}>🔈</Text>
                </TouchableOpacity>
                <View style={styles.volumeTrack}>
                  <View style={[styles.volumeFill, { width: `${volume * 100}%` }]} />
                  <Pressable
                    style={styles.volumeSliderTouch}
                    onPress={(e) => {
                      const { locationX } = e.nativeEvent;
                      const trackWidth = 200;
                      const newVolume = Math.max(0, Math.min(1, locationX / trackWidth));
                      handleVolumeChange(newVolume);
                    }}
                  />
                </View>
                <TouchableOpacity onPress={() => handleVolumeChange(1)} style={styles.volumeIcon}>
                  <Text style={styles.volumeIconText}>🔊</Text>
                </TouchableOpacity>
              </View>
              <View style={styles.volumePresets}>
                {[0, 0.25, 0.5, 0.75, 1].map((preset) => (
                  <TouchableOpacity
                    key={preset}
                    style={[styles.volumePreset, Math.abs(volume - preset) < 0.05 && styles.volumePresetActive]}
                    onPress={() => handleVolumeChange(preset)}
                  >
                    <Text style={styles.volumePresetLabel}>{Math.round(preset * 100)}%</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <TouchableOpacity style={styles.volumeClose} onPress={() => setShowVolumePanel(false)}>
                <Text style={styles.volumeCloseLabel}>Done</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>

      <Modal visible={showAddModal} animationType="slide" transparent onRequestClose={closeStationModal}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{editingStation ? 'Edit a station' : 'Add a station'}</Text>
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
              <TouchableOpacity style={[styles.button, styles.secondaryButton]} onPress={closeStationModal}>
                <Text style={styles.buttonLabel}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.button, styles.primaryButton]} onPress={handleSaveStation}>
                <Text style={styles.buttonLabel}>{editingStation ? 'Update' : 'Save'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={aboutVisible} animationType="fade" transparent onRequestClose={closeAbout}>
        <View style={styles.modalBackdrop}>
          <View style={styles.infoCard}>
            <Text style={styles.modalTitle}>About Radiolla</Text>
            <Text style={styles.infoBody}>
              Absolute Freakout keeps your curated streams close at hand with fast theme switching and compact VIP
              controls.
            </Text>
            <Text style={styles.infoMeta}>Version {APP_VERSION}</Text>
            <View style={styles.linkList}>
              <Pressable
                style={({ hovered, pressed }) => [
                  styles.linkRow,
                  (hovered || pressed) && styles.linkRowActive,
                ]}
                onPress={() => openExternalLink(GITHUB_URL)}
              >
                <Text style={styles.linkLabel}>GitHub repo</Text>
                <Text style={styles.linkHint}>{GITHUB_URL}</Text>
              </Pressable>
              <Pressable
                style={({ hovered, pressed }) => [
                  styles.linkRow,
                  (hovered || pressed) && styles.linkRowActive,
                ]}
                onPress={() => openExternalLink(AF_URL)}
              >
                <Text style={styles.linkLabel}>AbsoluteFreakout.com</Text>
                <Text style={styles.linkHint}>{AF_URL}</Text>
              </Pressable>
            </View>
            <TouchableOpacity style={[styles.button, styles.primaryButton]} onPress={closeAbout}>
              <Text style={styles.buttonLabel}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={!!unexpectedError} animationType="fade" transparent onRequestClose={dismissUnexpectedError}>
        <View style={styles.modalBackdrop}>
          <View style={styles.infoCard}>
            <Text style={styles.modalTitle}>Unexpected error</Text>
            <Text style={styles.infoBody}>{unexpectedError}</Text>
            <TouchableOpacity style={[styles.button, styles.primaryButton]} onPress={dismissUnexpectedError}>
              <Text style={styles.buttonLabel}>Dismiss</Text>
            </TouchableOpacity>
          </View>
        </View>

      </Modal>

      <Modal visible={showImportModal} animationType="slide" transparent onRequestClose={() => setShowImportModal(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Import / Export</Text>
            <Text style={styles.cardSubtitle}>Import M3U/PLS files or export your stations.</Text>

            {importStatus ? <Text style={{ color: '#10b981', marginVertical: 10, textAlign: 'center' }}>{importStatus}</Text> : null}

            <TouchableOpacity style={[styles.button, styles.primaryButton, { marginBottom: 10 }]} onPress={handleImportFile}>
              <Text style={styles.buttonLabel}>📂 Import File (M3U/PLS)</Text>
            </TouchableOpacity>

            <View style={{ flexDirection: 'row', gap: 10, marginBottom: 10 }}>
              <TouchableOpacity style={[styles.button, styles.secondaryButton, { flex: 1 }]} onPress={handleExportM3U}>
                <Text style={styles.buttonLabel}>Save M3U</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.button, styles.secondaryButton, { flex: 1 }]} onPress={handleExportPLS}>
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

    </SafeAreaView>
  );
}

const createStyles = (palette: Palette) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: Platform.OS === 'web' ? '#000' : palette.background, // Darker bg for web outer
    },
    webWrapper: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      width: '100%',
    },
    appFrame: {
      flex: 1,
      width: '100%',
      maxWidth: 500,
      backgroundColor: palette.background,
      overflow: 'hidden',
    },
    topBar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 14,
      paddingTop: 6,
      paddingBottom: 8,
      borderBottomWidth: 1,
      borderBottomColor: palette.border,
      backgroundColor: palette.surface,
    },
    heading: {
      fontSize: 21,
      fontWeight: '700',
      color: palette.textPrimary,
      fontFamily: fonts.bold,
    },
    headingBadge: {
      fontSize: 10,
      letterSpacing: 1,
      textTransform: 'uppercase',
      color: palette.textSecondary,
      marginTop: 1,
      fontFamily: fonts.medium,
    },
    menuButton: {
      width: 38,
      height: 34,
      borderRadius: 6,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: palette.surface,
      borderWidth: 1,
      borderColor: palette.border,
      gap: 4,
      paddingVertical: 6,
    },
    menuIconLine: {
      width: 16,
      height: 2,
      borderRadius: 1,
      backgroundColor: palette.textPrimary,
    },
    menuBackdrop: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: palette.overlay,
      zIndex: 10,
    },
    menuPanel: {
      position: 'absolute',
      top: 54,
      right: 14,
      width: 210,
      maxHeight: '75%',
      backgroundColor: palette.surface,
      borderWidth: 1,
      borderColor: palette.borderStrong,
      borderStyle: 'dashed',
      borderRadius: 10,
      padding: 12,
      gap: 12,
      shadowColor: '#000',
      shadowOpacity: 0.25,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 4 },
      elevation: 6,
      zIndex: 11,
    },
    menuContent: {
      gap: 12,
      paddingBottom: 4,
    },
    menuItem: {
      paddingVertical: 8,
      borderRadius: 6,
      paddingHorizontal: 10,
    },
    menuItemActive: {
      backgroundColor: palette.accentSoft,
    },
    menuItemDestructive: {
      marginTop: 4,
      backgroundColor: palette.destructiveSoft,
      borderWidth: 1,
      borderColor: palette.destructiveStrong,
      borderStyle: 'dashed',
    },
    menuItemDestructiveActive: {
      backgroundColor: palette.destructiveStrong,
    },
    menuItemPrimary: {
      marginTop: 4,
      backgroundColor: palette.accentSoft,
      borderWidth: 1,
      borderColor: palette.accentStrong,
      borderStyle: 'dashed',
    },
    menuItemPrimaryActive: {
      backgroundColor: palette.accentStrong,
    },
    menuItemLabel: {
      color: palette.textPrimary,
      fontFamily: fonts.bold,
      fontSize: 14,
    },
    destructiveLabel: {
      color: '#b02a3c',
    },
    primaryLabel: {
      color: palette.textPrimary,
    },
    menuHeader: {
      paddingBottom: 4,
      gap: 2,
    },
    menuHeaderLabel: {
      fontSize: 10,
      textTransform: 'uppercase',
      color: palette.textSecondary,
      fontFamily: fonts.medium,
      letterSpacing: 0.5,
    },
    menuHeaderEmail: {
      fontSize: 13,
      color: palette.textPrimary,
      fontFamily: fonts.bold,
      marginBottom: 4,
    },
    menuSpacer: {
      flex: 1,
      minHeight: 10,
    },
    menuItemRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
    },
    menuItemHint: {
      color: palette.textSecondary,
      fontFamily: fonts.medium,
      fontSize: 12,
    },
    menuSection: {
      gap: 6,
    },
    menuSectionLabel: {
      fontSize: 11,
      letterSpacing: 1,
      textTransform: 'uppercase',
      color: palette.textSecondary,
      fontFamily: fonts.medium,
    },
    submenu: {
      padding: 10,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: palette.border,
      backgroundColor: palette.background,
      gap: 8,
    },
    menuThemeOptions: {
      flexDirection: 'row',
      gap: 6,
      flexWrap: 'wrap',
    },
    menuThemeButton: {
      paddingVertical: 6,
      paddingHorizontal: 10,
      borderRadius: 4,
      borderWidth: 1,
      borderColor: palette.border,
      backgroundColor: palette.surface,
    },
    menuThemeButtonHover: {
      backgroundColor: palette.accentSoft,
      borderColor: palette.accentStrong,
    },
    menuThemeButtonActive: {
      borderColor: palette.accentStrong,
      backgroundColor: palette.accentSoft,
    },
    menuThemeButtonLabel: {
      fontSize: 12,
      color: palette.textSecondary,
      fontFamily: fonts.medium,
    },
    menuThemeButtonLabelActive: {
      color: palette.textPrimary,
    },
    menuDivider: {
      borderBottomWidth: 1,
      borderColor: palette.border,
      borderStyle: 'dashed',
      marginVertical: 4,
      opacity: 0.7,
    },
    inner: {
      flex: 1,
      paddingHorizontal: 12,
      paddingTop: 12,
    },
    subhead: {
      fontSize: 13,
      color: palette.textSecondary,
      paddingBottom: 4,
      fontFamily: fonts.regular,
    },
    themeSwitch: {
      flexDirection: 'row',
      borderWidth: 1,
      borderColor: palette.border,
      borderRadius: 6,
      overflow: 'hidden',
      alignSelf: 'flex-start',
      marginBottom: 8,
      backgroundColor: palette.surface,
    },
    themeOption: {
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRightWidth: 1,
      borderColor: palette.border,
    },
    themeOptionLast: {
      borderRightWidth: 0,
    },
    themeOptionActive: {
      backgroundColor: palette.accentSoft,
    },
    themeOptionLabel: {
      fontSize: 11,
      letterSpacing: 1,
      textTransform: 'uppercase',
      color: palette.textSecondary,
      fontFamily: fonts.medium,
    },
    themeOptionLabelActive: {
      color: palette.textPrimary,
    },
    list: {
      paddingTop: 2,
      paddingBottom: 92,
    },
    card: {
      backgroundColor: palette.surface,
      borderRadius: 4,
      paddingTop: 10,
      paddingHorizontal: 8,
      paddingBottom: 8,
      borderWidth: 1,
      borderColor: palette.border,
      borderStyle: 'dashed',
      marginBottom: 12,
    },
    activeCard: {
      borderColor: palette.accentStrong,
    },
    playingCard: {
      backgroundColor: palette.accentSoft,
    },
    cardMain: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
    },
    cardText: {
      flex: 1,
      gap: 2,
    },
    cardTitle: {
      color: palette.textPrimary,
      fontSize: 14,
      fontWeight: '700',
      fontFamily: fonts.bold,
    },
    cardSubtitle: {
      color: palette.textSecondary,
      fontSize: 10,
      fontFamily: fonts.regular,
    },
    cardMenuButton: {
      width: 32,
      height: 32,
      borderRadius: 8,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: palette.border,
      backgroundColor: palette.surface,
    },
    cardMenuButtonActive: {
      borderColor: palette.accentStrong,
      backgroundColor: palette.accentSoft,
    },
    cardMenuIcon: {
      color: palette.textPrimary,
      fontSize: 16,
      fontFamily: fonts.bold,
    },
    button: {
      paddingVertical: 7,
      paddingHorizontal: 10,
      borderRadius: 4,
      alignItems: 'center',
      justifyContent: 'center',
      flexGrow: 1,
      minWidth: 0,
    },
    primaryButton: {
      backgroundColor: palette.accentSoft,
      borderWidth: 1,
      borderColor: palette.accentStrong,
      borderStyle: 'dashed',
    },
    secondaryButton: {
      backgroundColor: palette.neutral,
      borderWidth: 1,
      borderColor: palette.border,
      borderStyle: 'dashed',
    },
    destructiveButton: {
      backgroundColor: palette.destructiveSoft,
      borderWidth: 1,
      borderColor: palette.destructiveStrong,
      borderStyle: 'dashed',
    },
    buttonLabel: {
      color: palette.textPrimary,
      fontWeight: '700',
      fontFamily: fonts.bold,
    },
    error: {
      color: '#b02a3c',
      fontSize: 14,
      paddingTop: 2,
      marginBottom: 4,
      fontFamily: fonts.medium,
    },
    cardMenuSheet: {
      marginTop: 8,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: palette.borderStrong,
      backgroundColor: palette.surface,
      overflow: 'hidden',
    },
    cardMenuItem: {
      paddingVertical: 10,
      paddingHorizontal: 12,
    },
    cardMenuItemActive: {
      backgroundColor: palette.accentSoft,
    },
    cardMenuLabel: {
      color: palette.textPrimary,
      fontFamily: fonts.bold,
      fontSize: 13,
    },
    bottomBar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderTopWidth: 1,
      borderTopColor: palette.border,
      backgroundColor: palette.surface,
    },
    nowPlayingInfo: {
      flex: 1,
      paddingRight: 12,
    },
    nowPlayingTitle: {
      color: palette.textPrimary,
      fontSize: 14,
      fontWeight: '700',
      fontFamily: fonts.bold,
    },
    nowPlayingSubtitle: {
      color: palette.textSecondary,
      fontSize: 12,
      fontFamily: fonts.regular,
    },
    controlButton: {
      width: 46,
      height: 46,
      paddingHorizontal: 0,
      paddingVertical: 0,
      borderRadius: 10,
      flexGrow: 0,
      alignSelf: 'flex-end',
      marginLeft: 12,
    },
    controlIcon: {
      color: palette.textPrimary,
      fontSize: 18,
      fontFamily: fonts.bold,
    },
    disabledButton: {
      opacity: 0.5,
    },
    input: {
      backgroundColor: palette.background,
      borderColor: palette.border,
      borderWidth: 1,
      borderRadius: 4,
      paddingHorizontal: 9,
      paddingVertical: 7,
      color: palette.textPrimary,
      fontFamily: fonts.regular,
    },
    modalBackdrop: {
      flex: 1,
      backgroundColor: palette.overlay,
      justifyContent: 'center',
      alignItems: 'center',
      padding: 16,
    },
    modalCard: {
      backgroundColor: palette.surface,
      borderRadius: 6,
      padding: 12,
      gap: 6,
      borderWidth: 1,
      borderColor: palette.borderStrong,
      width: '90%',
      maxWidth: 420,
      minWidth: 300,
      borderStyle: 'dashed',
    },
    infoCard: {
      backgroundColor: palette.surface,
      borderRadius: 10,
      padding: 16,
      gap: 10,
      borderWidth: 1,
      borderColor: palette.borderStrong,
      maxWidth: 320,
      alignSelf: 'center',
      borderStyle: 'dashed',
    },
    infoBody: {
      color: palette.textSecondary,
      fontFamily: fonts.regular,
      fontSize: 13,
    },
    infoMeta: {
      color: palette.textSecondary,
      fontFamily: fonts.medium,
      fontSize: 12,
    },
    linkList: {
      gap: 8,
    },
    linkRow: {
      borderWidth: 1,
      borderColor: palette.border,
      borderRadius: 8,
      paddingVertical: 8,
      paddingHorizontal: 10,
      backgroundColor: palette.surface,
      gap: 2,
    },
    linkRowActive: {
      borderColor: palette.accentStrong,
      backgroundColor: palette.accentSoft,
    },
    linkLabel: {
      color: palette.textPrimary,
      fontFamily: fonts.bold,
      fontSize: 13,
    },
    linkHint: {
      color: palette.textSecondary,
      fontFamily: fonts.regular,
      fontSize: 12,
    },
    modalTitle: {
      color: palette.textPrimary,
      fontSize: 17,
      fontWeight: '700',
      fontFamily: fonts.bold,
    },
    modalActions: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      gap: 8,
    },
    volumePanel: {
      position: 'absolute',
      bottom: 70,
      left: 14,
      right: 14,
      backgroundColor: palette.surface,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: palette.borderStrong,
      borderStyle: 'dashed',
      padding: 14,
      gap: 12,
      shadowColor: '#000',
      shadowOpacity: 0.2,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: -2 },
      elevation: 8,
    },
    volumeHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    volumeLabel: {
      color: palette.textPrimary,
      fontSize: 14,
      fontWeight: '700',
      fontFamily: fonts.bold,
    },
    volumeValue: {
      color: palette.textSecondary,
      fontSize: 13,
      fontFamily: fonts.medium,
    },
    volumeSliderContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    volumeIcon: {
      padding: 4,
    },
    volumeIconText: {
      fontSize: 18,
    },
    volumeTrack: {
      flex: 1,
      height: 8,
      backgroundColor: palette.neutral,
      borderRadius: 4,
      overflow: 'hidden',
      position: 'relative',
    },
    volumeFill: {
      position: 'absolute',
      left: 0,
      top: 0,
      bottom: 0,
      backgroundColor: palette.accentStrong,
      borderRadius: 4,
    },
    volumeSliderTouch: {
      ...StyleSheet.absoluteFillObject,
    },
    volumePresets: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      gap: 6,
    },
    volumePreset: {
      flex: 1,
      paddingVertical: 8,
      borderRadius: 6,
      borderWidth: 1,
      borderColor: palette.border,
      backgroundColor: palette.background,
      alignItems: 'center',
    },
    volumePresetActive: {
      borderColor: palette.accentStrong,
      backgroundColor: palette.accentSoft,
    },
    volumePresetLabel: {
      color: palette.textSecondary,
      fontSize: 11,
      fontFamily: fonts.medium,
    },
    volumeClose: {
      paddingVertical: 10,
      borderRadius: 6,
      backgroundColor: palette.accentSoft,
      borderWidth: 1,
      borderColor: palette.accentStrong,
      borderStyle: 'dashed',
      alignItems: 'center',
    },
    volumeCloseLabel: {
      color: palette.textPrimary,
      fontSize: 13,
      fontWeight: '700',
      fontFamily: fonts.bold,
    },
  });
