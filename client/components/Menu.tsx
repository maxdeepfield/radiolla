import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Pressable,
} from 'react-native';
import { useSettings } from '../context/SettingsContext';

type PressableState = {
  hovered?: boolean;
  pressed?: boolean;
};

type MenuProps = {
  visible: boolean;
  onClose: () => void;
  onAddStation: () => void;
  onImportExport: () => void;
  onSettings: () => void;
  onAbout: () => void;
};

export function Menu({
  visible,
  onClose,
  onAddStation,
  onImportExport,
  onSettings,
  onAbout,
}: MenuProps) {
  const { styles } = useSettings();

  if (!visible) return null;

  return (
    <>
      <TouchableOpacity
        style={styles.menuBackdrop}
        activeOpacity={1}
        onPress={onClose}
      />
      <View style={styles.menuPanel}>
        <ScrollView
          contentContainerStyle={styles.menuContent}
          showsVerticalScrollIndicator={false}
          bounces={false}
        >
          <Pressable
            style={({ hovered, pressed }: PressableState) => [
              styles.menuItem,
              (hovered || pressed) && styles.menuItemActive,
            ]}
            onPress={onAddStation}
          >
            <Text style={styles.menuItemLabel}>Add station</Text>
          </Pressable>
          <View style={styles.menuDivider} />
          <Pressable
            style={({ hovered, pressed }: PressableState) => [
              styles.menuItem,
              (hovered || pressed) && styles.menuItemActive,
            ]}
            onPress={onImportExport}
          >
            <Text style={styles.menuItemLabel}>Import / Export</Text>
          </Pressable>
          <View style={styles.menuDivider} />
          <Pressable
            style={({ hovered, pressed }: PressableState) => [
              styles.menuItem,
              (hovered || pressed) && styles.menuItemActive,
            ]}
            onPress={onSettings}
          >
            <Text style={styles.menuItemLabel}>Settings</Text>
          </Pressable>
          <View style={styles.menuDivider} />
          <Pressable
            style={({ hovered, pressed }: PressableState) => [
              styles.menuItem,
              (hovered || pressed) && styles.menuItemActive,
            ]}
            onPress={onAbout}
          >
            <Text style={styles.menuItemLabel}>About</Text>
          </Pressable>
        </ScrollView>
      </View>
    </>
  );
}
