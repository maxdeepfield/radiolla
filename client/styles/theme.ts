import { Platform } from 'react-native';

export type ThemePref = 'auto' | 'light' | 'dark';

export type Palette = {
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

export const palettes: Record<'light' | 'dark', Palette> = {
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

export const fonts = {
  regular: 'RobotoCondensed_400Regular',
  medium: 'RobotoCondensed_500Medium',
  bold: 'RobotoCondensed_700Bold',
};

export const THEME_OPTIONS: { key: ThemePref; label: string }[] = [
  { key: 'auto', label: 'Auto' },
  { key: 'light', label: 'Light' },
  { key: 'dark', label: 'Dark' },
];

export const INSETS = {
  top: Platform.OS === 'android' ? 24 : 0,
  bottom: Platform.OS === 'android' ? 24 : 0,
};
