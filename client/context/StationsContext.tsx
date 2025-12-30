import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

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

  const addStation = async (name: string, url: string): Promise<Station> => {
    const newStation: Station = {
      id: Date.now().toString(),
      name: name.trim(),
      url: url.trim(),
    };
    const next = [...stations, newStation];
    await persistStations(next);
    return newStation;
  };

  const updateStation = async (updated: Station) => {
    const next = stations.map(s => (s.id === updated.id ? updated : s));
    await persistStations(next);
  };

  const removeStation = async (id: string) => {
    const next = stations.filter(s => s.id !== id);
    await persistStations(next);
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

  const value: StationsContextType = {
    stations,
    addStation,
    updateStation,
    removeStation,
    reorderStations,
    clearStations,
    importStations,
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
