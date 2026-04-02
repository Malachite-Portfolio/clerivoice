import React, { useCallback, useEffect, useMemo } from 'react';
import {
  Alert,
  AppState,
  Image,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import theme from '../constants/theme';
import { useAuth } from '../context/AuthContext';
import { resetToAuthEntry } from '../navigation/navigationRef';
import { isUnauthorizedApiError } from '../services/apiClient';
import { fetchHostAvailability, fetchHosts } from '../services/listenersApi';
import { getChatSessions, getWalletSummary, requestCall, requestChat } from '../services/sessionApi';
import { queryKeys } from '../services/queryClient';
import { requestCallAudioPermissions } from '../services/audioPermissions';
import { getCallStatusMessageByCode, getCallStatusMessageFromError } from '../services/callStatusMessage';

const avatarPlaceholder = require('../assets/main/avatar-placeholder.png');

const hostQueryParams = {
  page: 1,
  limit: 30,
  includeOnlyActive: true,
  includeOnlyVisible: true,
};

const toUpper = (value) => String(value || '').toUpperCase();

const isHostAvailableForListing = (item) => {
  const status = toUpper(item?.user?.status || item?.accountStatus || item?.status);
  const isVisible = item?.isVisible !== false && toUpper(item?.visibility) !== 'HIDDEN';
  const isEnabled = item?.isEnabled !== false;
  return isVisible && isEnabled && !['SUSPENDED', 'BLOCKED', 'DELETED'].includes(status);
};

const ChatCallHubScreen = ({ navigation }) => {
  const { session } = useAuth();
  const queryClient = useQueryClient();

  const hostsQuery = useQuery({
    queryKey: queryKeys.hosts.list(hostQueryParams),
    queryFn: () => fetchHosts(hostQueryParams),
    staleTime: 10000,
  });

  const walletQuery = useQuery({
    queryKey: queryKeys.wallet.summary,
    queryFn: getWalletSummary,
    staleTime: 10000,
    enabled: Boolean(session?.accessToken),
  });

  const refreshLiveData = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.hosts.all }),
      queryClient.invalidateQueries({ queryKey: queryKeys.wallet.summary }),
    ]);
  }, [queryClient]);

  useFocusEffect(
    useCallback(() => {
      refreshLiveData();
    }, [refreshLiveData]),
  );

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        refreshLiveData();
      }
    });

    return () => {
      subscription.remove();
    };
  }, [refreshLiveData]);

  const hosts = useMemo(
    () => (hostsQuery.data?.items || []).filter(isHostAvailableForListing),
    [hostsQuery.data?.items],
  );

  const liveHosts = useMemo(
    () =>
      hosts.map((item) => ({
        listenerId: item.userId,
        name: item.user?.displayName || 'Support Host',
        callRate: Number(item.callRatePerMinute || 0),
        chatRate: Number(item.chatRatePerMinute || 0),
        availability: item.availability || 'OFFLINE',
        avatar: item.user?.profileImageUrl ? { uri: item.user.profileImageUrl } : avatarPlaceholder,
        isOnline: String(item.availability || '').toUpperCase() === 'ONLINE',
        experienceYears: item.experienceYears || 0,
        rating: Number(item.rating || 0),
      })),
    [hosts],
  );

  const validateHostAvailability = useCallback(async (listenerId) => {
    const availability = await fetchHostAvailability(listenerId);
    const normalizedAvailability = String(availability?.availability || '').toUpperCase();
    const isOnline = normalizedAvailability === 'ONLINE';
    const isVisible = availability?.isVisible !== false;
    const isEnabled = availability?.isEnabled !== false;

    if (!isOnline || !isVisible || !isEnabled) {
      const reasonCode = normalizedAvailability === 'BUSY' ? 'HOST_BUSY' : 'HOST_OFFLINE';
      const error = new Error(getCallStatusMessageByCode(reasonCode));
      error.code = reasonCode;
      throw error;
    }
  }, []);

  const openCall = async (host) => {
    if (!session?.accessToken) {
      resetToAuthEntry();
      return;
    }

    try {
      await validateHostAvailability(host.listenerId);

      const permissionResult = await requestCallAudioPermissions();
      console.log('[Call] microphone permission preflight', {
        granted: permissionResult?.granted === true,
        permissions: permissionResult?.permissions || null,
        source: 'ChatCallHubScreen.openCall',
      });
      if (!permissionResult?.granted) {
        Alert.alert(
          'Microphone permission needed',
          'Enable microphone permission to start a voice call.',
        );
        return;
      }

      const callPayload = await requestCall(host.listenerId, {
        callType: 'audio',
      });
      await refreshLiveData();
      navigation.navigate('CallSession', { callPayload, host });
    } catch (error) {
      if (isUnauthorizedApiError(error)) {
        return;
      }

      Alert.alert('Call unavailable', getCallStatusMessageFromError(error));
      refreshLiveData();
    }
  };

  const openChat = async (host) => {
    if (!session?.accessToken) {
      resetToAuthEntry();
      return;
    }

    try {
      await validateHostAvailability(host.listenerId);

      let existingActive = null;
      try {
        const sessions = await getChatSessions({ page: 1, limit: 25, status: 'ACTIVE' });
        existingActive = (sessions?.items || []).find(
          (item) => String(item?.listenerId || '') === String(host.listenerId),
        );
      } catch (_error) {}

      if (existingActive?.id) {
        navigation.navigate('ChatSession', { chatPayload: { session: existingActive, agora: null }, host });
        await refreshLiveData();
        return;
      }

      const chatPayload = await requestChat(host.listenerId);
      await refreshLiveData();
      navigation.navigate('ChatSession', { chatPayload, host });
    } catch (error) {
      if (isUnauthorizedApiError(error)) {
        return;
      }

      const message =
        error?.response?.data?.message || error?.message || 'Unable to start chat.';
      Alert.alert('Chat blocked', message);
      refreshLiveData();
    }
  };

  return (
    <LinearGradient colors={theme.gradients.bg} style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          refreshControl={
            <RefreshControl
              refreshing={hostsQuery.isRefetching || walletQuery.isRefetching}
              onRefresh={refreshLiveData}
              tintColor={theme.colors.magenta}
            />
          }
        >
          <View style={styles.headerRow}>
            <TouchableOpacity
              style={styles.iconButton}
              onPress={() => navigation.goBack()}
              activeOpacity={0.85}
            >
              <Ionicons name="chevron-back" size={22} color={theme.colors.textPrimary} />
            </TouchableOpacity>

            <View style={styles.headerCenter}>
              <Text style={styles.headerTitle}>Chat & Call</Text>
            </View>

            <TouchableOpacity
              style={styles.iconButton}
              onPress={() => navigation.openDrawer()}
              activeOpacity={0.85}
            >
              <Ionicons name="menu" size={20} color={theme.colors.textPrimary} />
            </TouchableOpacity>
          </View>

          <View style={styles.walletCard}>
            <Text style={styles.walletLabel}>Wallet Balance</Text>
            <Text style={styles.walletAmount}>INR {walletQuery.data?.balance || 0}</Text>
            <Text style={styles.walletHint}>
              Live billing checks are enforced by backend before chat and call.
            </Text>
          </View>

          <Text style={styles.sectionTitle}>Available Hosts</Text>

          {hostsQuery.isLoading && !hostsQuery.data ? (
            <View style={styles.loadingCard}>
              <Text style={styles.loadingText}>Loading live hosts...</Text>
            </View>
          ) : null}

          {hostsQuery.isError && !hostsQuery.data ? (
            <View style={styles.errorCard}>
              <Text style={styles.errorTitle}>Unable to load live data.</Text>
              <Text style={styles.errorSubtitle}>Please try again.</Text>
              <TouchableOpacity onPress={refreshLiveData} style={styles.retryButton} activeOpacity={0.85}>
                <Text style={styles.retryText}>Retry</Text>
              </TouchableOpacity>
            </View>
          ) : null}

          {!hostsQuery.isLoading && !hostsQuery.isError && liveHosts.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyText}>No hosts available right now.</Text>
            </View>
          ) : null}

          {!hostsQuery.isLoading && !hostsQuery.isError
            ? liveHosts.map((host) => (
                <View key={host.listenerId} style={styles.hostCard}>
                  <View style={styles.hostTopRow}>
                    <Image source={host.avatar} style={styles.avatar} />
                    <View style={styles.hostInfo}>
                      <Text style={styles.hostName}>{host.name}</Text>
                      <Text style={styles.hostMeta}>
                        {host.rating.toFixed(1)} | {host.experienceYears}+ yrs exp
                      </Text>
                      <Text style={styles.hostMeta}>
                        {host.isOnline ? 'Online' : host.availability}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.rateRow}>
                    <Text style={styles.rateText}>Call: INR {host.callRate}/min</Text>
                    <Text style={styles.rateText}>Chat: INR {host.chatRate}/min</Text>
                  </View>

                  <View style={styles.actionsRow}>
                    <TouchableOpacity
                      style={[styles.actionButton, styles.chatButton, !host.isOnline && styles.disabledAction]}
                      onPress={() => openChat(host)}
                      activeOpacity={0.85}
                      disabled={!host.isOnline}
                    >
                      <Ionicons name="chatbubble-ellipses-outline" size={16} color={theme.colors.textPrimary} />
                      <Text style={styles.actionText}>Start Chat</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.actionButton, styles.callButton, !host.isOnline && styles.disabledAction]}
                      onPress={() => openCall(host)}
                      activeOpacity={0.85}
                      disabled={!host.isOnline}
                    >
                      <Ionicons name="call-outline" size={16} color={theme.colors.textPrimary} />
                      <Text style={styles.actionText}>Start Call</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))
            : null}
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 26,
  },
  headerRow: {
    marginTop: 6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerCenter: {
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
    marginHorizontal: 8,
  },
  headerTitle: {
    color: theme.colors.textPrimary,
    fontSize: 18,
    fontWeight: '700',
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: theme.colors.borderSoft,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  walletCard: {
    marginTop: 16,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: theme.colors.borderPink,
    backgroundColor: 'rgba(255, 42, 163, 0.09)',
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  walletLabel: {
    color: theme.colors.textSecondary,
    fontSize: 13,
  },
  walletAmount: {
    marginTop: 3,
    color: theme.colors.textPrimary,
    fontSize: 24,
    fontWeight: '700',
  },
  walletHint: {
    marginTop: 6,
    color: theme.colors.textMuted,
    fontSize: 12,
    lineHeight: 18,
  },
  sectionTitle: {
    marginTop: 20,
    marginBottom: 10,
    color: theme.colors.textPrimary,
    fontSize: 17,
    fontWeight: '700',
  },
  loadingCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: theme.colors.borderSoft,
    backgroundColor: theme.colors.glass,
    paddingVertical: 18,
    alignItems: 'center',
  },
  loadingText: {
    color: theme.colors.textSecondary,
    fontSize: 14,
  },
  errorCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255, 85, 96, 0.4)',
    backgroundColor: 'rgba(255, 85, 96, 0.08)',
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 12,
  },
  errorTitle: {
    color: theme.colors.textPrimary,
    fontSize: 14,
    fontWeight: '700',
  },
  errorSubtitle: {
    color: theme.colors.textSecondary,
    fontSize: 13,
    marginTop: 4,
  },
  retryButton: {
    alignSelf: 'flex-start',
    marginTop: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.borderPink,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: 'rgba(255, 42, 163, 0.18)',
  },
  retryText: {
    color: theme.colors.textPrimary,
    fontWeight: '700',
    fontSize: 12,
  },
  emptyCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: theme.colors.borderSoft,
    backgroundColor: theme.colors.glass,
    paddingVertical: 18,
    alignItems: 'center',
  },
  emptyText: {
    color: theme.colors.textSecondary,
    fontSize: 14,
  },
  hostCard: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: theme.colors.borderSoft,
    backgroundColor: theme.colors.glassStrong,
    padding: 12,
    marginBottom: 12,
  },
  hostTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 1.5,
    borderColor: theme.colors.magenta,
  },
  hostInfo: {
    marginLeft: 10,
    flex: 1,
  },
  hostName: {
    color: theme.colors.textPrimary,
    fontSize: 16,
    fontWeight: '700',
  },
  hostMeta: {
    color: theme.colors.textSecondary,
    fontSize: 12,
    marginTop: 1,
  },
  rateRow: {
    marginTop: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  rateText: {
    color: theme.colors.textMuted,
    fontSize: 12,
  },
  actionsRow: {
    marginTop: 12,
    flexDirection: 'row',
    gap: 10,
  },
  actionButton: {
    flex: 1,
    height: 42,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  chatButton: {
    borderColor: 'rgba(255,255,255,0.14)',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  callButton: {
    borderColor: theme.colors.borderPink,
    backgroundColor: 'rgba(255, 42, 163, 0.22)',
  },
  disabledAction: {
    opacity: 0.45,
  },
  actionText: {
    color: theme.colors.textPrimary,
    fontSize: 13,
    fontWeight: '700',
  },
});

export default ChatCallHubScreen;
