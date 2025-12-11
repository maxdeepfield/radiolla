import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';

const PLAYBACK_NOTIFICATION_ID = 'radiolla-playback';
const PLAYBACK_CHANNEL_ID = 'radiolla-playback-channel';

let notificationId: string | null = null;

export async function initializeNotifications(): Promise<void> {
  if (Platform.OS === 'web') {
    return;
  }

  await Notifications.setNotificationChannelAsync(PLAYBACK_CHANNEL_ID, {
    name: 'Playback',
    importance: Notifications.AndroidImportance.LOW,
    sound: null,
    vibrationPattern: null,
    enableVibrate: false,
    showBadge: false,
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
  });

  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: false,
      shouldPlaySound: false,
      shouldSetBadge: false,
      shouldShowBanner: false,
      shouldShowList: true,
    }),
  });
}

export async function showPlaybackNotification(
  stationName: string,
  trackInfo?: string | null
): Promise<void> {
  if (Platform.OS === 'web') {
    return;
  }

  try {
    const content: Notifications.NotificationContentInput = {
      title: stationName,
      body: trackInfo || 'Streaming',
      sticky: true,
      priority: Notifications.AndroidNotificationPriority.LOW,
      vibrate: [],
    };

    if (Platform.OS === 'android') {
      (content as any).channelId = PLAYBACK_CHANNEL_ID;
    }

    if (notificationId) {
      await Notifications.dismissNotificationAsync(notificationId);
    }

    notificationId = await Notifications.scheduleNotificationAsync({
      identifier: PLAYBACK_NOTIFICATION_ID,
      content,
      trigger: null,
    });
  } catch (error) {
    console.error('Failed to show playback notification:', error);
  }
}

export async function hidePlaybackNotification(): Promise<void> {
  if (Platform.OS === 'web') {
    return;
  }

  try {
    if (notificationId) {
      await Notifications.dismissNotificationAsync(notificationId);
      notificationId = null;
    }
    await Notifications.dismissNotificationAsync(PLAYBACK_NOTIFICATION_ID);
  } catch (error) {
    console.error('Failed to hide playback notification:', error);
  }
}
