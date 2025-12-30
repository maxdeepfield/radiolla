import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Pressable,
  Platform,
} from 'react-native';
import { useSettings } from '../context/SettingsContext';
import type { Station } from '../context/StationsContext';

type PressableState = {
  hovered?: boolean;
  pressed?: boolean;
  focused?: boolean;
};

type StationCardProps = {
  station: Station;
  isPlaying: boolean;
  isHighlighted: boolean;
  isDragging: boolean;
  isDraggedOver: boolean;
  showActions: boolean;
  onPress: () => void;
  onLongPress: () => void;
  onMenuPress: () => void;
  onEdit: () => void;
  onRemove: () => void;
  onCloseMenu: () => void;
};

export function StationCard({
  station,
  isPlaying,
  isHighlighted,
  isDragging,
  isDraggedOver,
  showActions,
  onPress,
  onLongPress,
  onMenuPress,
  onEdit,
  onRemove,
  onCloseMenu,
}: StationCardProps) {
  const { styles } = useSettings();

  return (
    <View
      style={isDraggedOver && styles.draggedOverCard}
      {...(Platform.OS === 'web' && ({ 'data-station-id': station.id } as any))}
    >
      <Pressable onLongPress={onLongPress} delayLongPress={500}>
        <TouchableOpacity
          activeOpacity={0.95}
          onPress={() => !isDragging && onPress()}
          style={[
            styles.card,
            isHighlighted && styles.activeCard,
            isPlaying && styles.playingCard,
            isDragging && styles.draggingCard,
          ]}
        >
          <View style={styles.cardMain}>
            <View style={styles.cardText}>
              <Text style={styles.cardTitle} numberOfLines={1}>
                {station.name}
              </Text>
              <Text style={styles.cardSubtitle} numberOfLines={1}>
                {station.url}
              </Text>
            </View>
            <Pressable
              onPress={onMenuPress}
              hitSlop={6}
              style={({ hovered, pressed }: PressableState) => [
                styles.cardMenuButton,
                (hovered || pressed) && styles.cardMenuButtonActive,
                showActions && styles.cardMenuButtonActive,
              ]}
            >
              <Text style={styles.cardMenuIcon}>⋮</Text>
            </Pressable>
          </View>
          {showActions && (
            <View style={styles.cardMenuSheet}>
              <Pressable
                style={({ hovered, pressed }: PressableState) => [
                  styles.cardMenuItem,
                  (hovered || pressed) && styles.cardMenuItemActive,
                ]}
                onPress={onEdit}
              >
                <Text style={styles.cardMenuLabel}>Edit</Text>
              </Pressable>
              <View style={styles.menuDivider} />
              <Pressable
                style={({ hovered, pressed }: PressableState) => [
                  styles.cardMenuItem,
                  (hovered || pressed) && styles.cardMenuItemActive,
                ]}
                onPress={onRemove}
              >
                <Text style={styles.cardMenuLabel}>Remove</Text>
              </Pressable>
              <View style={styles.menuDivider} />
              <Pressable
                style={({ hovered, pressed }: PressableState) => [
                  styles.cardMenuItem,
                  (hovered || pressed) && styles.cardMenuItemActive,
                ]}
                onPress={onCloseMenu}
              >
                <Text style={styles.cardMenuLabel}>Close</Text>
              </Pressable>
            </View>
          )}
        </TouchableOpacity>
      </Pressable>
    </View>
  );
}
