import React from 'react';
import { View, TextInput, TouchableOpacity, Text, Pressable } from 'react-native';
import { useSettings } from '../context/SettingsContext';

type PressableState = {
  hovered?: boolean;
  pressed?: boolean;
};

type SearchBarProps = {
  value: string;
  onChangeText: (text: string) => void;
  onClose: () => void;
  showFavoritesOnly: boolean;
  onToggleFavorites: () => void;
};

export function SearchBar({
  value,
  onChangeText,
  onClose,
  showFavoritesOnly,
  onToggleFavorites,
}: SearchBarProps) {
  const { styles, palette } = useSettings();

  return (
    <View style={styles.searchBar}>
      <Pressable
        onPress={onToggleFavorites}
        style={({ hovered, pressed }: PressableState) => [
          styles.favFilterButton,
          showFavoritesOnly && styles.favFilterButtonActive,
          (hovered || pressed) && styles.favFilterButtonHover,
        ]}
      >
        <Text
          style={[
            styles.favFilterIcon,
            showFavoritesOnly && styles.favFilterIconActive,
          ]}
        >
          ★
        </Text>
      </Pressable>
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
