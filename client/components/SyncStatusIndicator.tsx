/**
 * SyncStatusIndicator Component
 * Displays the current sync status with visual indicators.
 *
 * @requirements 5.1, 5.2, 5.3, 5.4 - Sync Status Display
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  Animated,
} from 'react-native';
import { useSettings } from '../context/SettingsContext';
import syncService, { SyncState } from '../../services/syncService';
import authService from '../../services/authService';

type SyncStatusIndicatorProps = {
  onRetry?: () => void;
};

/**
 * SyncStatusIndicator displays the current synchronization status.
 *
 * - Shows sync progress indicator when syncing
 * - Shows success indicator briefly after sync
 * - Shows error indicator with retry option on failure
 * - Shows "Local only" when not signed in
 */
export function SyncStatusIndicator({ onRetry }: SyncStatusIndicatorProps) {
  const { styles, palette } = useSettings();
  const [syncState, setSyncState] = useState<SyncState>(
    syncService.getSyncState()
  );
  const [isSignedIn, setIsSignedIn] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const fadeAnim = useRef(new Animated.Value(1)).current;

  // Subscribe to sync state changes
  useEffect(() => {
    const unsubscribe = syncService.onSyncStateChanged(state => {
      setSyncState(state);

      // Show success indicator briefly when sync completes
      if (state === 'synced') {
        setShowSuccess(true);
        fadeAnim.setValue(1);

        // Fade out after 2 seconds
        const timer = setTimeout(() => {
          Animated.timing(fadeAnim, {
            toValue: 0,
            duration: 500,
            useNativeDriver: true,
          }).start(() => {
            setShowSuccess(false);
          });
        }, 2000);

        return () => clearTimeout(timer);
      }
    });

    return unsubscribe;
  }, [fadeAnim]);

  // Subscribe to auth state changes
  useEffect(() => {
    const unsubscribe = authService.onAuthStateChanged(user => {
      setIsSignedIn(user !== null);
    });

    return unsubscribe;
  }, []);

  /**
   * Get status text based on current state
   */
  const getStatusText = (): string => {
    if (!isSignedIn) {
      return 'Local only';
    }

    switch (syncState) {
      case 'syncing':
        return 'Syncing...';
      case 'synced':
        return 'Synced';
      case 'error':
        return 'Sync failed';
      case 'offline':
        return 'Offline';
      case 'idle':
      default:
        return 'Ready';
    }
  };

  /**
   * Get status icon based on current state
   */
  const getStatusIcon = (): string => {
    if (!isSignedIn) {
      return '📱';
    }

    switch (syncState) {
      case 'synced':
        return '✓';
      case 'error':
        return '⚠';
      case 'offline':
        return '○';
      case 'idle':
      default:
        return '☁';
    }
  };

  /**
   * Get status color based on current state
   */
  const getStatusColor = (): string => {
    if (!isSignedIn) {
      return palette.textSecondary;
    }

    switch (syncState) {
      case 'synced':
        return palette.accentStrong;
      case 'error':
        return palette.destructiveStrong;
      case 'offline':
        return palette.textSecondary;
      case 'syncing':
        return palette.accentStrong;
      case 'idle':
      default:
        return palette.textSecondary;
    }
  };

  // Syncing state - show spinner
  if (isSignedIn && syncState === 'syncing') {
    return (
      <View style={indicatorStyles.container}>
        <ActivityIndicator size="small" color={palette.accentStrong} />
        <Text style={[styles.menuItemHint, { color: palette.accentStrong }]}>
          {getStatusText()}
        </Text>
      </View>
    );
  }

  // Success state with fade animation
  if (isSignedIn && showSuccess) {
    return (
      <Animated.View style={[indicatorStyles.container, { opacity: fadeAnim }]}>
        <Text style={[indicatorStyles.icon, { color: getStatusColor() }]}>
          {getStatusIcon()}
        </Text>
        <Text style={[styles.menuItemHint, { color: getStatusColor() }]}>
          {getStatusText()}
        </Text>
      </Animated.View>
    );
  }

  // Error state - show retry button
  if (isSignedIn && syncState === 'error') {
    return (
      <View style={indicatorStyles.container}>
        <Text style={[indicatorStyles.icon, { color: getStatusColor() }]}>
          {getStatusIcon()}
        </Text>
        <Text style={[styles.menuItemHint, { color: getStatusColor() }]}>
          {getStatusText()}
        </Text>
        {onRetry && (
          <TouchableOpacity
            onPress={onRetry}
            style={[
              indicatorStyles.retryButton,
              { borderColor: palette.destructiveStrong },
            ]}
          >
            <Text
              style={[
                styles.menuItemHint,
                { color: palette.destructiveStrong },
              ]}
            >
              Retry
            </Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }

  // Default state - show status text
  return (
    <View style={indicatorStyles.container}>
      <Text style={[indicatorStyles.icon, { color: getStatusColor() }]}>
        {getStatusIcon()}
      </Text>
      <Text style={[styles.menuItemHint, { color: getStatusColor() }]}>
        {getStatusText()}
      </Text>
    </View>
  );
}

// Local styles for the indicator
const indicatorStyles = {
  container: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 6,
  },
  icon: {
    fontSize: 12,
  },
  retryButton: {
    marginLeft: 8,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    borderStyle: 'dashed' as const,
  },
};
