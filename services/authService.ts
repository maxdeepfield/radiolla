/**
 * AuthService Module
 * Handles Google authentication flow for Radiolla.
 *
 * This service provides Google Sign-In functionality using:
 * - Firebase Auth with @react-native-google-signin on native platforms (Android/iOS)
 * - Firebase Auth with expo-auth-session on web
 *
 * @requirements 1.1, 1.2, 1.3, 1.4 - Google Authentication
 */

import { Platform } from 'react-native';
import {
  firebaseConfig,
  googleWebClientId,
  googleAndroidClientId,
  googleIosClientId,
  isFirebaseConfigured,
  isGoogleSignInConfigured,
} from './firebase.config';

/**
 * User object representing an authenticated user
 */
export interface User {
  uid: string;
  email: string;
  displayName: string | null;
}

/**
 * Authentication state
 */
export interface AuthState {
  user: User | null;
  isLoading: boolean;
  error: string | null;
}

/**
 * Callback type for auth state changes
 */
export type AuthStateCallback = (user: User | null) => void;

// Store for auth state listeners
const authStateListeners: Set<AuthStateCallback> = new Set();

// Current auth state
let currentUser: User | null = null;
let isInitialized = false;

// Firebase instances (lazy loaded)
let firebaseApp: any = null;
let firebaseAuth: any = null;

/**
 * Initialize Firebase for the current platform
 */
async function initializeFirebase(): Promise<void> {
  if (isInitialized) return;

  if (!isFirebaseConfigured()) {
    console.warn(
      'Firebase is not configured. Please update firebase.config.ts with your credentials.'
    );
    isInitialized = true;
    return;
  }

  try {
    if (Platform.OS === 'web') {
      // Web: Use Firebase JS SDK via dynamic import
      const firebase = await import('firebase/app');
      const { getAuth, onAuthStateChanged: firebaseOnAuthStateChanged } =
        await import('firebase/auth');

      // Initialize Firebase app if not already initialized
      if (!firebase.getApps().length) {
        firebaseApp = firebase.initializeApp(firebaseConfig);
      } else {
        firebaseApp = firebase.getApp();
      }

      firebaseAuth = getAuth(firebaseApp);

      // Listen for auth state changes
      firebaseOnAuthStateChanged(firebaseAuth, (firebaseUser: any) => {
        if (firebaseUser) {
          currentUser = {
            uid: firebaseUser.uid,
            email: firebaseUser.email || '',
            displayName: firebaseUser.displayName,
          };
        } else {
          currentUser = null;
        }
        notifyAuthStateListeners();
      });
    } else {
      // Native: Use @react-native-firebase
      const firebaseAppModule = await import('@react-native-firebase/app');
      const firebaseAuthModule = await import('@react-native-firebase/auth');

      firebaseApp = firebaseAppModule.default;
      firebaseAuth = firebaseAuthModule.default();

      // Configure Google Sign-In for native
      const { GoogleSignin } =
        await import('@react-native-google-signin/google-signin');
      GoogleSignin.configure({
        webClientId: googleWebClientId,
        offlineAccess: true,
        iosClientId: googleIosClientId,
      });

      // Listen for auth state changes
      firebaseAuth.onAuthStateChanged((firebaseUser: any) => {
        if (firebaseUser) {
          currentUser = {
            uid: firebaseUser.uid,
            email: firebaseUser.email || '',
            displayName: firebaseUser.displayName,
          };
        } else {
          currentUser = null;
        }
        notifyAuthStateListeners();
      });
    }

    isInitialized = true;
  } catch (error) {
    console.error('Failed to initialize Firebase:', error);
    isInitialized = true;
  }
}

/**
 * Notify all registered auth state listeners
 */
function notifyAuthStateListeners(): void {
  authStateListeners.forEach(callback => {
    try {
      callback(currentUser);
    } catch (error) {
      console.error('Auth state listener error:', error);
    }
  });
}

/**
 * Sign in with Google
 * @returns Promise resolving to the authenticated User
 * @throws Error if authentication fails
 * @requirements 1.1, 1.2, 1.3 - Google OAuth flow and credential storage
 */
export async function signIn(): Promise<User> {
  await initializeFirebase();

  if (!isFirebaseConfigured()) {
    throw new Error(
      'Firebase is not configured. Please update firebase.config.ts with your credentials.'
    );
  }

  try {
    if (Platform.OS === 'web') {
      return await signInWeb();
    } else {
      return await signInNative();
    }
  } catch (error: any) {
    // Handle user cancellation silently
    if (
      error?.code === 'auth/popup-closed-by-user' ||
      error?.code === 'auth/cancelled-popup-request' ||
      error?.message?.includes('cancelled') ||
      error?.message?.includes('canceled')
    ) {
      throw new Error('Sign-in cancelled');
    }

    // Handle network errors
    if (
      error?.code === 'auth/network-request-failed' ||
      error?.message?.includes('network')
    ) {
      throw new Error('Unable to connect. Check your internet connection.');
    }

    // Handle other errors
    console.error('Sign-in error:', error);
    throw new Error(
      error?.message || 'Authentication failed. Please try again.'
    );
  }
}

