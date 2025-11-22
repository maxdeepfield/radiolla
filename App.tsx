import React, { useEffect, useRef, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
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

const defaultStations: Station[] = [

];

const PLAYBACK_CATEGORY_ID = 'playback';
const STOP_ACTION_ID = 'stop-playback';

export default function App() {
  const [stations, setStations] = useState<Station[]>(defaultStations);
  const [nameInput, setNameInput] = useState('');
  const [urlInput, setUrlInput] = useState('');
  const [currentStation, setCurrentStation] = useState<Station | null>(null);
  const [lastStation, setLastStation] = useState<Station | null>(null);
  const [playbackState, setPlaybackState] = useState<'idle' | 'loading' | 'playing'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [notificationsAllowed, setNotificationsAllowed] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const soundRef = useRef<Audio.Sound | null>(null);
  const playbackNotificationIdRef = useRef<string | null>(null);
  const responseListenerRef = useRef<Subscription | null>(null);
  const stopPlaybackRef = useRef<() => Promise<void>>(async () => undefined);

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
    };

    bootstrap();

    return () => {
      stopPlayback();
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

  const playStation = async (station: Station) => {
    setError(null);
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
      setError('Unable to play the stream. Check the URL and try again.');
    }
  };

  const handleAddStation = async () => {
    setFormError(null);
    if (!nameInput.trim() || !urlInput.trim()) {
      setFormError('Name and stream URL are required.');
      return;
    }
    if (!/^https?:\/\//i.test(urlInput.trim())) {
      setFormError('Stream URL should start with http or https.');
      return;
    }
    const newStation: Station = {
      id: Date.now().toString(),
      name: nameInput.trim(),
      url: urlInput.trim(),
    };
    const next = [...stations, newStation];
    await persistStations(next);
    setNameInput('');
    setUrlInput('');
    setShowAddModal(false);
    sendNotification('Station added', newStation.name);
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
  };

  const renderStation = ({ item }: { item: Station }) => {
    const isCurrent = currentStation?.id === item.id;
    const isSelected = isCurrent || (!currentStation && lastStation?.id === item.id);
    const playing = isCurrent && playbackState === 'playing';
    return (
      <View style={[styles.card, isSelected && styles.activeCard]}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle}>{item.name}</Text>
          <Text style={styles.cardSubtitle} numberOfLines={1}>
            {item.url}
          </Text>
        </View>
        <View style={styles.cardActions}>
          <TouchableOpacity
            style={[styles.button, playing ? styles.secondaryButton : styles.primaryButton]}
            onPress={() => (playing ? stopPlayback() : playStation(item))}
          >
            <Text style={styles.buttonLabel}>{playing ? 'Stop' : 'Play'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.button, styles.destructiveButton]} onPress={() => handleRemove(item.id)}>
            <Text style={styles.buttonLabel}>Remove</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const openAddModal = () => {
    setFormError(null);
    setShowAddModal(true);
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

  const activeStation = currentStation || lastStation;
  const statusLabel =
    playbackState === 'loading'
      ? 'Buffering...'
      : playbackState === 'playing'
        ? 'Streaming'
        : activeStation
          ? 'Stopped'
          : 'Idle';

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="dark" />
      <View style={styles.topBar}>
        <Text style={styles.heading}>Radiolla</Text>
        <TouchableOpacity style={styles.iconButton} onPress={openAddModal}>
          <Text style={styles.iconButtonLabel}>+</Text>
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView style={styles.inner} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Text style={styles.subhead}>Keep stream URLs handy and jump back in quickly.</Text>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <FlatList
          data={stations}
          renderItem={renderStation}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
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

      <Modal visible={showAddModal} animationType="slide" transparent onRequestClose={() => setShowAddModal(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Add a station</Text>
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
              <TouchableOpacity style={[styles.button, styles.secondaryButton]} onPress={() => setShowAddModal(false)}>
                <Text style={styles.buttonLabel}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.button, styles.primaryButton]} onPress={handleAddStation}>
                <Text style={styles.buttonLabel}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    backgroundColor: '#ffffff',
  },
  heading: {
    fontSize: 22,
    fontWeight: '700',
    color: '#0f172a',
  },
  iconButton: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#e5e7eb',
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  iconButtonLabel: {
    fontSize: 20,
    fontWeight: '700',
    color: '#0f172a',
  },
  inner: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  subhead: {
    fontSize: 14,
    color: '#475569',
    paddingBottom: 8,
  },
  list: {
    paddingTop: 6,
    paddingBottom: 150,
    gap: 10,
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 12,
    gap: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  activeCard: {
    borderColor: '#2563eb',
  },
  cardHeader: {
    gap: 2,
  },
  cardTitle: {
    color: '#0f172a',
    fontSize: 16,
    fontWeight: '700',
  },
  cardSubtitle: {
    color: '#475569',
    fontSize: 12,
  },
  cardActions: {
    flexDirection: 'row',
    gap: 10,
  },
  button: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButton: {
    backgroundColor: '#dbeafe',
    borderWidth: 1,
    borderColor: '#bfdbfe',
  },
  secondaryButton: {
    backgroundColor: '#e5e7eb',
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  destructiveButton: {
    backgroundColor: '#fee2e2',
    borderWidth: 1,
    borderColor: '#fecdd3',
  },
  buttonLabel: {
    color: '#0f172a',
    fontWeight: '700',
  },
  error: {
    color: '#b91c1c',
    fontSize: 14,
    paddingTop: 4,
    marginBottom: 6,
  },
  bottomBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
    backgroundColor: '#ffffff',
  },
  nowPlayingInfo: {
    flex: 1,
    paddingRight: 12,
  },
  nowPlayingTitle: {
    color: '#0f172a',
    fontSize: 15,
    fontWeight: '700',
  },
  nowPlayingSubtitle: {
    color: '#475569',
    fontSize: 13,
  },
  controlButton: {
    minWidth: 96,
  },
  disabledButton: {
    opacity: 0.5,
  },
  input: {
    backgroundColor: '#f8fafc',
    borderColor: '#e5e7eb',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#0f172a',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.25)',
    justifyContent: 'center',
    padding: 16,
  },
  modalCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 16,
    gap: 10,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  modalTitle: {
    color: '#0f172a',
    fontSize: 18,
    fontWeight: '700',
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
  },
});
