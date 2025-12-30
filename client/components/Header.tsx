import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { useSettings } from '../context/SettingsContext';
import { INSETS } from '../styles/theme';

type HeaderProps = {
  onMenuPress: () => void;
  onSearchPress: () => void;
};

export function Header({ onMenuPress, onSearchPress }: HeaderProps) {
  const { styles } = useSettings();

  return (
    <View style={[styles.topBar, { paddingTop: INSETS.top + 6 }]}>
      <View>
        <Text style={styles.heading}>Radiolla</Text>
        <Text style={styles.headingBadge}>Absolute Freakout</Text>
      </View>
      <View style={styles.topBarActions}>
        <TouchableOpacity
          style={[styles.menuButton, styles.searchButton]}
          onPress={onSearchPress}
          activeOpacity={0.8}
        >
          <Text style={styles.searchIcon}>⌕</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.menuButton}
          onPress={onMenuPress}
          activeOpacity={0.8}
        >
          <View style={styles.menuIconLine} />
          <View style={styles.menuIconLine} />
          <View style={styles.menuIconLine} />
        </TouchableOpacity>
      </View>
    </View>
  );
}
