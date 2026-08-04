import { beforeEach, describe, expect, it, vi } from 'vitest';

const storage = vi.hoisted(() => ({
  getItem: vi.fn(),
  setItem: vi.fn(),
}));

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: storage,
}));

import {
  loadPlaybackVolume,
  normalizePlaybackVolume,
  PLAYBACK_VOLUME_STORAGE_KEY,
  savePlaybackVolume,
} from './playbackPreferences';

describe('playback volume preferences', () => {
  beforeEach(() => {
    storage.getItem.mockReset();
    storage.setItem.mockReset();
  });

  it('normalizes stored values to the supported volume range', () => {
    expect(normalizePlaybackVolume('0.35')).toBe(0.35);
    expect(normalizePlaybackVolume(-1)).toBe(0);
    expect(normalizePlaybackVolume('5')).toBe(1);
    expect(normalizePlaybackVolume('invalid', 0.5)).toBe(0.5);
  });

  it('loads the saved volume', async () => {
    storage.getItem.mockResolvedValue('0.42');

    await expect(loadPlaybackVolume()).resolves.toBe(0.42);
    expect(storage.getItem).toHaveBeenCalledWith(PLAYBACK_VOLUME_STORAGE_KEY);
  });

  it('saves a normalized volume', async () => {
    storage.setItem.mockResolvedValue(undefined);

    await savePlaybackVolume(1.4);

    expect(storage.setItem).toHaveBeenCalledWith(
      PLAYBACK_VOLUME_STORAGE_KEY,
      '1'
    );
  });
});
