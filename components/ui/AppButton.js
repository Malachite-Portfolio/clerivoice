import React from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import theme from '../../theme';

const AppButton = ({
  title,
  onPress,
  variant = 'primary',
  disabled = false,
  loading = false,
  style,
  textStyle,
  leftIcon = null,
  rightIcon = null,
}) => {
  const isPrimary = variant === 'primary';
  const inactive = disabled || loading;

  return (
    <TouchableOpacity
      activeOpacity={0.88}
      onPress={onPress}
      disabled={inactive}
      style={[styles.touchable, inactive ? styles.disabled : null, style]}
    >
      {isPrimary ? (
        <LinearGradient
          colors={theme.gradients.cta}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={styles.inner}
        >
          <View style={styles.content}>
            {leftIcon}
            <Text style={[styles.primaryText, textStyle]}>{title}</Text>
            {rightIcon}
          </View>
        </LinearGradient>
      ) : (
        <View style={styles.secondaryInner}>
          <View style={styles.content}>
            {leftIcon}
            <Text style={[styles.secondaryText, textStyle]}>{title}</Text>
            {rightIcon}
          </View>
        </View>
      )}

      {loading ? (
        <View style={styles.loaderOverlay}>
          <ActivityIndicator color={theme.colors.white} size="small" />
        </View>
      ) : null}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  touchable: {
    height: 56,
    borderRadius: theme.radius.round,
    overflow: 'hidden',
  },
  disabled: {
    opacity: 0.6,
  },
  inner: {
    flex: 1,
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: theme.colors.borderStrong,
  },
  secondaryInner: {
    flex: 1,
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: theme.colors.borderSoft,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: theme.spacing.lg,
  },
  primaryText: {
    color: theme.colors.white,
    fontSize: theme.typography.button,
    fontWeight: theme.typography.weights.bold,
  },
  secondaryText: {
    color: theme.colors.textPrimary,
    fontSize: theme.typography.button,
    fontWeight: theme.typography.weights.semibold,
  },
  loaderOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.15)',
  },
});

export default AppButton;
