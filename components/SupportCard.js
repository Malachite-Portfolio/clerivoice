import React from 'react';
import {
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import theme from '../constants/theme';
import { resolveAvatarSource } from '../services/avatarResolver';

const SupportCard = ({
  person,
  onTalkPress,
  onChatPress,
  onAvatarPress,
  talkDisabled = false,
  chatDisabled = false,
}) => {
  const avatarSource = resolveAvatarSource({
    avatarUrl: person?.avatar,
    profileImageUrl: person?.profileImageUrl,
    id: person?.listenerId || person?.id,
    userId: person?.listenerId || person?.id,
    name: person?.name,
    role: 'LISTENER',
  });
  const ratingLabel = Number(person?.rating || 0) > 0 ? Number(person?.rating || 0).toFixed(1) : '4.8';

  return (
    <LinearGradient
      colors={theme.gradients.card}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.card}
    >
      <View style={styles.topRow}>
        <TouchableOpacity
          style={styles.avatarShell}
          activeOpacity={onAvatarPress ? 0.85 : 1}
          disabled={!onAvatarPress}
          onPress={onAvatarPress}
        >
          <Image source={avatarSource} style={styles.avatar} />
          {person.isOnline ? <View style={styles.onlineDot} /> : null}
        </TouchableOpacity>

        <View style={styles.infoWrap}>
          <View style={styles.nameRow}>
            <Text style={styles.name}>{person.name}</Text>
            {person.isVerified ? (
              <Ionicons
                name="checkmark-circle"
                size={16}
                color={theme.colors.magenta}
              />
            ) : null}
          </View>

          <View style={styles.metaRow}>
            <Ionicons name="star" size={12} color={theme.colors.warning} />
            <Text style={styles.metaText}>{ratingLabel}</Text>
            {person?.age ? <Text style={styles.metaText}>{person.age} yrs</Text> : null}
            {person?.experience ? <Text style={styles.metaText}>{person.experience}</Text> : null}
            {!person.isOnline ? (
              <Text style={[styles.metaText, styles.offlineText]}>Offline</Text>
            ) : null}
          </View>

          <Text style={styles.quote}>{person.quote}</Text>
        </View>
      </View>

      <View style={styles.bottomRow}>
        <View>
          <Text style={styles.priceLabel}>Starts from</Text>
          <Text style={styles.price}>INR {String(person.price).replace('INR', '').replace('/min', '').trim()}/min</Text>
        </View>

        <View style={styles.actionsWrap}>
          {onChatPress ? (
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={onChatPress}
              disabled={chatDisabled}
              style={[
                styles.ctaButton,
                styles.secondaryCta,
                chatDisabled && styles.disabledCta,
              ]}
            >
              <Text
                style={[
                  styles.ctaText,
                  styles.secondaryCtaText,
                  chatDisabled && styles.disabledCtaText,
                ]}
              >
                CHAT
              </Text>
            </TouchableOpacity>
          ) : null}

          <TouchableOpacity
            activeOpacity={0.85}
            onPress={onTalkPress}
            disabled={talkDisabled}
            style={[styles.ctaButton, talkDisabled && styles.disabledCta]}
          >
            <Text style={[styles.ctaText, talkDisabled && styles.disabledCtaText]}>
              TALK NOW
            </Text>
            <Ionicons
              name="arrow-forward"
              size={16}
              color={talkDisabled ? theme.colors.textMuted : theme.colors.magenta}
              style={styles.arrow}
            />
          </TouchableOpacity>
        </View>
      </View>
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  card: {
    borderRadius: 24,
    padding: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: theme.colors.borderSoft,
    ...theme.shadow.card,
  },
  topRow: {
    flexDirection: 'row',
  },
  avatarShell: {
    width: 88,
    marginRight: 10,
    alignItems: 'center',
  },
  avatar: {
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: 2,
    borderColor: theme.colors.magenta,
    backgroundColor: '#9FA471',
  },
  onlineDot: {
    position: 'absolute',
    right: 8,
    bottom: 4,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: theme.colors.success,
    borderWidth: 2,
    borderColor: theme.colors.bgPrimary,
  },
  infoWrap: {
    flex: 1,
    paddingTop: 2,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  name: {
    color: theme.colors.textPrimary,
    fontSize: 29 / 1.6,
    fontWeight: '700',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  metaText: {
    color: theme.colors.textSecondary,
    fontSize: 13,
    fontWeight: '500',
  },
  offlineText: {
    color: theme.colors.textMuted,
    fontWeight: '700',
  },
  quote: {
    color: theme.colors.textSecondary,
    fontSize: 13,
    marginTop: 8,
    lineHeight: 21,
    opacity: 0.9,
    fontStyle: 'italic',
  },
  bottomRow: {
    marginTop: 14,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  priceLabel: {
    color: theme.colors.textMuted,
    fontSize: 12,
    marginBottom: 1,
  },
  price: {
    color: theme.colors.textPrimary,
    fontSize: 31 / 1.5,
    fontWeight: '700',
  },
  ctaButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 42, 163, 0.18)',
    backgroundColor: 'rgba(18, 10, 22, 0.6)',
  },
  ctaText: {
    color: theme.colors.magenta,
    fontWeight: '800',
    fontSize: 21 / 1.5,
    letterSpacing: 0.3,
  },
  actionsWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  secondaryCta: {
    borderColor: 'rgba(255,255,255,0.16)',
    backgroundColor: 'rgba(255,255,255,0.05)',
    paddingHorizontal: 12,
  },
  secondaryCtaText: {
    color: theme.colors.textSecondary,
  },
  disabledCta: {
    opacity: 0.45,
  },
  disabledCtaText: {
    color: theme.colors.textMuted,
  },
  arrow: {
    marginLeft: 3,
  },
});

export default SupportCard;
