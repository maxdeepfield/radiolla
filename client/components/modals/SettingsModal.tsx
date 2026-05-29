import React from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  Pressable,
  Platform,
} from 'react-native';
import { useSettings } from '../../context/SettingsContext';

type SettingsModalProps = {
  visible: boolean;
  onClose: () => void;
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

export function SettingsModal({ visible, onClose }: SettingsModalProps) {
  const {
    styles,
    themePref,
    setThemePref,
    compactUI,
    setCompactUI,
    autoPlayOnBluetooth,
    setAutoPlayOnBluetooth,
  } = useSettings();

  const isDarkMode = themePref === 'dark';

  const handleDarkModeToggle = () => {
    setThemePref(isDarkMode ? 'light' : 'dark');
  };

  const handleCompactUIToggle = () => {
    setCompactUI(!compactUI);
  };

  const handleBluetoothAutoPlayToggle = () => {
    setAutoPlayOnBluetooth(!autoPlayOnBluetooth);
  };

  const showBluetoothAutoPlay = Platform.OS === 'android';

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

          <View
            style={[
              styles.settingsRow,
              !showBluetoothAutoPlay && styles.settingsRowLast,
            ]}
          >
            <Text style={styles.settingsLabel}>Compact UI</Text>
            <Checkbox checked={compactUI} onPress={handleCompactUIToggle} />
          </View>

          {showBluetoothAutoPlay && (
            <View style={[styles.settingsRow, styles.settingsRowLast]}>
              <Text style={styles.settingsLabel}>Auto-play on Bluetooth</Text>
              <Checkbox
                checked={autoPlayOnBluetooth}
                onPress={handleBluetoothAutoPlayToggle}
              />
            </View>
          )}

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
