import React from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import theme from '../constants/theme';

const GradientButton = ({
  title,
  onPress,
  iconName,
  loading = false,
  disabled = false,
  style,
  textStyle,
  gradientColors = theme.gradients.cta,
}) => {
  const isDisabled = disabled || loading;

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={onPress}
      disabled={isDisabled}
      style={[styles.touchable, style]}
    >
      <LinearGradient
        colors={isDisabled ? ['#473347', '#473347'] : gradientColors}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.gradient}
      >
        {loading ? (
          <ActivityIndicator color={theme.colors.textPrimary} />
        ) : (
          <View style={styles.content}>
            {iconName ? (
              <View style={styles.iconBox}>
                <Ionicons
                  name={iconName}
                  size={18}
                  color={theme.colors.magenta}
                />
              </View>
            ) : null}
            <Text style={[styles.title, textStyle]}>{title}</Text>
          </View>
        )}
      </LinearGradient>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  touchable: {
    width: '100%',
    borderRadius: theme.radius.lg,
  },
  gradient: {
    minHeight: 58,
    borderRadius: theme.radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.md,
  },
  content: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.sm,
  },
  iconBox: {
    width: 28,
    height: 28,
    borderRadius: 10,
    backgroundColor: 'rgba(8, 5, 15, 0.95)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 42, 163, 0.35)',
  },
  title: {
    color: theme.colors.textPrimary,
    fontSize: theme.typography.title,
    fontWeight: '700',
    letterSpacing: 0.15,
  },
});

export default GradientButton;
