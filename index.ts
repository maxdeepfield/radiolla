import { registerRootComponent } from 'expo';
import { Platform } from 'react-native';
import TrackPlayer from 'react-native-track-player';

import App from './App';
import { PlaybackService } from './services/trackPlayerService';

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);

// Register the playback service for background audio on Android/iOS
if (Platform.OS !== 'web') {
  TrackPlayer.registerPlaybackService(() => PlaybackService);
}
