import { describe, expect, it } from 'vitest';
import { parsePlaylist } from './playlist';

describe('playlist audio source types', () => {
  it('keeps streams and local files in one M3U list', () => {
    const stations = parsePlaylist(`#EXTM3U
#EXTINF:-1,Radio
https://example.com/live.aac
#EXTINF:123,Local song
C:\\Music\\song.mp3`);

    expect(stations).toHaveLength(2);
    expect(stations[0]).toMatchObject({
      name: 'Radio',
      type: 'stream',
    });
    expect(stations[1]).toMatchObject({
      name: 'Local song',
      url: 'C:\\Music\\song.mp3',
      type: 'file',
    });
  });
});
