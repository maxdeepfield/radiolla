import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useMemo,
  ReactNode,
} from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ThemePref, Palette, palettes } from '../styles/theme';
import { createStyles, AppStyles } from '../styles/createStyles';

const THEME_STORAGE_KEY = 'Radiolla:theme-pref';
const COMPACT_UI_STORAGE_KEY = 'Radiolla:compact-ui';

type SettingsContextType = {
  themePref: ThemePref;
  setThemePref: (pref: ThemePref) => Promise<void>;
  compactUI: boolean;
  setCompactUI: (compact: boolean) => Promise<void>;
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
  const [isLoaded, setIsLoaded] = useState(false);

  // Load settings on mount
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const [storedTheme, storedCompact] = await Promise.all([
          AsyncStorage.getItem(THEME_STORAGE_KEY),
          AsyncStorage.getItem(COMPACT_UI_STORAGE_KEY),
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
