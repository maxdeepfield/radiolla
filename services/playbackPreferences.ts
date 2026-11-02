import AsyncStorage from '@react-native-async-storage/async-storage';

export type PersistedStation = {
  id: string;
  name: string;
  url: string;
  type?: 'stream' | 'file';
};

export const LAST_STATION_STORAGE_KEY = 'Radiolla:last-station';
export const STATION_LIBRARY_STORAGE_KEY = 'Radiolla:station-library';
export const PLAYBACK_VOLUME_STORAGE_KEY = 'Radiolla:playback-volume';
export const AUTO_PLAY_ON_BLUETOOTH_STORAGE_KEY =
  'Radiolla:auto-play-on-bluetooth';

export function normalizePlaybackVolume(
  value: unknown,
  defaultValue: number = 1
): number {
  const fallback = Number.isFinite(defaultValue)
    ? Math.max(0, Math.min(1, defaultValue))
    : 1;
  const numericValue =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && value.trim()
        ? Number(value)
        : Number.NaN;

  return Number.isFinite(numericValue)
    ? Math.max(0, Math.min(1, numericValue))
    : fallback;
}

export function normalizePersistedStation(
  value: unknown
): PersistedStation | null {
  if (!value || typeof value !== 'object') return null;

  const station = value as Partial<PersistedStation>;
  if (
    typeof station.id !== 'string' ||
    typeof station.name !== 'string' ||
    typeof station.url !== 'string'
  ) {
    return null;
  }

  const name = station.name.trim();
  const url = station.url.trim();
  if (!name || !url) return null;

  return {
    id: station.id,
    name,
    url,
    type: station.type === 'file' ? 'file' : 'stream',
  };
}

export async function saveLastStation(
  station: PersistedStation
): Promise<void> {
  await AsyncStorage.setItem(
    LAST_STATION_STORAGE_KEY,
    JSON.stringify({
      id: station.id,
      name: station.name,
      url: station.url,
      type: station.type === 'file' ? 'file' : 'stream',
    })
  );
}

export async function loadLastStation(): Promise<PersistedStation | null> {
  const stored = await AsyncStorage.getItem(LAST_STATION_STORAGE_KEY);
  if (!stored) return null;

  try {
    return normalizePersistedStation(JSON.parse(stored));
  } catch {
    return null;
  }
}

export async function saveStationLibrary(
  stations: PersistedStation[]
): Promise<void> {
  const normalized = Array.isArray(stations)
    ? stations
        .map(normalizePersistedStation)
        .filter((station): station is PersistedStation => station !== null)
    : [];

  await AsyncStorage.setItem(
    STATION_LIBRARY_STORAGE_KEY,
    JSON.stringify(normalized)
  );
}

export async function loadStationLibrary(): Promise<PersistedStation[]> {
  const stored = await AsyncStorage.getItem(STATION_LIBRARY_STORAGE_KEY);
  if (!stored) return [];

  try {
    const parsed = JSON.parse(stored);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .map(normalizePersistedStation)
      .filter((station): station is PersistedStation => station !== null);
  } catch {
    return [];
  }
}

export async function loadPlaybackVolume(
  defaultValue: number = 1
): Promise<number> {
  const stored = await AsyncStorage.getItem(PLAYBACK_VOLUME_STORAGE_KEY);
  return normalizePlaybackVolume(stored, defaultValue);
}

export async function savePlaybackVolume(volume: number): Promise<void> {
  await AsyncStorage.setItem(
    PLAYBACK_VOLUME_STORAGE_KEY,
    String(normalizePlaybackVolume(volume))
  );
}

export async function loadAutoPlayOnBluetooth(
  defaultValue: boolean
): Promise<boolean> {
  const stored = await AsyncStorage.getItem(AUTO_PLAY_ON_BLUETOOTH_STORAGE_KEY);
  if (stored === null) return defaultValue;
  return stored === 'true';
}

export async function saveAutoPlayOnBluetooth(enabled: boolean): Promise<void> {
  await AsyncStorage.setItem(
    AUTO_PLAY_ON_BLUETOOTH_STORAGE_KEY,
    String(enabled)
  );
}
