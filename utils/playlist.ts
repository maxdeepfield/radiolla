import { Station } from '../client/context/StationsContext';

export const parsePlaylist = (content: string): Station[] => {
  const lines = content.split(/\r?\n/);
  const stations: Station[] = [];
  let currentName = 'Unknown Station';

  // Simple heuristic to detect PLS
  if (content.toLowerCase().includes('[playlist]')) {
    return parsePLS(lines);
  }

  // Default to M3U parsing
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    if (line.startsWith('#EXTINF:')) {
      // Format: #EXTINF:duration,Station Name
      const commaIndex = line.indexOf(',');
      if (commaIndex !== -1) {
        currentName = line.substring(commaIndex + 1).trim();
      }
    } else if (!line.startsWith('#')) {
      // Assume it's a URL
      stations.push({
        id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
        name: currentName,
        url: line,
      });
      currentName = 'Unknown Station'; // Reset for next entry
    }
  }

  return stations;
};

const parsePLS = (lines: string[]): Station[] => {
  const stations: Station[] = [];
  const entries: { [key: string]: { url?: string; title?: string } } = {};

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    if (trimmed.toLowerCase().startsWith('file')) {
      const [key, value] = trimmed.split('=');
      const index = key.toLowerCase().replace('file', '');
      if (!entries[index]) entries[index] = {};
      entries[index].url = value;
    } else if (trimmed.toLowerCase().startsWith('title')) {
      const [key, value] = trimmed.split('=');
      const index = key.toLowerCase().replace('title', '');
      if (!entries[index]) entries[index] = {};
      entries[index].title = value;
    }
  }

  Object.values(entries).forEach(entry => {
    if (entry.url) {
      stations.push({
        id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
        name: entry.title || 'Unknown Station',
        url: entry.url,
      });
    }
  });

  return stations;
};

export const generateM3U = (stations: Station[]): string => {
  let content = '#EXTM3U\n';
  stations.forEach(station => {
    content += `#EXTINF:-1,${station.name}\n${station.url}\n`;
  });
  return content;
};

export const generatePLS = (stations: Station[]): string => {
  let content = '[playlist]\n';
  content += `NumberOfEntries=${stations.length}\n`;
  stations.forEach((station, index) => {
    const i = index + 1;
    content += `File${i}=${station.url}\n`;
    content += `Title${i}=${station.name}\n`;
    content += `Length${i}=-1\n`;
  });
  content += 'Version=2\n';
  return content;
};
