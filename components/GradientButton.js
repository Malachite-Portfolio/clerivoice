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
        colors={isDisabled ? ['#3D3143', '#3D3143'] : gradientColors}
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
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  gradient: {
    minHeight: 54,
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
    width: 26,
    height: 26,
    borderRadius: 9,
    backgroundColor: 'rgba(10, 8, 16, 0.95)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(207, 36, 155, 0.4)',
  },
  title: {
    color: theme.colors.textPrimary,
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
});

export default GradientButton;
