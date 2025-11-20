import React, { useEffect, useRef, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import {
  FlatList,
  KeyboardAvoidingView,
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
  const [playbackState, setPlaybackState] = useState<'idle' | 'loading' | 'playing'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [notificationsAllowed, setNotificationsAllowed] = useState(false);
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
      setCurrentStation(station);
      setPlaybackState('playing');
      await showPlaybackNotification(station);
      await sendNotification('Now playing', station.name);
    } catch (err) {
      setPlaybackState('idle');
      setError('Unable to play the stream. Check the URL and try again.');
    }
  };

  const handleAddStation = async () => {
    setError(null);
    if (!nameInput.trim() || !urlInput.trim()) {
      setError('Name and stream URL are required.');
      return;
    }
    if (!/^https?:\/\//i.test(urlInput.trim())) {
      setError('Stream URL should start with http or https.');
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
    sendNotification('Station added', newStation.name);
  };

  const handleRemove = async (id: string) => {
    const next = stations.filter((s) => s.id !== id);
    await persistStations(next);
    if (currentStation?.id === id) {
      stopPlayback();
    }
  };

  const renderStation = ({ item }: { item: Station }) => {
    const isCurrent = currentStation?.id === item.id;
    const playing = isCurrent && playbackState === 'playing';
    return (
      <View style={[styles.card, isCurrent && styles.activeCard]}>
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

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="dark" />
      <KeyboardAvoidingView style={styles.inner} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Text style={styles.heading}>Radiolla</Text>
        <Text style={styles.subhead}>Manage stream URLs, play, pause, and get notifications.</Text>

        <View style={styles.inputCard}>
          <Text style={styles.label}>Add a Stream</Text>
          <TextInput
            placeholder="Station name"
            value={nameInput}
            onChangeText={setNameInput}
            style={styles.input}
            placeholderTextColor="#777"
          />
          <TextInput
            placeholder="Stream URL"
            value={urlInput}
            onChangeText={setUrlInput}
            style={styles.input}
            autoCapitalize="none"
            placeholderTextColor="#777"
          />
          <TouchableOpacity style={[styles.button, styles.primaryButton]} onPress={handleAddStation}>
            <Text style={styles.buttonLabel}>Save</Text>
          </TouchableOpacity>
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <View style={styles.nowPlaying}>
          <Text style={styles.label}>Now Playing</Text>
          {currentStation ? (
            <View>
              <Text style={styles.nowPlayingTitle}>{currentStation.name}</Text>
              <Text style={styles.nowPlayingSubtitle}>{playbackState === 'playing' ? 'Streaming' : 'Buffering...'}</Text>
              <TouchableOpacity style={[styles.button, styles.secondaryButton]} onPress={stopPlayback}>
                <Text style={styles.buttonLabel}>Stop</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <Text style={styles.nowPlayingSubtitle}>Idle</Text>
          )}
        </View>

        <FlatList
          data={stations}
          renderItem={renderStation}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
        />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  inner: {
    flex: 1,
    paddingHorizontal: 16,
    paddingVertical: 24,
    gap: 12,
  },
  heading: {
    fontSize: 28,
    fontWeight: '700',
    color: '#e2e8f0',
  },
  subhead: {
    fontSize: 14,
    color: '#cbd5e1',
    marginBottom: 8,
  },
  inputCard: {
    backgroundColor: '#111827',
    borderRadius: 16,
    padding: 14,
    gap: 10,
    borderWidth: 1,
    borderColor: '#1f2937',
  },
  label: {
    color: '#e2e8f0',
    fontSize: 16,
    fontWeight: '600',
  },
  input: {
    backgroundColor: '#0b1220',
    borderColor: '#1f2937',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#e5e7eb',
  },
  button: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButton: {
    backgroundColor: '#22d3ee',
  },
  secondaryButton: {
    backgroundColor: '#334155',
  },
  destructiveButton: {
    backgroundColor: '#ef4444',
  },
  buttonLabel: {
    color: '#0b1220',
    fontWeight: '700',
  },
  error: {
    color: '#fca5a5',
    fontSize: 14,
    marginBottom: 6,
  },
  nowPlaying: {
    backgroundColor: '#111827',
    borderRadius: 16,
    padding: 14,
    gap: 8,
    borderWidth: 1,
    borderColor: '#1f2937',
  },
  nowPlayingTitle: {
    color: '#e2e8f0',
    fontSize: 18,
    fontWeight: '700',
  },
  nowPlayingSubtitle: {
    color: '#cbd5e1',
    fontSize: 14,
    marginBottom: 6,
  },
  list: {
    paddingBottom: 80,
    gap: 10,
  },
  card: {
    backgroundColor: '#111827',
    borderRadius: 14,
    padding: 12,
    gap: 8,
    borderWidth: 1,
    borderColor: '#1f2937',
  },
  activeCard: {
    borderColor: '#22d3ee',
  },
  cardHeader: {
    gap: 4,
  },
  cardTitle: {
    color: '#e2e8f0',
    fontSize: 16,
    fontWeight: '700',
  },
  cardSubtitle: {
    color: '#cbd5e1',
    fontSize: 13,
  },
  cardActions: {
    flexDirection: 'row',
    gap: 10,
  },
});
