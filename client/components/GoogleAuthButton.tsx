/**
 * GoogleAuthButton Component
 * Displays Google Sign-In button when signed out, user info and sign out when signed in.
 *
 * @requirements 1.1, 1.2, 1.3, 1.4 - Google Authentication UI
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  Pressable,
} from 'react-native';
import { useSettings } from '../context/SettingsContext';
import authService, { User } from '../../services/authService';

type PressableState = {
  hovered?: boolean;
  pressed?: boolean;
};

type GoogleAuthButtonProps = {
  onSignIn?: (user: User) => void;
  onSignOut?: () => void;
  onError?: (error: string) => void;
};

/**
 * GoogleAuthButton displays authentication state and handles sign-in/sign-out.
 *
 * - Shows "Sign in with Google" button when signed out
 * - Shows user email and "Sign out" button when signed in
 * - Handles loading and error states
 */
export function GoogleAuthButton({
  onSignIn,
  onSignOut,
  onError,
}: GoogleAuthButtonProps) {
  const { styles, palette } = useSettings();
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Subscribe to auth state changes
  useEffect(() => {
    const unsubscribe = authService.onAuthStateChanged(authUser => {
      setUser(authUser);
    });

    return unsubscribe;
  }, []);

  /**
   * Handle sign in button press
   * @requirements 1.1, 1.2 - Initiate Google OAuth flow
   */
  const handleSignIn = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const signedInUser = await authService.signIn();
      onSignIn?.(signedInUser);
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Authentication failed';

      // Don't show error for user cancellation
      if (!errorMessage.includes('cancelled')) {
        setError(errorMessage);
        onError?.(errorMessage);
      }
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Handle sign out button press
   * @requirements 1.4 - Clear credentials and revert to local-only mode
   */
  const handleSignOut = async () => {
    setIsLoading(true);
    setError(null);

    try {
      await authService.signOut();
      onSignOut?.();
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Sign out failed';
      setError(errorMessage);
      onError?.(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  // Signed in state - show user info and sign out button
  if (user) {
    return (
      <View style={{ gap: 8 }}>
        <View style={styles.menuHeader}>
          <Text style={styles.menuHeaderLabel}>Signed in as</Text>
          <Text style={styles.menuHeaderEmail} numberOfLines={1}>
            {user.email}
          </Text>
        </View>

        {error && <Text style={styles.error}>{error}</Text>}

        <Pressable
          style={({ hovered, pressed }: PressableState) => [
            styles.menuItem,
            styles.menuItemDestructive,
            (hovered || pressed) && styles.menuItemDestructiveActive,
          ]}
          onPress={handleSignOut}
          disabled={isLoading}
        >
          <View style={styles.menuItemRow}>
            <Text style={[styles.menuItemLabel, styles.destructiveLabel]}>
              Sign out
            </Text>
            {isLoading && (
              <ActivityIndicator
                size="small"
                color={palette.destructiveStrong}
              />
            )}
          </View>
        </Pressable>
      </View>
    );
  }

  // Signed out state - show sign in button
  return (
    <View style={{ gap: 8 }}>
      {error && <Text style={styles.error}>{error}</Text>}

      <Pressable
        style={({ hovered, pressed }: PressableState) => [
          styles.menuItem,
          styles.menuItemPrimary,
          (hovered || pressed) && styles.menuItemPrimaryActive,
        ]}
        onPress={handleSignIn}
        disabled={isLoading}
      >
        <View style={styles.menuItemRow}>
          <Text style={styles.menuItemLabel}>Sign in with Google</Text>
          {isLoading && (
            <ActivityIndicator size="small" color={palette.accentStrong} />
          )}
        </View>
      </Pressable>
    </View>
  );
}
