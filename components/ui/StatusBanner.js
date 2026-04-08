import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import theme from '../../theme';

const stylesByVariant = {
  warning: {
    icon: 'alert-circle-outline',
    iconColor: theme.colors.warning,
    border: 'rgba(244,200,79,0.34)',
    background: 'rgba(127, 31, 31, 0.5)',
  },
  success: {
    icon: 'checkmark-circle-outline',
    iconColor: theme.colors.success,
    border: 'rgba(30,220,115,0.34)',
    background: 'rgba(19,54,35,0.58)',
  },
  error: {
    icon: 'close-circle-outline',
    iconColor: theme.colors.error,
    border: 'rgba(255,92,122,0.34)',
    background: 'rgba(72,20,35,0.66)',
  },
};

const StatusBanner = ({ variant = 'warning', title, message, style }) => {
  const config = stylesByVariant[variant] || stylesByVariant.warning;

  return (
    <View
      style={[
        styles.container,
        { borderColor: config.border, backgroundColor: config.background },
        style,
      ]}
    >
      <Ionicons name={config.icon} size={22} color={config.iconColor} />
      <View style={styles.textWrap}>
        <Text style={styles.title}>{title}</Text>
        {message ? <Text style={styles.message}>{message}</Text> : null}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: theme.radius.md,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  textWrap: {
    marginLeft: theme.spacing.sm,
    flex: 1,
  },
  title: {
    color: theme.colors.textPrimary,
    fontSize: theme.typography.title,
    fontWeight: theme.typography.weights.bold,
  },
  message: {
    marginTop: 2,
    color: theme.colors.textSecondary,
    fontSize: theme.typography.caption,
  },
});

export default StatusBanner;
