import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import theme from '../../theme';

const DrawerItem = ({
  icon,
  label,
  onPress,
  showDivider = false,
  destructive = false,
  rightElement = null,
}) => (
  <View>
    <TouchableOpacity style={styles.row} activeOpacity={0.85} onPress={onPress}>
      <Ionicons
        name={icon}
        size={22}
        color={destructive ? theme.colors.error : theme.colors.primary}
        style={styles.icon}
      />
      <Text style={[styles.label, destructive ? styles.destructiveText : null]}>{label}</Text>
      {rightElement}
    </TouchableOpacity>

    {showDivider ? <View style={styles.divider} /> : null}
  </View>
);

const styles = StyleSheet.create({
  row: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.md,
  },
  icon: {
    marginRight: theme.spacing.md,
  },
  label: {
    color: theme.colors.textPrimary,
    fontSize: theme.typography.title,
    fontWeight: theme.typography.weights.medium,
    flex: 1,
  },
  destructiveText: {
    color: theme.colors.textSecondary,
  },
  divider: {
    height: 1,
    marginHorizontal: theme.spacing.md,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
});

export default DrawerItem;
