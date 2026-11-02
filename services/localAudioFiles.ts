import { Platform } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';

export const SUPPORTED_AUDIO_EXTENSIONS = [
  'mp3',
  'aac',
  'm4a',
  'wav',
  'ogg',
  'flac',
] as const;

export type LocalAudioFile = {
  name: string;
  url: string;
};

type ElectronAudioFile = {
  name: string;
  path: string;
};

type ElectronIPCRenderer = {
  invoke?: (channel: string, ...args: unknown[]) => Promise<unknown>;
};

function electronIPC(): ElectronIPCRenderer | null {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return null;
  return (
    (window as Window & { ipcRenderer?: ElectronIPCRenderer }).ipcRenderer ??
    null
  );
}

export async function pickLocalAudioFiles(): Promise<LocalAudioFile[]> {
  const ipc = electronIPC();
  if (ipc?.invoke) {
    const result = await ipc.invoke('pick-audio-files');
    if (!Array.isArray(result)) return [];
    return result
      .filter(
        (file): file is ElectronAudioFile =>
          !!file &&
          typeof file === 'object' &&
          typeof file.name === 'string' &&
          typeof file.path === 'string'
      )
      .map(file => ({ name: file.name, url: file.path }));
  }

  const result = await DocumentPicker.getDocumentAsync({
    type: 'audio/*',
    multiple: true,
    copyToCacheDirectory: false,
  });
  if (result.canceled) return [];

  return result.assets.map(asset => ({
    name: asset.name,
    url: asset.uri,
  }));
}

export async function prepareLocalAudioUrl(pathOrUri: string): Promise<string> {
  const ipc = electronIPC();
  if (!ipc?.invoke) return pathOrUri;

  const result = await ipc.invoke('prepare-local-audio', pathOrUri);
  if (typeof result !== 'string' || !result) {
    throw new Error('The selected audio file is unavailable.');
  }
  return result;
}
