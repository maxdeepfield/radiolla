import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  pushChange,
  createPendingChange,
  addPendingChange,
  isOnline,
} from '../../services/syncService';
import { getCurrentUser } from '../../services/authService';

export type Station = {
  id: string;
  name: string;
  url: string;
};

const STORAGE_KEY = 'Radiolla:stations';

type StationsContextType = {
  stations: Station[];
  addStation: (name: string, url: string) => Promise<Station>;
  updateStation: (station: Station) => Promise<void>;
  removeStation: (id: string) => Promise<void>;
  reorderStations: (fromIndex: number, toIndex: number) => Promise<void>;
  clearStations: () => Promise<void>;
  importStations: (newStations: Station[]) => Promise<void>;
  setStationsFromSync: (stations: Station[]) => Promise<void>;
  isLoaded: boolean;
};

const StationsContext = createContext<StationsContextType | null>(null);

export function StationsProvider({ children }: { children: ReactNode }) {
  const [stations, setStations] = useState<Station[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);

  // Load stations on mount
  useEffect(() => {
    const loadStations = async () => {
      try {
        const stored = await AsyncStorage.getItem(STORAGE_KEY);
        if (stored) {
          setStations(JSON.parse(stored));
        }
      } catch {
        // ignore load errors
      } finally {
        setIsLoaded(true);
      }
    };
    loadStations();
  }, []);

  const persistStations = async (next: Station[]) => {
    setStations(next);
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // ignore persistence errors
    }
  };

  /**
   * Sync a station change to the cloud if user is signed in.
   * Queues the change if offline.
   * @param type - Type of change (add, update, delete)
   * @param station - The station being changed
   * @requirements 3.1, 3.2, 3.3, 4.1 - Automatic Change Sync and Offline Support
   */
  const syncStationChange = async (
    type: 'add' | 'update' | 'delete',
    station: Station
  ): Promise<void> => {
    const user = getCurrentUser();
    if (!user) {
      // Not signed in, skip sync
      return;
    }

    const change = createPendingChange(type, station);

    if (!isOnline()) {
      // Offline: queue the change for later
      // @requirements 4.1 - Queue station changes for later synchronization
      await addPendingChange(change);
      return;
    }

    try {
      // Online and signed in: push change to cloud
      await pushChange(change, user.uid);
    } catch (error) {
      // If push fails, the change is already queued by pushChange
      console.error('Failed to sync station change:', error);
    }
  };

  /**
   * Add a new station to the list.
   * Persists to local storage and syncs to cloud if signed in.
   * @requirements 3.1 - Persist station to both Local_Storage and Cloud_Storage
   */
  const addStation = async (name: string, url: string): Promise<Station> => {
    const newStation: Station = {
      id: Date.now().toString(),
      name: name.trim(),
      url: url.trim(),
    };
    const next = [...stations, newStation];
    await persistStations(next);

    // Sync to cloud if signed in
    await syncStationChange('add', newStation);

    return newStation;
  };

  /**
   * Update an existing station.
   * Persists to local storage and syncs to cloud if signed in.
   * @requirements 3.2 - Update station in both Local_Storage and Cloud_Storage
   */
  const updateStation = async (updated: Station) => {
    const next = stations.map(s => (s.id === updated.id ? updated : s));
    await persistStations(next);

    // Sync to cloud if signed in
    await syncStationChange('update', updated);
  };

  /**
   * Remove a station from the list.
   * Persists to local storage and syncs to cloud if signed in.
   * @requirements 3.3 - Delete station from both Local_Storage and Cloud_Storage
   */
  const removeStation = async (id: string) => {
    const stationToRemove = stations.find(s => s.id === id);
    const next = stations.filter(s => s.id !== id);
    await persistStations(next);

    // Sync to cloud if signed in
    if (stationToRemove) {
      await syncStationChange('delete', stationToRemove);
    }
  };

  const reorderStations = async (fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex) return;
    const newStations = [...stations];
    const [movedStation] = newStations.splice(fromIndex, 1);
    newStations.splice(toIndex, 0, movedStation);
    await persistStations(newStations);
  };

  const clearStations = async () => {
    await persistStations([]);
  };

  const importStations = async (newStations: Station[]) => {
    const updated = [...stations, ...newStations];
    await persistStations(updated);
  };

  /**
   * Set stations from a sync operation.
   * This is used when syncing with the cloud to update the local state
   * without triggering additional sync operations.
   */
  const setStationsFromSync = async (syncedStations: Station[]) => {
    await persistStations(syncedStations);
  };

  const value: StationsContextType = {
    stations,
    addStation,
    updateStation,
    removeStation,
    reorderStations,
    clearStations,
    importStations,
    setStationsFromSync,
    isLoaded,
  };

  return (
    <StationsContext.Provider value={value}>
      {children}
    </StationsContext.Provider>
  );
}

export function useStations() {
  const context = useContext(StationsContext);
  if (!context) {
    throw new Error('useStations must be used within a StationsProvider');
  }
  return context;
}
