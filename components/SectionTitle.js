import React from 'react';
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import theme from '../constants/theme';

const SectionTitle = ({ title, actionLabel, onActionPress, style }) => {
  return (
    <View style={[styles.row, style]}>
      <Text style={styles.title}>{title}</Text>
      {actionLabel ? (
        <TouchableOpacity onPress={onActionPress} activeOpacity={0.75}>
          <Text style={styles.action}>{actionLabel}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: theme.spacing.sm,
  },
  title: {
    color: theme.colors.magenta,
    fontSize: theme.typography.body,
    fontWeight: '600',
  },
  action: {
    color: theme.colors.textSecondary,
    fontSize: theme.typography.caption,
    fontWeight: '500',
  },
});

export default SectionTitle;
