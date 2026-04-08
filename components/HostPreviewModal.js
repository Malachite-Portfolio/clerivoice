import React, { useMemo } from 'react';
import {
  Image,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import theme from '../constants/theme';
import { resolveAvatarSource } from '../services/avatarResolver';
import {
  getPresenceDotColor,
  getPresenceLabel,
  normalizePresenceStatus,
  PRESENCE_STATUS,
} from '../services/presenceStatus';

const toCurrencyPerMinute = (value) => {
  const amount = Number(value || 0);
  if (!Number.isFinite(amount) || amount <= 0) {
    return 'INR 0/min';
  }

  return `INR ${Math.round(amount)}/min`;
};

const HostPreviewModal = ({
  visible = false,
  host = null,
  onClose,
  onTalkNow,
  onChatNow,
}) => {
  const avatarSource = useMemo(
    () =>
      resolveAvatarSource({
        avatarUrl: host?.avatar || host?.profileImageUrl || null,
        profileImageUrl: host?.profileImageUrl || null,
        id: host?.listenerId || host?.id || host?.userId || null,
        userId: host?.listenerId || host?.id || host?.userId || null,
        name: host?.name || host?.displayName || 'Host',
        role: 'LISTENER',
      }),
    [
      host?.avatar,
      host?.displayName,
      host?.id,
      host?.listenerId,
      host?.name,
      host?.profileImageUrl,
      host?.userId,
    ],
  );

  const rating = Number(host?.rating || 0);
  const ratingText = rating > 0 ? rating.toFixed(1) : '4.8';
  const reviewCount = Number(host?.reviewCount || host?.totalSessions || 0);
  const details = [
    host?.age ? `${host.age} yrs` : null,
    host?.category ? String(host.category) : null,
    host?.experience || (host?.experienceYears ? `${host.experienceYears}+ yrs exp` : null),
  ].filter(Boolean);
  const bioText = String(host?.bio || host?.quote || '').trim();
  const description =
    bioText ||
    'Private, verified support sessions are available with this host.';
  const callRateText = toCurrencyPerMinute(host?.callRatePerMinute || host?.callRate);
  const chatRateText = toCurrencyPerMinute(host?.chatRatePerMinute || host?.chatRate);
  const presenceStatus = normalizePresenceStatus(
    host?.availability || (host?.isOnline ? PRESENCE_STATUS.ONLINE : PRESENCE_STATUS.OFFLINE),
  );
  const canStartRealtimeSession = presenceStatus === PRESENCE_STATUS.ONLINE;
  const presenceLabel = getPresenceLabel(presenceStatus);

  return (
    <Modal
      visible={Boolean(visible)}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <TouchableOpacity
        style={styles.overlay}
        activeOpacity={1}
        onPress={onClose}
      >
        <TouchableOpacity
          style={styles.card}
          activeOpacity={1}
          onPress={() => {}}
        >
          <View style={styles.headerRow}>
            <View style={styles.avatarWrap}>
              <Image source={avatarSource} style={styles.avatar} />
              <View
                style={[styles.avatarStatusDot, { backgroundColor: getPresenceDotColor(presenceStatus) }]}
              />
            </View>
            <View style={styles.headerInfo}>
              <Text style={styles.name} numberOfLines={1}>
                {host?.name || host?.displayName || 'Support Host'}
              </Text>
              <View style={styles.ratingRow}>
                <Ionicons name="star" size={13} color={theme.colors.warning} />
                <Text style={styles.ratingText}>{ratingText}</Text>
                {reviewCount > 0 ? (
                  <Text style={styles.reviewText}>({reviewCount} reviews)</Text>
                ) : null}
              </View>
              <Text style={styles.statusText}>
                {presenceStatus === PRESENCE_STATUS.ONLINE
                  ? 'Online now'
                  : presenceStatus === PRESENCE_STATUS.BUSY
                    ? 'Currently busy'
                    : 'Currently offline'}
              </Text>
            </View>
          </View>

          {details.length ? (
            <View style={styles.detailRow}>
              {details.slice(0, 3).map((entry) => (
                <View key={entry} style={styles.detailPill}>
                  <Text style={styles.detailText} numberOfLines={1}>
                    {entry}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}

          <Text style={styles.description} numberOfLines={3}>
            {description}
          </Text>

          <View style={styles.footerRow}>
            <View>
              <Text style={styles.rateLabel}>Rates</Text>
              <Text style={styles.rateValue}>{callRateText} call</Text>
              <Text style={styles.rateValue}>{chatRateText} chat</Text>
            </View>
            <View style={styles.actionRow}>
              {onChatNow ? (
                <TouchableOpacity
                  style={[styles.actionButton, styles.chatButton]}
                  activeOpacity={0.85}
                  onPress={onChatNow}
                  disabled={!canStartRealtimeSession}
                >
                  <Text style={styles.chatButtonText}>
                    {canStartRealtimeSession ? 'Chat' : presenceLabel}
                  </Text>
                </TouchableOpacity>
              ) : null}
              <TouchableOpacity
                style={[
                  styles.actionButton,
                  styles.talkButton,
                  !canStartRealtimeSession ? styles.disabledAction : null,
                ]}
                activeOpacity={0.85}
                onPress={onTalkNow}
                disabled={!canStartRealtimeSession}
              >
                <Text style={styles.talkButtonText}>
                  {canStartRealtimeSession ? 'Talk Now' : presenceLabel}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.62)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 14,
  },
  card: {
    width: '96%',
    maxWidth: 460,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: theme.colors.borderPink,
    backgroundColor: 'rgba(18, 13, 28, 0.98)',
    paddingHorizontal: 16,
    paddingVertical: 16,
    ...theme.shadow.card,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarWrap: {
    position: 'relative',
    marginRight: 12,
  },
  avatar: {
    width: 78,
    height: 78,
    borderRadius: 39,
    borderWidth: 2,
    borderColor: theme.colors.magenta,
    backgroundColor: '#241A32',
  },
  avatarStatusDot: {
    position: 'absolute',
    right: 1,
    bottom: 1,
    width: 13,
    height: 13,
    borderRadius: 6.5,
    borderWidth: 2,
    borderColor: '#12071A',
  },
  headerInfo: {
    flex: 1,
  },
  name: {
    color: theme.colors.textPrimary,
    fontSize: 18,
    fontWeight: '700',
  },
  ratingRow: {
    marginTop: 5,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  ratingText: {
    color: theme.colors.textPrimary,
    fontSize: 13,
    fontWeight: '700',
  },
  reviewText: {
    color: theme.colors.textSecondary,
    fontSize: 12,
  },
  statusText: {
    marginTop: 4,
    color: theme.colors.textSecondary,
    fontSize: 12,
  },
  detailRow: {
    marginTop: 12,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  detailPill: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    backgroundColor: 'rgba(255,255,255,0.06)',
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  detailText: {
    color: theme.colors.textSecondary,
    fontSize: 11,
    fontWeight: '600',
  },
  description: {
    marginTop: 12,
    color: theme.colors.textSecondary,
    fontSize: 12,
    lineHeight: 19,
  },
  footerRow: {
    marginTop: 13,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    gap: 10,
  },
  rateLabel: {
    color: theme.colors.textMuted,
    fontSize: 11,
    marginBottom: 1,
  },
  rateValue: {
    color: theme.colors.textPrimary,
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 18,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  actionButton: {
    minWidth: 88,
    height: 40,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  chatButton: {
    borderColor: 'rgba(255,255,255,0.2)',
    backgroundColor: 'rgba(255,255,255,0.07)',
  },
  talkButton: {
    borderColor: theme.colors.borderPink,
    backgroundColor: 'rgba(255,42,163,0.24)',
  },
  disabledAction: {
    opacity: 0.5,
  },
  chatButtonText: {
    color: theme.colors.textSecondary,
    fontSize: 13,
    fontWeight: '700',
  },
  talkButtonText: {
    color: theme.colors.textPrimary,
    fontSize: 13,
    fontWeight: '700',
  },
});

export default HostPreviewModal;
