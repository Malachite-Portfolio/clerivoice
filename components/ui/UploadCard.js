import React from 'react';
import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import theme from '../../theme';

const statusConfig = {
  idle: {
    icon: 'cloud-upload-outline',
    color: theme.colors.textSecondary,
  },
  success: {
    icon: 'checkmark-circle',
    color: theme.colors.success,
  },
  error: {
    icon: 'close-circle',
    color: theme.colors.error,
  },
};

const UploadCard = ({
  imageUri,
  title = 'Upload image',
  subtitle,
  helperLeft,
  helperRight,
  status = 'idle',
  onPress,
  style,
}) => {
  const indicator = statusConfig[status] || statusConfig.idle;

  return (
    <TouchableOpacity style={[styles.card, style]} activeOpacity={0.9} onPress={onPress}>
      {imageUri ? (
        <Image source={{ uri: imageUri }} style={styles.image} />
      ) : (
        <View style={styles.placeholder}>
          <Ionicons name="image-outline" size={34} color={theme.colors.textMuted} />
        </View>
      )}

      <View style={styles.overlay}>
        <Text style={styles.title}>{title}</Text>
      </View>

      <View style={styles.footerRow}>
        <View style={styles.helperRow}>
          {helperLeft ? <Text style={styles.helperText}>{helperLeft}</Text> : null}
          {helperRight ? <Text style={styles.helperText}>{helperRight}</Text> : null}
        </View>
        <Ionicons name={indicator.icon} size={22} color={indicator.color} />
      </View>

      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.borderSoft,
    backgroundColor: theme.colors.secondary,
    padding: theme.spacing.sm,
  },
  image: {
    width: '100%',
    height: 220,
    borderRadius: theme.radius.md,
    backgroundColor: '#32243f',
  },
  placeholder: {
    width: '100%',
    height: 220,
    borderRadius: theme.radius.md,
    backgroundColor: '#2B1F38',
    alignItems: 'center',
    justifyContent: 'center',
  },
  overlay: {
    position: 'absolute',
    left: theme.spacing.sm,
    right: theme.spacing.sm,
    top: 174,
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderBottomLeftRadius: theme.radius.md,
    borderBottomRightRadius: theme.radius.md,
    paddingVertical: 8,
    alignItems: 'center',
  },
  title: {
    color: theme.colors.textPrimary,
    fontSize: theme.typography.title,
    fontWeight: theme.typography.weights.semibold,
  },
  footerRow: {
    marginTop: theme.spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  helperRow: {
    flexDirection: 'row',
    gap: theme.spacing.md,
  },
  helperText: {
    color: theme.colors.textSecondary,
    fontSize: theme.typography.caption,
    fontWeight: theme.typography.weights.medium,
  },
  subtitle: {
    marginTop: theme.spacing.xs,
    color: theme.colors.textMuted,
    fontSize: theme.typography.caption,
  },
});

export default UploadCard;
