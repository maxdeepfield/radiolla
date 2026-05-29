import AsyncStorage from '@react-native-async-storage/async-storage';

export type PersistedStation = {
  id: string;
  name: string;
  url: string;
};

export const LAST_STATION_STORAGE_KEY = 'Radiolla:last-station';
export const AUTO_PLAY_ON_BLUETOOTH_STORAGE_KEY =
  'Radiolla:auto-play-on-bluetooth';

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
