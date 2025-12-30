import React from 'react';
import { Modal, View, Text, TouchableOpacity } from 'react-native';
import { useSettings } from '../../context/SettingsContext';

type ErrorModalProps = {
  visible: boolean;
  message: string | null;
  onDismiss: () => void;
};

export function ErrorModal({ visible, message, onDismiss }: ErrorModalProps) {
  const { styles } = useSettings();

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      onRequestClose={onDismiss}
    >
      <View style={styles.modalBackdrop}>
        <View style={styles.infoCard}>
          <Text style={styles.modalTitle}>Unexpected error</Text>
          <Text style={styles.infoBody}>{message}</Text>
          <TouchableOpacity
            style={[styles.button, styles.primaryButton]}
            onPress={onDismiss}
          >
            <Text style={styles.buttonLabel}>Dismiss</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}
