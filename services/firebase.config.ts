/**
 * Firebase Configuration for Radiolla
 *
 * This file contains the Firebase project configuration.
 * Replace the placeholder values with your actual Firebase project credentials.
 *
 * To get your Firebase configuration:
 * 1. Go to Firebase Console (https://console.firebase.google.com)
 * 2. Select your project (or create a new one)
 * 3. Go to Project Settings > General
 * 4. Scroll down to "Your apps" and select the web app
 * 5. Copy the firebaseConfig object values
 *
 * For Google Sign-In:
 * 1. Enable Google Sign-In in Firebase Console > Authentication > Sign-in method
 * 2. For Android: Add SHA-1 fingerprint in Project Settings > Your apps > Android app
 * 3. For Web: Add your domain to authorized domains
 *
 * @requirements 1.1, 1.2 - Google Authentication setup
 */

export interface FirebaseConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
  measurementId?: string;
}

/**
 * Firebase project configuration
 * Replace these placeholder values with your actual Firebase project credentials
 */
export const firebaseConfig: FirebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY || 'YOUR_API_KEY',
  authDomain:
    process.env.FIREBASE_AUTH_DOMAIN || 'YOUR_PROJECT_ID.firebaseapp.com',
  projectId: process.env.FIREBASE_PROJECT_ID || 'YOUR_PROJECT_ID',
  storageBucket:
    process.env.FIREBASE_STORAGE_BUCKET || 'YOUR_PROJECT_ID.appspot.com',
  messagingSenderId:
    process.env.FIREBASE_MESSAGING_SENDER_ID || 'YOUR_MESSAGING_SENDER_ID',
  appId: process.env.FIREBASE_APP_ID || 'YOUR_APP_ID',
  measurementId: process.env.FIREBASE_MEASUREMENT_ID,
};

/**
 * Google Sign-In Web Client ID
 * Required for expo-auth-session OAuth flow on web
 * Get this from Google Cloud Console > APIs & Services > Credentials
 */
export const googleWebClientId =
  process.env.GOOGLE_WEB_CLIENT_ID ||
  'YOUR_WEB_CLIENT_ID.apps.googleusercontent.com';

/**
 * Google Sign-In Android Client ID
 * Required for @react-native-google-signin on Android
 * Get this from google-services.json (client_id with client_type: 3)
 */
export const googleAndroidClientId =
  process.env.GOOGLE_ANDROID_CLIENT_ID ||
  'YOUR_ANDROID_CLIENT_ID.apps.googleusercontent.com';

/**
 * Google Sign-In iOS Client ID
 * Required for @react-native-google-signin on iOS
 * Get this from GoogleService-Info.plist (CLIENT_ID)
 */
export const googleIosClientId =
  process.env.GOOGLE_IOS_CLIENT_ID ||
  'YOUR_IOS_CLIENT_ID.apps.googleusercontent.com';

/**
 * Firestore collection paths
 */
export const firestoreCollections = {
  users: 'users',
  stations: 'stations',
} as const;

/**
 * Sync configuration
 */
export const syncConfig = {
  /** Maximum retry attempts for failed sync operations */
  maxRetries: 3,
  /** Base delay for exponential backoff (in milliseconds) */
  baseRetryDelay: 1000,
  /** Key for storing pending changes in AsyncStorage */
  pendingChangesKey: 'Radiolla:pending-changes',
  /** Key for storing last sync timestamp */
  lastSyncKey: 'Radiolla:last-sync',
} as const;

/**
 * Check if Firebase is properly configured
 * Returns true if all required config values are set (not placeholder values)
 */
export function isFirebaseConfigured(): boolean {
  return (
    firebaseConfig.apiKey !== 'YOUR_API_KEY' &&
    firebaseConfig.projectId !== 'YOUR_PROJECT_ID' &&
    firebaseConfig.appId !== 'YOUR_APP_ID'
  );
}

/**
 * Check if Google Sign-In is properly configured for web
 */
export function isGoogleSignInConfigured(): boolean {
  return googleWebClientId !== 'YOUR_WEB_CLIENT_ID.apps.googleusercontent.com';
}
