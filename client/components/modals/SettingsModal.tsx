import React from 'react';
import { Modal, View, Text, TouchableOpacity, Pressable } from 'react-native';
import { useSettings } from '../../context/SettingsContext';
import { GoogleAuthButton } from '../GoogleAuthButton';
import { SyncStatusIndicator } from '../SyncStatusIndicator';
import { User } from '../../../services/authService';

type SettingsModalProps = {
  visible: boolean;
  onClose: () => void;
  onSignIn?: (user: User) => void;
  onSignOut?: () => void;
  onSyncRetry?: () => void;
};

function Checkbox({
  checked,
  onPress,
}: {
  checked: boolean;
  onPress: () => void;
}) {
  const { styles } = useSettings();

  return (
    <Pressable
      onPress={onPress}
      style={[styles.checkbox, checked && styles.checkboxChecked]}
    >
      {checked && <Text style={styles.checkboxMark}>✓</Text>}
    </Pressable>
  );
}

export function SettingsModal({
  visible,
  onClose,
  onSignIn,
  onSignOut,
  onSyncRetry,
}: SettingsModalProps) {
  const { styles, themePref, setThemePref, compactUI, setCompactUI } =
    useSettings();

  const isDarkMode = themePref === 'dark';

  const handleDarkModeToggle = () => {
    // Toggle between dark and light (not auto)
    setThemePref(isDarkMode ? 'light' : 'dark');
  };

  const handleCompactUIToggle = () => {
    setCompactUI(!compactUI);
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.modalBackdrop}>
        <View style={styles.modalCard}>
          <Text style={styles.modalTitle}>Settings</Text>

          <View style={styles.settingsRow}>
            <Text style={styles.settingsLabel}>Dark Mode</Text>
            <Checkbox checked={isDarkMode} onPress={handleDarkModeToggle} />
          </View>

          <View style={styles.settingsRow}>
            <Text style={styles.settingsLabel}>Compact UI</Text>
            <Checkbox checked={compactUI} onPress={handleCompactUIToggle} />
          </View>

          {/* Google Sync Section */}
          <View style={styles.settingsSectionHeader}>
            <Text style={styles.settingsSectionTitle}>Cloud Sync</Text>
            <SyncStatusIndicator onRetry={onSyncRetry} />
          </View>

          <View style={[styles.settingsRow, { borderBottomWidth: 0 }]}>
            <GoogleAuthButton onSignIn={onSignIn} onSignOut={onSignOut} />
          </View>

          <View style={styles.modalActions}>
            <TouchableOpacity
              style={[styles.button, styles.primaryButton]}
              onPress={onClose}
            >
              <Text style={styles.buttonLabel}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}
