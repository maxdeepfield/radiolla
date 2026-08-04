import React from 'react';
import { View, Text, Pressable, Platform } from 'react-native';
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
  onPressIn?: () => void;
  onLongPress: () => void;
  onMenuPress: () => void;
  onEdit: () => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onCloseMenu: () => void;
  onToggleFavorite: () => void;
};

export function StationCard({
  station,
  isPlaying,
  isHighlighted,
  isDragging,
  isDraggedOver,
  showActions,
  onPress,
  onPressIn,
  onLongPress,
  onMenuPress,
  onEdit,
  onRemove,
  onMoveUp,
  onMoveDown,
  onCloseMenu,
  onToggleFavorite,
}: StationCardProps) {
  const { styles } = useSettings();

  return (
    <View
      style={isDraggedOver && styles.draggedOverCard}
      {...(Platform.OS === 'web' && ({ 'data-station-id': station.id } as any))}
    >
      <Pressable
        onLongPress={onLongPress}
        delayLongPress={500}
        onPressIn={onPressIn}
        onPress={() => !isDragging && onPress()}
        style={({ pressed }: PressableState) => [
          styles.card,
          (pressed || isHighlighted) && styles.activeCard,
          isPlaying && styles.playingCard,
          isDragging && styles.draggingCard,
        ]}
      >
        <View style={styles.cardMain}>
          <Pressable
            onPress={onToggleFavorite}
            hitSlop={4}
            style={({ hovered, pressed }: PressableState) => [
              styles.favoriteButton,
              (hovered || pressed) && styles.favoriteButtonActive,
            ]}
          >
            <Text
              style={[
                styles.favoriteIcon,
                station.favorite && styles.favoriteIconActive,
              ]}
            >
              {station.favorite ? '★' : '☆'}
            </Text>
          </Pressable>
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
              onPress={onToggleFavorite}
            >
              <Text style={styles.cardMenuLabel}>
                {station.favorite ? '★ Unfavorite' : '☆ Favorite'}
              </Text>
            </Pressable>
            <View style={styles.menuDivider} />
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
              onPress={onMoveUp}
            >
              <Text style={styles.cardMenuLabel}>Move Up</Text>
            </Pressable>
            <View style={styles.menuDivider} />
            <Pressable
              style={({ hovered, pressed }: PressableState) => [
                styles.cardMenuItem,
                (hovered || pressed) && styles.cardMenuItemActive,
              ]}
              onPress={onMoveDown}
            >
              <Text style={styles.cardMenuLabel}>Move Down</Text>
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
      </Pressable>
    </View>
  );
}
