import TrackPlayer from 'react-native-track-player';
import { PlaybackService } from './services/trackPlayerService';

// Register the playback service for background audio on Android/iOS
TrackPlayer.registerPlaybackService(() => PlaybackService);
