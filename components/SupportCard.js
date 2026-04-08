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
import {
  getPresenceDotColor,
  getPresenceLabel,
  normalizePresenceStatus,
  PRESENCE_STATUS,
} from '../services/presenceStatus';

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
  const presenceStatus = normalizePresenceStatus(
    person?.availability || (person?.isOnline ? PRESENCE_STATUS.ONLINE : PRESENCE_STATUS.OFFLINE),
  );
  const presenceLabel = getPresenceLabel(presenceStatus);
  const isHostOnline = presenceStatus === PRESENCE_STATUS.ONLINE;

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
          <View
            style={[styles.onlineDot, { backgroundColor: getPresenceDotColor(presenceStatus) }]}
          />
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
            <Text
              style={[
                styles.metaText,
                presenceStatus === PRESENCE_STATUS.ONLINE
                  ? styles.onlineText
                  : presenceStatus === PRESENCE_STATUS.BUSY
                    ? styles.busyText
                    : styles.offlineText,
              ]}
            >
              {presenceLabel}
            </Text>
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
            disabled={chatDisabled || !isHostOnline}
            style={[
              styles.ctaButton,
              styles.secondaryCta,
              (chatDisabled || !isHostOnline) && styles.disabledCta,
            ]}
          >
              <Text
                style={[
                  styles.ctaText,
                  styles.secondaryCtaText,
                  (chatDisabled || !isHostOnline) && styles.disabledCtaText,
                ]}
              >
                CHAT
              </Text>
            </TouchableOpacity>
          ) : null}

          <TouchableOpacity
            activeOpacity={0.85}
            onPress={onTalkPress}
            disabled={talkDisabled || !isHostOnline}
            style={[styles.ctaButton, (talkDisabled || !isHostOnline) && styles.disabledCta]}
          >
            <Text style={[styles.ctaText, (talkDisabled || !isHostOnline) && styles.disabledCtaText]}>
              TALK NOW
            </Text>
            <Ionicons
              name="arrow-forward"
              size={16}
              color={talkDisabled || !isHostOnline ? theme.colors.textMuted : theme.colors.magenta}
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
    borderRadius: 22,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: theme.colors.borderSoft,
    ...theme.shadow.card,
  },
  topRow: {
    flexDirection: 'row',
  },
  avatarShell: {
    width: 78,
    marginRight: 12,
    alignItems: 'center',
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 2,
    borderColor: theme.colors.magenta,
    backgroundColor: '#A4AA7A',
  },
  onlineDot: {
    position: 'absolute',
    right: 6,
    bottom: 4,
    width: 13,
    height: 13,
    borderRadius: 6.5,
    backgroundColor: theme.colors.success,
    borderWidth: 2,
    borderColor: '#130A20',
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
    fontSize: 30 / 1.7,
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
    fontSize: 11,
    fontWeight: '500',
  },
  offlineText: {
    color: theme.colors.error,
    fontWeight: '700',
  },
  busyText: {
    color: theme.colors.warning,
    fontWeight: '700',
  },
  onlineText: {
    color: theme.colors.success,
    fontWeight: '700',
  },
  quote: {
    color: theme.colors.textSecondary,
    fontSize: 13,
    marginTop: 8,
    lineHeight: 20,
    opacity: 0.82,
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
    fontSize: 11,
    marginBottom: 1,
  },
  price: {
    color: theme.colors.textPrimary,
    fontSize: 30 / 1.5,
    fontWeight: '700',
  },
  ctaButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(207, 36, 155, 0.24)',
    backgroundColor: 'rgba(17, 11, 24, 0.72)',
  },
  ctaText: {
    color: theme.colors.magenta,
    fontWeight: '800',
    fontSize: 20 / 1.5,
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
