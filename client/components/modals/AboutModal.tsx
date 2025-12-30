import React from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  Pressable,
  Linking,
} from 'react-native';
import { useSettings } from '../../context/SettingsContext';
import appConfig from '../../../app.json';

type PressableState = {
  hovered?: boolean;
  pressed?: boolean;
};

type AppConfig = {
  expo?: {
    version?: string;
  };
};

const APP_VERSION = (appConfig as AppConfig).expo?.version ?? '1.0.0';
const GITHUB_URL = 'https://github.com/maxdeepfield/Radiolla';
const AF_URL = 'https://absolutefreakout.com';

type AboutModalProps = {
  visible: boolean;
  onClose: () => void;
};

export function AboutModal({ visible, onClose }: AboutModalProps) {
  const { styles } = useSettings();

  const openExternalLink = async (target: string) => {
    try {
      await Linking.openURL(target);
    } catch {
      // ignore link failures
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.modalBackdrop}>
        <View style={styles.infoCard}>
          <Text style={styles.modalTitle}>About Radiolla</Text>
          <Text style={styles.infoBody}>
            Cross-platform radio streaming app. Add any stream URL and listen
            on desktop, mobile, or web.
          </Text>
          <Text style={styles.infoMeta}>Version {APP_VERSION}</Text>
          <View style={styles.linkList}>
            <Pressable
              style={({ hovered, pressed }: PressableState) => [
                styles.linkRow,
                (hovered || pressed) && styles.linkRowActive,
              ]}
              onPress={() => openExternalLink(GITHUB_URL)}
            >
              <Text style={styles.linkLabel}>GitHub repo</Text>
              <Text style={styles.linkHint}>{GITHUB_URL}</Text>
            </Pressable>
            <Pressable
              style={({ hovered, pressed }: PressableState) => [
                styles.linkRow,
                (hovered || pressed) && styles.linkRowActive,
              ]}
              onPress={() => openExternalLink(AF_URL)}
            >
              <Text style={styles.linkLabel}>AbsoluteFreakout.com</Text>
              <Text style={styles.linkHint}>{AF_URL}</Text>
            </Pressable>
          </View>
          <TouchableOpacity
            style={[styles.button, styles.primaryButton]}
            onPress={onClose}
          >
            <Text style={styles.buttonLabel}>Close</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}
