import React, { useEffect, useMemo, useRef, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { useFonts, RobotoCondensed_400Regular, RobotoCondensed_500Medium, RobotoCondensed_700Bold } from '@expo-google-fonts/roboto-condensed';
import {
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useColorScheme,
  View,
} from 'react-native';
import { Audio, InterruptionModeAndroid, InterruptionModeIOS } from 'expo-av';
import * as Notifications from 'expo-notifications';
import { Subscription } from 'expo-modules-core';
import AsyncStorage from '@react-native-async-storage/async-storage';

type Station = {
  id: string;
  name: string;
  url: string;
};

const STORAGE_KEY = 'radiolla:stations';

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

const THEME_STORAGE_KEY = 'radiolla:theme-pref';

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
  const [contextStationId, setContextStationId] = useState<string | null>(null);
  const [streamError, setStreamError] = useState<string | null>(null);
  const [editingStation, setEditingStation] = useState<Station | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [aboutVisible, setAboutVisible] = useState(false);
  const [unexpectedError, setUnexpectedError] = useState<string | null>(null);
  const soundRef = useRef<Audio.Sound | null>(null);
  const playbackNotificationIdRef = useRef<string | null>(null);
  const responseListenerRef = useRef<Subscription | null>(null);
  const stopPlaybackRef = useRef<() => Promise<void>>(async () => undefined);

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

    return () => {
      stopPlayback();
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
      // ignore persistence errors and keep in-memory list
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
      if (responseListenerRef.current) {
        Notifications.removeNotificationSubscription(responseListenerRef.current);
      }
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

  const toggleMenu = () => setMenuOpen((prev) => !prev);
  const closeMenu = () => setMenuOpen(false);

  const renderStation = ({ item }: { item: Station }) => {
    const isCurrent = currentStation?.id === item.id;
    const playing = isCurrent && playbackState === 'playing';
    const highlighted = isCurrent && (playbackState === 'playing' || playbackState === 'loading');
    const showActions = contextStationId === item.id;
    return (
      <TouchableOpacity
        activeOpacity={0.95}
        onPress={() => handleStationPress(item)}
        onLongPress={() => toggleStationMenu(item.id)}
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
        </View>
        {showActions ? (
          <View style={styles.contextRow}>
            <TouchableOpacity style={[styles.contextButton, styles.secondaryButton]} onPress={() => openEditModal(item)}>
              <Text style={styles.buttonLabel}>Edit</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.contextButton, styles.destructiveButton]}
              onPress={() => {
                closeStationMenu();
                handleRemove(item.id);
              }}
            >
              <Text style={styles.buttonLabel}>Remove</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.contextButton, styles.secondaryButton]} onPress={closeStationMenu}>
              <Text style={styles.buttonLabel}>Close</Text>
            </TouchableOpacity>
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

  const closeAbout = () => setAboutVisible(false);
  const dismissUnexpectedError = () => setUnexpectedError(null);

  const handlePrimaryControl = () => {
    const target = currentStation || lastStation;
    if (!target) return;
    if (playbackState === 'playing' || playbackState === 'loading') {
      stopPlayback();
    } else {
      playStation(target);
    }
  };

  const activeStation = currentStation || lastStation;
  let statusLabel = 'Ready';
  if (playbackState === 'loading') {
    statusLabel = 'Buffering...';
  } else if (playbackState === 'playing') {
    statusLabel = 'Streaming';
  } else if (activeStation) {
    statusLabel = streamError ? `Stopped · ${streamError}` : 'Stopped';
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style={statusBarStyle} />
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
            <TouchableOpacity style={styles.menuItem} onPress={openAddModal}>
              <Text style={styles.menuItemLabel}>Add station</Text>
            </TouchableOpacity>
            <View style={styles.menuSection}>
              <Text style={styles.menuSectionLabel}>Theme</Text>
              <View style={styles.menuThemeOptions}>
                {THEME_OPTIONS.map((option) => {
                  const active = themePref === option.key;
                  return (
                    <TouchableOpacity
                      key={option.key}
                      onPress={() => updateThemePref(option.key)}
                      style={[styles.menuThemeButton, active && styles.menuThemeButtonActive]}
                    >
                      <Text style={[styles.menuThemeButtonLabel, active && styles.menuThemeButtonLabelActive]}>
                        {option.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
            <TouchableOpacity style={styles.menuItem} onPress={openAbout}>
              <Text style={styles.menuItemLabel}>About</Text>
            </TouchableOpacity>
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
        <View style={styles.nowPlayingInfo}>
          <Text style={styles.nowPlayingTitle} numberOfLines={1} ellipsizeMode="tail">
            {activeStation ? activeStation.name : 'No station selected'}
          </Text>
          <Text style={styles.nowPlayingSubtitle} numberOfLines={1} ellipsizeMode="tail">
            {statusLabel}
          </Text>
        </View>
        <TouchableOpacity
          onPress={handlePrimaryControl}
          disabled={!activeStation}
          style={[
            styles.button,
            playbackState === 'playing' || playbackState === 'loading' ? styles.secondaryButton : styles.primaryButton,
            styles.controlButton,
            !activeStation && styles.disabledButton,
          ]}
        >
          <Text style={styles.buttonLabel}>
            {playbackState === 'playing' || playbackState === 'loading' ? 'Stop' : 'Play'}
          </Text>
        </TouchableOpacity>
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
    </SafeAreaView>
  );
}

const createStyles = (palette: Palette) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: palette.background,
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
      backgroundColor: palette.surface,
      borderWidth: 1,
      borderColor: palette.borderStrong,
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
    menuItem: {
      paddingVertical: 6,
    },
    menuItemLabel: {
      color: palette.textPrimary,
      fontFamily: fonts.bold,
      fontSize: 14,
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
    inner: {
      flex: 1,
      paddingHorizontal: 12,
      paddingTop: 2,
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
      padding: 10,
      borderWidth: 1,
      borderColor: palette.border,
      marginBottom: 8,
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
    },
    secondaryButton: {
      backgroundColor: palette.neutral,
      borderWidth: 1,
      borderColor: palette.border,
    },
    destructiveButton: {
      backgroundColor: palette.destructiveSoft,
      borderWidth: 1,
      borderColor: palette.destructiveStrong,
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
    contextRow: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      gap: 6,
      marginTop: 6,
      flexWrap: 'wrap',
    },
    contextButton: {
      paddingVertical: 6,
      paddingHorizontal: 12,
      borderRadius: 4,
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
      minWidth: 90,
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
      padding: 16,
    },
    modalCard: {
      backgroundColor: palette.surface,
      borderRadius: 6,
      padding: 12,
      gap: 6,
      borderWidth: 1,
      borderColor: palette.borderStrong,
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
    },
    infoBody: {
      color: palette.textSecondary,
      fontFamily: fonts.regular,
      fontSize: 13,
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
  });
