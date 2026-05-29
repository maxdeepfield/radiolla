import { NativeEventEmitter, NativeModules, Platform } from 'react-native';
import type { EmitterSubscription } from 'react-native';

export const BLUETOOTH_AUDIO_CONNECTED_EVENT =
  'RadiollaBluetoothAudioConnected';

type BluetoothAutoPlayNativeModule = {
  startListening: () => Promise<void>;
  isBluetoothAudioConnected: () => Promise<boolean>;
  addListener: (eventName: string) => void;
  removeListeners: (count: number) => void;
};

type BluetoothAudioConnectedEvent = {
  source?: string;
};

const nativeModule =
  Platform.OS === 'android'
    ? (NativeModules.BluetoothAutoPlay as
        | BluetoothAutoPlayNativeModule
        | undefined)
    : undefined;

const eventEmitter = nativeModule
  ? new NativeEventEmitter(nativeModule)
  : undefined;

export function isBluetoothAutoPlayAvailable(): boolean {
  return !!nativeModule && !!eventEmitter;
}

export async function startBluetoothAutoPlayListener(): Promise<void> {
  await nativeModule?.startListening();
}

export async function isBluetoothAudioConnected(): Promise<boolean> {
  if (!nativeModule) return false;
  return nativeModule.isBluetoothAudioConnected();
}

export function addBluetoothAudioConnectedListener(
  listener: (event: BluetoothAudioConnectedEvent) => void
): EmitterSubscription | null {
  if (!eventEmitter) return null;
  return eventEmitter.addListener(BLUETOOTH_AUDIO_CONNECTED_EVENT, listener);
}
