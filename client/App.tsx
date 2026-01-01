import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { StatusBar } from 'expo-status-bar';
import {
  useFonts,
  RobotoCondensed_400Regular,
  RobotoCondensed_500Medium,
  RobotoCondensed_700Bold,
} from '@expo-google-fonts/roboto-condensed';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  View,
  Image,
} from 'react-native';

import { SettingsProvider, useSettings } from './context/SettingsContext';
import { StationsProvider, useStations } from './context/StationsContext';
import { AudioProvider, useAudio } from './context/AudioContext';
import type { Station } from './context/StationsContext';

import {
  Header,
  SearchBar,
  StationCard,
  PlayerBar,
  Menu,
  AddStationModal,
  AboutModal,
  ErrorModal,
  ImportExportModal,
  SettingsModal,
} from './components';

// Import auth and sync services
import authService, { User } from '../services/authService';
import syncService from '../services/syncService';

function AppContent() {
  const { styles, statusBarStyle } = useSettings();
  const {
    stations,
    addStation,
    updateStation,
    removeStation,
    reorderStations,
    clearStations,
    setStationsFromSync,
    isLoaded,
  } = useStations();
  const {
    currentStation,
    lastStation,
    playbackState,
    playStation,
    stopPlayback,
  } = useAudio();

  // UI State
  const [menuOpen, setMenuOpen] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [filterText, setFilterText] = useState('');
  const [showVolumeSlider, setShowVolumeSlider] = useState(false);
  const [contextStationId, setContextStationId] = useState<string | null>(null);

  // Modal State
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingStation, setEditingStation] = useState<Station | null>(null);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [aboutVisible, setAboutVisible] = useState(false);
  const [unexpectedError, setUnexpectedError] = useState<string | null>(null);

  // Drag and drop state
  const [draggedStationId, setDraggedStationId] = useState<string | null>(null);
  const [draggedOverIndex, setDraggedOverIndex] = useState<number | null>(null);

  // Auth state
  const [currentUser, setCurrentUser] = useState<User | null>(null);

  const filteredStations = useMemo(() => {
    if (!filterText.trim()) return stations;
    const lower = filterText.toLowerCase();
    return stations.filter(s => s.name.toLowerCase().includes(lower));
  }, [stations, filterText]);

  /**
   * Perform sync with cloud storage.
   * Called on sign-in and when network is restored.
   * @requirements 2.1, 2.2, 2.3, 2.4 - Initial Sync on Sign-In
   */
  const performSync = useCallback(
    async (userId: string) => {
      if (!isLoaded) return;

      const result = await syncService.syncStations(stations, userId);

      if (result.success && result.mergedStations) {
        // Update local stations with merged result
        await setStationsFromSync(result.mergedStations);
      }
    },
    [stations, isLoaded, setStationsFromSync]
  );

  /**
   * Handle user sign-in.
   * Triggers initial sync with cloud storage.
   * @requirements 1.1, 1.2, 2.1, 2.2, 2.3, 2.4 - Google Authentication and Initial Sync
   */
  const handleSignIn = useCallback(
    async (user: User) => {
      setCurrentUser(user);

      // Start network listener for offline support
      syncService.startNetworkListener(user.uid, performSync);

      // Trigger initial sync
      await performSync(user.uid);
    },
    [performSync]
  );

  /**
   * Handle user sign-out.
   * Stops network listener and clears sync state.
   * @requirements 1.4 - Sign out and clear credentials
   */
  const handleSignOut = useCallback(() => {
    setCurrentUser(null);

    // Stop network listener
    syncService.stopNetworkListener();

    // Reset sync state to idle
    syncService.setSyncState('idle');
  }, []);

  /**
   * Handle sync retry.
   * Called when user clicks retry button after sync failure.
   */
  const handleSyncRetry = useCallback(async () => {
    if (currentUser) {
      await performSync(currentUser.uid);
    }
  }, [currentUser, performSync]);

  // Initialize auth service and subscribe to auth state changes
  // @requirements 1.1, 1.2 - AuthService initialization on app start
  useEffect(() => {
    const unsubscribe = authService.onAuthStateChanged(user => {
      if (user && !currentUser) {
        // User just signed in (or was already signed in on app start)
        handleSignIn(user);
      } else if (!user && currentUser) {
        // User just signed out
        handleSignOut();
      } else if (user) {
        // User state updated but still signed in
        setCurrentUser(user);
      }
    });

    return () => {
      unsubscribe();
      // Clean up network listener on unmount
      syncService.stopNetworkListener();
    };
  }, []); // Empty deps - only run on mount

  // Trigger sync when stations are loaded and user is signed in
  // @requirements 2.1, 2.2, 2.3, 2.4 - Initial Sync on Sign-In
  useEffect(() => {
    if (isLoaded && currentUser) {
      // Sync when stations finish loading (for app restart with existing user)
      performSync(currentUser.uid);
    }
  }, [isLoaded]); // Only trigger when isLoaded changes

  // Global error handler
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
          if (previousHandler) previousHandler(error, isFatal);
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
        } catch {
          // Ignore cleanup errors
        }
      };
    } catch (e) {
      console.warn('Error handler setup failed:', e);
    }
  }, []);

  // Drag and drop handlers
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!draggedStationId) return;
      const elements = document.elementsFromPoint(e.clientX, e.clientY);
      for (const el of elements) {
        const stationId = (el as any).dataset?.stationId;
        if (stationId) {
          const index = stations.findIndex(s => s.id === stationId);
          if (index >= 0) setDraggedOverIndex(index);
          break;
        }
      }
    };

    const handleMouseUp = () => {
      if (draggedStationId) handleStationDragEnd();
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

  // Menu handlers
  const toggleMenu = () => setMenuOpen(prev => !prev);
  const closeMenu = () => setMenuOpen(false);

  // Search handlers
  const handleSearchToggle = () => {
    setShowSearch(prev => !prev);
    if (showSearch) setFilterText('');
  };

  const handleSearchClose = () => {
    setFilterText('');
    setShowSearch(false);
  };

  // Station handlers
  const handleStationPress = (station: Station) => {
    setContextStationId(null);
    if (
      currentStation?.id === station.id &&
      (playbackState === 'playing' || playbackState === 'loading')
    ) {
      stopPlayback();
    } else {
      playStation(station);
    }
  };

  const handleStationLongPress = (station: Station) => {
    setDraggedStationId(station.id);
    setContextStationId(null);
  };

  const handleStationDragEnd = () => {
    if (draggedStationId && draggedOverIndex !== null) {
      const fromIndex = stations.findIndex(s => s.id === draggedStationId);
      if (fromIndex !== draggedOverIndex) {
        reorderStations(fromIndex, draggedOverIndex);
      }
    }
    setDraggedStationId(null);
    setDraggedOverIndex(null);
  };

  const handleRemoveStation = async (id: string) => {
    await removeStation(id);
    if (currentStation?.id === id) await stopPlayback();
    setContextStationId(null);
  };

  // Modal handlers
  const openAddModal = () => {
    setEditingStation(null);
    closeMenu();
    setShowAddModal(true);
  };

  const openEditModal = (station: Station) => {
    setEditingStation(station);
    setContextStationId(null);
    setShowAddModal(true);
  };

  const handleSaveStation = async (name: string, url: string) => {
    if (editingStation) {
      await updateStation({ ...editingStation, name, url });
    } else {
      await addStation(name, url);
    }
    setShowAddModal(false);
    setEditingStation(null);
  };

  const openImportModal = () => {
    closeMenu();
    setShowImportModal(true);
  };

  const openSettingsModal = () => {
    closeMenu();
    setShowSettingsModal(true);
  };

  const openAbout = () => {
    closeMenu();
    setAboutVisible(true);
  };

  const handleClearStations = async () => {
    await stopPlayback();
    setFilterText('');
    await clearStations();
  };

  return (
    <View style={styles.container}>
      <StatusBar style={statusBarStyle} />

      <View style={styles.webWrapper}>
        <View style={styles.appFrame}>
          <Header onMenuPress={toggleMenu} onSearchPress={handleSearchToggle} />

          {showSearch && (
            <SearchBar
              value={filterText}
              onChangeText={setFilterText}
              onClose={handleSearchClose}
            />
          )}

          <Menu
            visible={menuOpen}
            onClose={closeMenu}
            onAddStation={openAddModal}
            onImportExport={openImportModal}
            onSettings={openSettingsModal}
            onAbout={openAbout}
            onSyncRetry={handleSyncRetry}
          />

          <KeyboardAvoidingView
            style={styles.inner}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          >
            <ScrollView
              style={styles.list}
              showsVerticalScrollIndicator={false}
              scrollEnabled={!draggedStationId}
            >
              {filteredStations.map((station, index) => {
                const isCurrent = currentStation?.id === station.id;
                const playing = isCurrent && playbackState === 'playing';
                const highlighted =
                  isCurrent &&
                  (playbackState === 'playing' || playbackState === 'loading');

                return (
                  <StationCard
                    key={station.id}
                    station={station}
                    isPlaying={playing}
                    isHighlighted={highlighted}
                    isDragging={draggedStationId === station.id}
                    isDraggedOver={draggedOverIndex === index}
                    showActions={contextStationId === station.id}
                    onPress={() => handleStationPress(station)}
                    onLongPress={() => handleStationLongPress(station)}
                    onMenuPress={() =>
                      setContextStationId(prev =>
                        prev === station.id ? null : station.id
                      )
                    }
                    onEdit={() => openEditModal(station)}
                    onRemove={() => handleRemoveStation(station.id)}
                    onCloseMenu={() => setContextStationId(null)}
                  />
                );
              })}
            </ScrollView>
          </KeyboardAvoidingView>

          <PlayerBar
            showVolumeSlider={showVolumeSlider}
            onVolumeToggle={() => setShowVolumeSlider(prev => !prev)}
          />
        </View>
      </View>

      <AddStationModal
        visible={showAddModal}
        editingStation={editingStation}
        onClose={() => {
          setShowAddModal(false);
          setEditingStation(null);
        }}
        onSave={handleSaveStation}
      />

      <AboutModal
        visible={aboutVisible}
        onClose={() => setAboutVisible(false)}
      />

      <ErrorModal
        visible={!!unexpectedError}
        message={unexpectedError}
        onDismiss={() => setUnexpectedError(null)}
      />

      <ImportExportModal
        visible={showImportModal}
        onClose={() => setShowImportModal(false)}
        onClearStations={handleClearStations}
      />

      <SettingsModal
        visible={showSettingsModal}
        onClose={() => setShowSettingsModal(false)}
        onSignIn={handleSignIn}
        onSignOut={handleSignOut}
        onSyncRetry={handleSyncRetry}
      />
    </View>
  );
}

function AppWithAudio() {
  const { stations } = useStations();

  return (
    <AudioProvider stations={stations}>
      <AppContent />
    </AudioProvider>
  );
}

export default function App() {
  const [fontsLoaded] = useFonts({
    RobotoCondensed_400Regular,
    RobotoCondensed_500Medium,
    RobotoCondensed_700Bold,
  });

  if (!fontsLoaded) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: '#0f1220',
          justifyContent: 'center',
          alignItems: 'center',
        }}
      >
        <Image
          source={require('../assets/icon.png')}
          style={{ width: 128, height: 128, opacity: 0.8 }}
          resizeMode="contain"
        />
      </View>
    );
  }

  return (
    <SettingsProvider>
      <StationsProvider>
        <AppWithAudio />
      </StationsProvider>
    </SettingsProvider>
  );
}
