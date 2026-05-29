import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useMemo,
  ReactNode,
} from 'react';
import { Platform, useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ThemePref, Palette, palettes } from '../styles/theme';
import { createStyles, AppStyles } from '../styles/createStyles';
import {
  loadAutoPlayOnBluetooth,
  saveAutoPlayOnBluetooth,
} from '../../services/playbackPreferences';

const THEME_STORAGE_KEY = 'Radiolla:theme-pref';
const COMPACT_UI_STORAGE_KEY = 'Radiolla:compact-ui';
const DEFAULT_AUTO_PLAY_ON_BLUETOOTH = Platform.OS === 'android';

type SettingsContextType = {
  themePref: ThemePref;
  setThemePref: (pref: ThemePref) => Promise<void>;
  compactUI: boolean;
  setCompactUI: (compact: boolean) => Promise<void>;
  autoPlayOnBluetooth: boolean;
  setAutoPlayOnBluetooth: (enabled: boolean) => Promise<void>;
  resolvedTheme: 'light' | 'dark';
  palette: Palette;
  styles: AppStyles;
  statusBarStyle: 'light' | 'dark';
};

const SettingsContext = createContext<SettingsContextType | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const systemScheme = useColorScheme();
  const [themePref, setThemePrefState] = useState<ThemePref>('auto');
  const [compactUI, setCompactUIState] = useState(false);
  const [autoPlayOnBluetooth, setAutoPlayOnBluetoothState] = useState(
    DEFAULT_AUTO_PLAY_ON_BLUETOOTH
  );
  const [isLoaded, setIsLoaded] = useState(false);

  // Load settings on mount
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const [storedTheme, storedCompact, storedAutoPlayOnBluetooth] =
          await Promise.all([
            AsyncStorage.getItem(THEME_STORAGE_KEY),
            AsyncStorage.getItem(COMPACT_UI_STORAGE_KEY),
            loadAutoPlayOnBluetooth(DEFAULT_AUTO_PLAY_ON_BLUETOOTH),
          ]);

        if (
          storedTheme === 'auto' ||
          storedTheme === 'light' ||
          storedTheme === 'dark'
        ) {
          setThemePrefState(storedTheme);
        }
        if (storedCompact !== null) {
          setCompactUIState(storedCompact === 'true');
        }
        setAutoPlayOnBluetoothState(storedAutoPlayOnBluetooth);
      } catch {
        // ignore load errors
      } finally {
        setIsLoaded(true);
      }
    };
    loadSettings();
  }, []);

  const setThemePref = async (pref: ThemePref) => {
    setThemePrefState(pref);
    try {
      await AsyncStorage.setItem(THEME_STORAGE_KEY, pref);
    } catch {
      // ignore persistence errors
    }
  };

  const setCompactUI = async (compact: boolean) => {
    setCompactUIState(compact);
    try {
      await AsyncStorage.setItem(COMPACT_UI_STORAGE_KEY, String(compact));
    } catch {
      // ignore persistence errors
    }
  };

  const setAutoPlayOnBluetooth = async (enabled: boolean) => {
    setAutoPlayOnBluetoothState(enabled);
    try {
      await saveAutoPlayOnBluetooth(enabled);
    } catch {
      // ignore persistence errors
    }
  };

  const resolvedTheme =
    themePref === 'auto'
      ? systemScheme === 'dark'
        ? 'dark'
        : 'light'
      : themePref;

  const palette = palettes[resolvedTheme];
  const styles = useMemo(
    () => createStyles(palette, compactUI),
    [palette, compactUI]
  );
  const statusBarStyle = resolvedTheme === 'dark' ? 'light' : 'dark';

  const value: SettingsContextType = {
    themePref,
    setThemePref,
    compactUI,
    setCompactUI,
    autoPlayOnBluetooth,
    setAutoPlayOnBluetooth,
    resolvedTheme,
    palette,
    styles,
    statusBarStyle,
  };

  // Don't render children until settings are loaded to prevent flash
  if (!isLoaded) {
    return null;
  }

  return (
    <SettingsContext.Provider value={value}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const context = useContext(SettingsContext);
  if (!context) {
    throw new Error('useSettings must be used within a SettingsProvider');
  }
  return context;
}
