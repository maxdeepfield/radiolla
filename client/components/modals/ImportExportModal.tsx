import React, { useState } from 'react';
import { Modal, View, Text, TouchableOpacity, Platform } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { useSettings } from '../../context/SettingsContext';
import { useStations } from '../../context/StationsContext';
import {
  parsePlaylist,
  generateM3U,
  generatePLS,
} from '../../../utils/playlist';

type ImportExportModalProps = {
  visible: boolean;
  onClose: () => void;
  onClearStations: () => Promise<void>;
};

export function ImportExportModal({
  visible,
  onClose,
  onClearStations,
}: ImportExportModalProps) {
  const { styles } = useSettings();
  const { stations, importStations } = useStations();
  const [importStatus, setImportStatus] = useState<string | null>(null);

  const handleImportFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type:
          Platform.OS === 'web'
            ? '.m3u,.pls'
            : ['audio/x-mpegurl', 'audio/mpegurl', 'audio/x-scpls', '*/*'],
        copyToCacheDirectory: true,
        multiple: true,
      });

      if (result.canceled) return;

      const files = result.assets;
      const allNewStations: { id: string; name: string; url: string }[] = [];

      for (const file of files) {
        let content = '';
        if (Platform.OS === 'web') {
          const response = await fetch(file.uri);
          content = await response.text();
        } else {
          content = await FileSystem.readAsStringAsync(file.uri);
        }
        const newStations = parsePlaylist(content);
        allNewStations.push(...newStations);
      }

      if (allNewStations.length === 0) {
        setImportStatus('No valid stations found in selected files.');
        return;
      }

      await importStations(allNewStations);
      setImportStatus(
        `Imported ${allNewStations.length} stations from ${files.length} file${files.length > 1 ? 's' : ''}!`
      );
      setTimeout(() => onClose(), 1500);
    } catch (e: any) {
      setImportStatus(`Error: ${e.message || 'Failed to import file'}`);
    }
  };

  const downloadFile = async (
    content: string,
    filename: string,
    mimeType: string
  ) => {
    if (Platform.OS === 'web') {
      const blob = new Blob([content], { type: mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } else {
      const fileUri = FileSystem.cacheDirectory + filename;
      await FileSystem.writeAsStringAsync(fileUri, content, {
        encoding: FileSystem.EncodingType.UTF8,
      });
      await Sharing.shareAsync(fileUri, {
        mimeType,
        dialogTitle: `Save ${filename}`,
      });
    }
  };

  const handleExportM3U = async () => {
    try {
      const content = generateM3U(stations);
      await downloadFile(content, 'radiolla_stations.m3u', 'audio/x-mpegurl');
      setImportStatus('M3U file saved!');
    } catch (e: any) {
      setImportStatus(`Error: ${e.message}`);
    }
  };

  const handleExportPLS = async () => {
    try {
      const content = generatePLS(stations);
      await downloadFile(content, 'radiolla_stations.pls', 'audio/x-scpls');
      setImportStatus('PLS file saved!');
    } catch (e: any) {
      setImportStatus(`Error: ${e.message}`);
    }
  };

  const handleClearStations = async () => {
    if (stations.length === 0) {
      setImportStatus('Stations list is already empty.');
      return;
    }
    await onClearStations();
    setImportStatus('Stations cleared.');
  };

  const handleClose = () => {
    setImportStatus(null);
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
          <Text style={styles.modalTitle}>Import / Export</Text>
          <Text style={styles.cardSubtitle}>
            Import M3U/PLS files or export your stations.
          </Text>

          {importStatus && (
            <Text
              style={{
                color: '#10b981',
                marginVertical: 10,
                textAlign: 'center',
              }}
            >
              {importStatus}
            </Text>
          )}

          <TouchableOpacity
            style={[styles.button, styles.primaryButton, { marginBottom: 10 }]}
            onPress={handleImportFile}
          >
            <Text style={styles.buttonLabel}>📂 Import File (M3U/PLS)</Text>
          </TouchableOpacity>

          <View style={{ flexDirection: 'row', gap: 10, marginBottom: 10 }}>
            <TouchableOpacity
              style={[styles.button, styles.secondaryButton, { flex: 1 }]}
              onPress={handleExportM3U}
            >
              <Text style={styles.buttonLabel}>Save M3U</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.button, styles.secondaryButton, { flex: 1 }]}
              onPress={handleExportPLS}
            >
              <Text style={styles.buttonLabel}>Save PLS</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={[
              styles.button,
              styles.destructiveButton,
              { marginBottom: 10 },
              stations.length === 0 && styles.disabledButton,
            ]}
            onPress={handleClearStations}
            disabled={stations.length === 0}
          >
            <Text style={[styles.buttonLabel, styles.destructiveLabel]}>
              Clear Stations
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={{ alignSelf: 'center', marginTop: 5 }}
            onPress={handleClose}
          >
            <Text style={styles.cardSubtitle}>Close</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}
