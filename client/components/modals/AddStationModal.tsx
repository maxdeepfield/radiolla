import React, { useState, useEffect } from 'react';
import { Modal, View, Text, TextInput, TouchableOpacity } from 'react-native';
import { useSettings } from '../../context/SettingsContext';
import type { Station } from '../../context/StationsContext';

type AddStationModalProps = {
  visible: boolean;
  editingStation: Station | null;
  onClose: () => void;
  onSave: (name: string, url: string) => void;
};

export function AddStationModal({
  visible,
  editingStation,
  onClose,
  onSave,
}: AddStationModalProps) {
  const { styles } = useSettings();
  const [nameInput, setNameInput] = useState('');
  const [urlInput, setUrlInput] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      if (editingStation) {
        setNameInput(editingStation.name);
        setUrlInput(editingStation.url);
      } else {
        setNameInput('');
        setUrlInput('');
      }
      setFormError(null);
    }
  }, [visible, editingStation]);

  const handleSave = () => {
    setFormError(null);
    if (!nameInput.trim() || !urlInput.trim()) {
      setFormError('Name and stream URL are required.');
      return;
    }
    if (!/^https?:\/\//i.test(urlInput.trim())) {
      setFormError('Stream URL should start with http or https.');
      return;
    }
    onSave(nameInput.trim(), urlInput.trim());
  };

  const handleClose = () => {
    setNameInput('');
    setUrlInput('');
    setFormError(null);
    onClose();
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={handleClose}
    >
      <View style={styles.modalBackdrop}>
        <View style={styles.modalCard}>
          <Text style={styles.modalTitle}>
            {editingStation ? 'Edit a station' : 'Add a station'}
          </Text>
          <TextInput
            placeholder="Station name"
            value={nameInput}
            onChangeText={setNameInput}
            style={styles.input}
            placeholderTextColor="#94a3b8"
          />
          <TextInput
            placeholder="Stream URL"
            value={urlInput}
            onChangeText={setUrlInput}
            style={styles.input}
            autoCapitalize="none"
            placeholderTextColor="#94a3b8"
          />
          {formError && <Text style={styles.error}>{formError}</Text>}
          <View style={styles.modalActions}>
            <TouchableOpacity
              style={[styles.button, styles.secondaryButton]}
              onPress={handleClose}
            >
              <Text style={styles.buttonLabel}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.button, styles.primaryButton]}
              onPress={handleSave}
            >
              <Text style={styles.buttonLabel}>
                {editingStation ? 'Update' : 'Save'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}
