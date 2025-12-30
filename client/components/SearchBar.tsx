import React from 'react';
import { View, TextInput, TouchableOpacity, Text } from 'react-native';
import { useSettings } from '../context/SettingsContext';

type SearchBarProps = {
  value: string;
  onChangeText: (text: string) => void;
  onClose: () => void;
};

export function SearchBar({ value, onChangeText, onClose }: SearchBarProps) {
  const { styles, palette } = useSettings();

  return (
    <View style={styles.searchBar}>
      <TextInput
        style={styles.searchInput}
        placeholder="Filter stations..."
        placeholderTextColor={palette.textSecondary}
        value={value}
        onChangeText={onChangeText}
        autoFocus
      />
      <TouchableOpacity style={styles.searchCloseButton} onPress={onClose}>
        <Text style={styles.searchCloseLabel}>Clear</Text>
      </TouchableOpacity>
    </View>
  );
}
