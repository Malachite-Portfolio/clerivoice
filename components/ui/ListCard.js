import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import theme from '../../theme';
import ProfileAvatar from './ProfileAvatar';

const ListCard = ({
  avatarSource,
  name,
  meta,
  subtitle,
  priceLabel,
  ctaLabel = 'Talk Now',
  onPress,
  onCtaPress,
  online = true,
  showCta = true,
  rightTime,
  style,
}) => (
  <TouchableOpacity style={[styles.card, style]} activeOpacity={0.9} onPress={onPress}>
    <View style={styles.headerRow}>
      <View style={styles.identityRow}>
        <ProfileAvatar source={avatarSource} size={58} showOnline online={online} />
        <View style={styles.identityTextWrap}>
          <Text style={styles.name} numberOfLines={1}>
            {name}
          </Text>
          {meta ? <Text style={styles.meta}>{meta}</Text> : null}
        </View>
      </View>

      {rightTime ? <Text style={styles.rightTime}>{rightTime}</Text> : null}
    </View>

    {subtitle ? (
      <Text numberOfLines={2} style={styles.subtitle}>
        {subtitle}
      </Text>
    ) : null}

    <View style={styles.footerRow}>
      <View>
        {priceLabel ? <Text style={styles.priceLabel}>Starts from</Text> : null}
        {priceLabel ? <Text style={styles.price}>{priceLabel}</Text> : null}
      </View>

      {showCta ? (
        <TouchableOpacity activeOpacity={0.88} onPress={onCtaPress}>
          <View style={styles.ctaRow}>
            <Text style={styles.ctaText}>{ctaLabel.toUpperCase()}</Text>
            <Ionicons name="arrow-forward" size={16} color={theme.colors.primary} />
          </View>
        </TouchableOpacity>
      ) : null}
    </View>
  </TouchableOpacity>
);

const styles = StyleSheet.create({
  card: {
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.borderSoft,
    backgroundColor: 'rgba(255,255,255,0.03)',
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
    marginBottom: theme.spacing.md,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  identityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  identityTextWrap: {
    marginLeft: theme.spacing.md,
    flex: 1,
  },
  name: {
    color: theme.colors.textPrimary,
    fontSize: theme.typography.title,
    fontWeight: theme.typography.weights.bold,
  },
  meta: {
    marginTop: 2,
    color: theme.colors.textSecondary,
    fontSize: theme.typography.caption,
  },
  rightTime: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.caption,
    marginLeft: theme.spacing.sm,
  },
  subtitle: {
    marginTop: theme.spacing.sm,
    color: theme.colors.textSecondary,
    fontSize: theme.typography.caption,
    lineHeight: 18,
  },
  footerRow: {
    marginTop: theme.spacing.md,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  priceLabel: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.caption,
  },
  price: {
    marginTop: 2,
    color: theme.colors.textPrimary,
    fontSize: theme.typography.h3,
    fontWeight: theme.typography.weights.bold,
  },
  ctaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  ctaText: {
    color: theme.colors.primary,
    fontSize: theme.typography.title,
    fontWeight: theme.typography.weights.bold,
    letterSpacing: 0.2,
  },
});

export default ListCard;
