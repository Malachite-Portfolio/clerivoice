import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import theme from '../../theme';

const SelectionCard = ({
  title,
  subtitle,
  selected = false,
  onPress,
  style,
  textAlign = 'center',
}) => (
  <Pressable
    onPress={onPress}
    style={({ pressed }) => [
      styles.card,
      selected ? styles.selectedCard : null,
      pressed ? styles.pressed : null,
      style,
    ]}
  >
    <Text style={[styles.title, { textAlign }]} numberOfLines={2}>
      {title}
    </Text>
    {subtitle ? (
      <Text style={[styles.subtitle, { textAlign }]} numberOfLines={2}>
        {subtitle}
      </Text>
    ) : null}
  </Pressable>
);

const styles = StyleSheet.create({
  card: {
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.borderSoft,
    backgroundColor: theme.colors.secondary,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
    minHeight: 52,
    justifyContent: 'center',
  },
  selectedCard: {
    borderColor: theme.colors.borderStrong,
    backgroundColor: theme.colors.primary,
  },
  pressed: {
    transform: [{ scale: 0.99 }],
  },
  title: {
    color: theme.colors.textPrimary,
    fontSize: theme.typography.body,
    fontWeight: theme.typography.weights.semibold,
  },
  subtitle: {
    marginTop: 4,
    color: theme.colors.textSecondary,
    fontSize: theme.typography.caption,
  },
});

export default SelectionCard;