/**
 * Sign in with Google on web platform
 */
async function signInWeb(): Promise<User> {
  if (!isGoogleSignInConfigured()) {
    throw new Error(
      'Google Sign-In is not configured. Please update firebase.config.ts with your Google Web Client ID.'
    );
  }

  const { GoogleAuthProvider, signInWithPopup } = await import('firebase/auth');

  const provider = new GoogleAuthProvider();
  provider.addScope('email');
  provider.addScope('profile');

  const result = await signInWithPopup(firebaseAuth, provider);
  const firebaseUser = result.user;

  const user: User = {
    uid: firebaseUser.uid,
    email: firebaseUser.email || '',
    displayName: firebaseUser.displayName,
  };

  currentUser = user;
  notifyAuthStateListeners();

  return user;
}

/**
 * Sign in with Google on native platforms (Android/iOS)
 */
async function signInNative(): Promise<User> {
  const { GoogleSignin } =
    await import('@react-native-google-signin/google-signin');
  const firebaseAuthModule = await import('@react-native-firebase/auth');

  // Check if Google Play Services are available (Android only)
  await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });

  // Sign in with Google
  const signInResult = await GoogleSignin.signIn();

  // Get the ID token
  const idToken = signInResult.data?.idToken;
  if (!idToken) {
    throw new Error('Failed to get ID token from Google Sign-In');
  }

  // Create Firebase credential
  const googleCredential =
    firebaseAuthModule.default.GoogleAuthProvider.credential(idToken);

  // Sign in to Firebase with the credential
  const userCredential =
    await firebaseAuth.signInWithCredential(googleCredential);
  const firebaseUser = userCredential.user;

  const user: User = {
    uid: firebaseUser.uid,
    email: firebaseUser.email || '',
    displayName: firebaseUser.displayName,
  };

  currentUser = user;
  notifyAuthStateListeners();

  return user;
}

/**
 * Sign out the current user
 * Clears stored credentials and reverts to local-only mode
 * @requirements 1.4 - Sign out and clear credentials
 */
export async function signOut(): Promise<void> {
  await initializeFirebase();

  try {
    if (Platform.OS === 'web') {
      const { signOut: firebaseSignOut } = await import('firebase/auth');
      await firebaseSignOut(firebaseAuth);
    } else {
      const { GoogleSignin } =
        await import('@react-native-google-signin/google-signin');

      // Sign out from Firebase
      await firebaseAuth.signOut();

      // Sign out from Google (revoke access)
      try {
        await GoogleSignin.revokeAccess();
        await GoogleSignin.signOut();
      } catch {
        // Ignore Google Sign-In sign out errors
      }
    }

    currentUser = null;
    notifyAuthStateListeners();
  } catch (error) {
    console.error('Sign-out error:', error);
    // Still clear local state even if remote sign-out fails
    currentUser = null;
    notifyAuthStateListeners();
  }
}

/**
 * Get the currently authenticated user
 * @returns The current User or null if not authenticated
 */
export function getCurrentUser(): User | null {
  return currentUser;
}

/**
 * Subscribe to auth state changes
 * @param callback Function to call when auth state changes
 * @returns Unsubscribe function
 */
export function onAuthStateChanged(callback: AuthStateCallback): () => void {
  // Initialize Firebase if not already done
  initializeFirebase().catch(console.error);

  // Add listener
  authStateListeners.add(callback);

  // Immediately call with current state
  callback(currentUser);

  // Return unsubscribe function
  return () => {
    authStateListeners.delete(callback);
  };
}

/**
 * Check if the user is currently authenticated
 * @returns true if a user is signed in
 */
export function isAuthenticated(): boolean {
  return currentUser !== null;
}

/**
 * Get the current auth state
 * @returns Current AuthState object
 */
export function getAuthState(): AuthState {
  return {
    user: currentUser,
    isLoading: !isInitialized,
    error: null,
  };
}

// Export the AuthService interface for type checking
export interface AuthService {
  signIn(): Promise<User>;
  signOut(): Promise<void>;
  getCurrentUser(): User | null;
  onAuthStateChanged(callback: AuthStateCallback): () => void;
}

// Default export as an object implementing the AuthService interface
const authService: AuthService = {
  signIn,
  signOut,
  getCurrentUser,
  onAuthStateChanged,
};

export default authService;
