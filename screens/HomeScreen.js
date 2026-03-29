import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import SectionTitle from '../components/SectionTitle';
import StoryAvatar from '../components/StoryAvatar';
import SupportCard from '../components/SupportCard';
import WalletPill from '../components/WalletPill';
import BottomSheetAnonymous from '../components/BottomSheetAnonymous';
import AppLogo from '../components/AppLogo';
import { tabs } from '../constants/mockData';
import theme from '../constants/theme';
import { useAuth } from '../context/AuthContext';
import { fetchHostAvailability, fetchHosts } from '../services/listenersApi';
import {
  getWalletSummary,
  requestCall,
  requestChat,
} from '../services/sessionApi';
import {
  connectRealtimeSocket,
  subscribeRealtimeSocketState,
} from '../services/realtimeSocket';
import { queryKeys } from '../services/queryClient';

const avatarPlaceholder = require('../assets/main/avatar-placeholder.png');

const hostQueryParams = {
  page: 1,
  limit: 30,
  includeOnlyActive: true,
  includeOnlyVisible: true,
};

const toUpper = (value) => String(value || '').toUpperCase();

const isVisibleHost = (item) => {
  if (item?.isVisible === false) {
    return false;
  }

  return !['HIDDEN', 'DELETED'].includes(
    toUpper(item?.visibility || item?.profileVisibility),
  );
};

const isActiveHost = (item) => {
  if (item?.isEnabled === false) {
    return false;
  }

  const accountStatus = toUpper(item?.user?.status || item?.accountStatus || item?.status);
  if (accountStatus && ['BLOCKED', 'SUSPENDED', 'DELETED', 'INACTIVE'].includes(accountStatus)) {
    return false;
  }

  const verificationStatus = toUpper(item?.verificationStatus);
  if (verificationStatus && verificationStatus !== 'VERIFIED') {
    return false;
  }

  return true;
};

const isOnlineHost = (item) => toUpper(item?.availability) === 'ONLINE';

const normalizeHostQuote = (hostName) =>
  `A safe and private support space with ${hostName}.`;

const parseRate = (value, fallback = 0) => {
  const parsed = Number(value);
  if (Number.isNaN(parsed)) {
    return fallback;
  }
  return parsed;
};

const HomeScreen = ({ navigation }) => {
  const { session } = useAuth();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState(tabs[0]);
  const [showAnonymousModal, setShowAnonymousModal] = useState(false);
  const [socketConnected, setSocketConnected] = useState(false);

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

  useEffect(() => {
    if (!session?.accessToken) {
      setSocketConnected(false);
      return undefined;
    }

    const socket = connectRealtimeSocket(session.accessToken);
    const unsubscribeSocketState = subscribeRealtimeSocketState(({ connected }) => {
      setSocketConnected(connected);
    });

    if (!socket) {
      return unsubscribeSocketState;
    }

    const invalidateHosts = () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.hosts.all });
    };
    const invalidateWallet = () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.wallet.summary });
    };

    socket.on('host_updated', invalidateHosts);
    socket.on('host_deleted', invalidateHosts);
    socket.on('host_status_changed', invalidateHosts);
    socket.on('pricing_updated', invalidateHosts);
    socket.on('referral_updated', invalidateHosts);
    socket.on('listener_status_changed', invalidateHosts);
    socket.on('wallet_updated', invalidateWallet);

    return () => {
      socket.off('host_updated', invalidateHosts);
      socket.off('host_deleted', invalidateHosts);
      socket.off('host_status_changed', invalidateHosts);
      socket.off('pricing_updated', invalidateHosts);
      socket.off('referral_updated', invalidateHosts);
      socket.off('listener_status_changed', invalidateHosts);
      socket.off('wallet_updated', invalidateWallet);
      unsubscribeSocketState();
    };
  }, [queryClient, session?.accessToken]);

  const walletBalance = walletQuery.data?.balance || 0;
  const hostItems = hostsQuery.data?.items || [];
  const filteredHosts = useMemo(
    () => hostItems.filter((item) => isVisibleHost(item) && isActiveHost(item)),
    [hostItems],
  );

  const transformedHosts = useMemo(
    () =>
      filteredHosts.map((item) => {
        const callRate = parseRate(item.callRatePerMinute, 0);
        const chatRate = parseRate(item.chatRatePerMinute, callRate);
        const displayName = item.user?.displayName || 'Support Host';
        return {
          id: item.userId,
          listenerId: item.userId,
          name: displayName,
          rating: Number(item.rating || 0) || 4.8,
          age: item.age || 28,
          experience: `${item.experienceYears || 0}+ yrs exp`,
          quote: item.bio || normalizeHostQuote(displayName),
          price: `${callRate}/min`,
          avatar: item.user?.profileImageUrl || avatarPlaceholder,
          isVerified: true,
          isOnline: isOnlineHost(item),
          chatRatePerMinute: chatRate,
          callRatePerMinute: callRate,
        };
      }),
    [filteredHosts],
  );

  const displayCards = transformedHosts.slice(0, 6);
  const verifiedStories = transformedHosts.slice(0, 8);
  const recentContacts = transformedHosts.slice(0, 5);

  const syncStatus = useMemo(() => {
    if (hostsQuery.isError) {
      return 'OFFLINE';
    }

    if (hostsQuery.isFetching || walletQuery.isFetching) {
      return 'SYNCING';
    }

    if (socketConnected) {
      return 'ACTIVE';
    }

    return 'SYNCING';
  }, [hostsQuery.isError, hostsQuery.isFetching, socketConnected, walletQuery.isFetching]);

  const syncLabelByState = {
    ACTIVE: 'ACTIVE',
    SYNCING: 'SYNCING',
    OFFLINE: 'OFFLINE',
  };

  const syncSubtitleByState = {
    ACTIVE: 'Live admin updates are active',
    SYNCING: 'Reconnecting and refreshing live data',
    OFFLINE: 'Unable to load live data. Please try again.',
  };

  const syncPillStyleByState = {
    ACTIVE: styles.claimPillActive,
    SYNCING: styles.claimPillSyncing,
    OFFLINE: styles.claimPillOffline,
  };

  const onRetry = useCallback(() => {
    refreshLiveData();
  }, [refreshLiveData]);

  const validateHostAvailability = useCallback(async (listenerId) => {
    const availability = await fetchHostAvailability(listenerId);
    const hostOnline = toUpper(availability?.availability) === 'ONLINE';
    const hostVisible = availability?.isVisible !== false;
    const hostEnabled = availability?.isEnabled !== false;

    if (!hostOnline || !hostVisible || !hostEnabled) {
      const validationError = new Error(
        availability?.message || 'This host is currently unavailable.',
      );
      validationError.code = 'HOST_UNAVAILABLE';
      throw validationError;
    }
  }, []);

  const handleTalkNow = async (host) => {
    if (!session?.accessToken) {
      Alert.alert('Login required', 'Please verify your number to start a call.');
      return;
    }

    try {
      await validateHostAvailability(host.listenerId);
      const callPayload = await requestCall(host.listenerId);
      await refreshLiveData();
      navigation.navigate('CallSession', {
        callPayload,
        host,
      });
    } catch (apiError) {
      const message =
        apiError?.response?.data?.message ||
        apiError?.message ||
        'This host is currently unavailable.';
      Alert.alert('Unable to start call', message);
      refreshLiveData();
    }
  };

  const handleChatNow = async (host) => {
    if (!session?.accessToken) {
      Alert.alert('Login required', 'Please verify your number to start a chat.');
      return;
    }

    try {
      await validateHostAvailability(host.listenerId);
      const chatPayload = await requestChat(host.listenerId);
      await refreshLiveData();
      navigation.navigate('ChatSession', {
        chatPayload,
        host,
      });
    } catch (apiError) {
      const message =
        apiError?.response?.data?.message ||
        apiError?.message ||
        'This host is currently unavailable.';
      Alert.alert('Unable to start chat', message);
      refreshLiveData();
    }
  };

  return (
    <LinearGradient colors={['#04020C', '#0A0312', '#1B0623']} style={styles.container}>
      <StatusBar style="light" />
      <SafeAreaView style={styles.safeArea}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
          refreshControl={
            <RefreshControl
              refreshing={hostsQuery.isRefetching || walletQuery.isRefetching}
              onRefresh={refreshLiveData}
              tintColor="#FF2AA3"
            />
          }
        >
          <View style={styles.brandRow}>
            <AppLogo size="sm" />
          </View>

          <View style={styles.headerRow}>
            <View style={styles.leftHeader}>
              <TouchableOpacity
                style={styles.profileShell}
                activeOpacity={0.85}
                onPress={() => navigation.openDrawer()}
              >
                <Image source={avatarPlaceholder} style={styles.profileAvatar} />
              </TouchableOpacity>

              <View style={styles.headerTextWrap}>
                <Text style={styles.greeting}>Good Evening,</Text>
                <Text style={styles.heading}>How are you feeling today?</Text>
              </View>
            </View>

            <View style={styles.headerActions}>
              <TouchableOpacity style={styles.iconButton} activeOpacity={0.8}>
                <Ionicons name="search" size={20} color={theme.colors.magenta} />
              </TouchableOpacity>
              <WalletPill amount={walletBalance} />
            </View>
          </View>

          <TouchableOpacity
            style={styles.offerCard}
            onPress={onRetry}
            activeOpacity={0.9}
          >
            <View>
              <Text style={styles.offerTitle}>LIVE SYNC ON</Text>
              <Text style={styles.offerSubtitle}>{syncSubtitleByState[syncStatus]}</Text>
            </View>
            <View style={[styles.claimPill, syncPillStyleByState[syncStatus]]}>
              <Text style={styles.claimText}>{syncLabelByState[syncStatus]}</Text>
            </View>
          </TouchableOpacity>

          {syncStatus !== 'ACTIVE' ? (
            <View style={styles.syncBanner}>
              <Text style={styles.syncBannerText}>
                {syncStatus === 'OFFLINE'
                  ? 'Live sync is offline. Retry after backend is reachable.'
                  : 'Live sync disconnected. Reconnecting...'}
              </Text>
            </View>
          ) : null}

          <View style={styles.tabsRow}>
            {tabs.map((tab) => {
              const isActive = tab === activeTab;
              return (
                <TouchableOpacity
                  key={tab}
                  onPress={() => setActiveTab(tab)}
                  style={styles.tabButton}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.tabLabel, isActive && styles.activeTabLabel]}>{tab}</Text>
                  {isActive ? <View style={styles.activeUnderline} /> : null}
                </TouchableOpacity>
              );
            })}
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.storyRow}
          >
            {verifiedStories.map((story) => (
              <StoryAvatar
                key={story.id}
                name={story.name}
                online={story.isOnline}
                image={story.avatar}
                onPress={() => Alert.alert(story.name, 'Host profile preview')}
              />
            ))}
          </ScrollView>

          <SectionTitle title="Recently Contacted" style={styles.sectionSpacing} />

          <View style={styles.recentContactsCard}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {recentContacts.map((contact) => (
                <TouchableOpacity key={contact.id} style={styles.contactItem} activeOpacity={0.85}>
                  <View style={styles.contactAvatar} />
                  <Text style={styles.contactName}>{contact.name}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

          <TouchableOpacity
            style={styles.anonymousBanner}
            onPress={() => setShowAnonymousModal(true)}
            activeOpacity={0.9}
          >
            <MaterialCommunityIcons
              name="incognito"
              size={20}
              color={theme.colors.magenta}
              style={styles.anonymousIcon}
            />
            <View style={styles.anonymousTextWrap}>
              <Text style={styles.anonymousTitle}>You are Anonymous</Text>
              <Text style={styles.anonymousSubtitle}>
                Tap to view your privacy details
              </Text>
            </View>
          </TouchableOpacity>

          <View style={styles.cardsWrap}>
            {hostsQuery.isLoading && !hostsQuery.data ? (
              <View style={styles.loadingWrap}>
                {[1, 2, 3].map((item) => (
                  <View key={`loading-${item}`} style={styles.loadingCard} />
                ))}
              </View>
            ) : null}

            {hostsQuery.isError && !hostsQuery.data ? (
              <View style={styles.errorCard}>
                <Text style={styles.errorTitle}>Unable to load live data.</Text>
                <Text style={styles.errorSubtitle}>Please try again.</Text>
                <TouchableOpacity
                  style={styles.retryButton}
                  onPress={onRetry}
                  activeOpacity={0.85}
                >
                  <Text style={styles.retryText}>Retry</Text>
                </TouchableOpacity>
              </View>
            ) : null}

            {!hostsQuery.isLoading && !hostsQuery.isError && displayCards.length === 0 ? (
              <Text style={styles.emptyStateText}>No available hosts right now.</Text>
            ) : null}

            {!hostsQuery.isLoading && !hostsQuery.isError
              ? displayCards.map((person) => (
                  <SupportCard
                    key={person.id}
                    person={person}
                    talkDisabled={!person.isOnline}
                    chatDisabled={!person.isOnline}
                    onTalkPress={() => handleTalkNow(person)}
                    onChatPress={() => handleChatNow(person)}
                  />
                ))
              : null}
          </View>
        </ScrollView>
      </SafeAreaView>

      <BottomSheetAnonymous
        visible={showAnonymousModal}
        onClose={() => setShowAnonymousModal(false)}
      />
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
    paddingBottom: 28,
  },
  brandRow: {
    paddingTop: 6,
    marginBottom: 8,
    alignItems: 'flex-start',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  leftHeader: {
    flexDirection: 'row',
    flexShrink: 1,
    alignItems: 'center',
    marginRight: 10,
  },
  profileShell: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 1.5,
    borderColor: theme.colors.magenta,
    padding: 2,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  profileAvatar: {
    width: '100%',
    height: '100%',
    borderRadius: 24,
  },
  headerTextWrap: {
    marginLeft: 10,
    flexShrink: 1,
  },
  greeting: {
    color: theme.colors.textSecondary,
    fontSize: 15,
    fontWeight: '500',
  },
  heading: {
    color: theme.colors.textPrimary,
    fontSize: 17,
    fontWeight: '700',
    lineHeight: 22,
    maxWidth: 132,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  iconButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: theme.colors.borderSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  offerCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255, 42, 163, 0.4)',
    backgroundColor: 'rgba(36, 15, 42, 0.85)',
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  offerTitle: {
    color: theme.colors.textPrimary,
    fontWeight: '700',
    fontSize: 16,
  },
  offerSubtitle: {
    color: theme.colors.magenta,
    fontSize: 12,
    marginTop: 1,
  },
  claimPill: {
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 7,
  },
  claimPillActive: {
    borderColor: theme.colors.borderPink,
    backgroundColor: 'rgba(255, 35, 159, 0.18)',
  },
  claimPillSyncing: {
    borderColor: 'rgba(255, 184, 0, 0.45)',
    backgroundColor: 'rgba(255, 184, 0, 0.14)',
  },
  claimPillOffline: {
    borderColor: 'rgba(255, 85, 96, 0.45)',
    backgroundColor: 'rgba(255, 85, 96, 0.14)',
  },
  claimText: {
    color: theme.colors.textPrimary,
    fontWeight: '700',
    fontSize: 13,
  },
  syncBanner: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: 'rgba(255,255,255,0.05)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 12,
  },
  syncBannerText: {
    color: theme.colors.textSecondary,
    fontSize: 12,
  },
  tabsRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 18,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.07)',
    paddingBottom: 8,
    marginTop: 4,
  },
  tabButton: {
    paddingBottom: 3,
  },
  tabLabel: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.h3,
    fontWeight: '600',
  },
  activeTabLabel: {
    color: theme.colors.textPrimary,
  },
  activeUnderline: {
    marginTop: 6,
    width: '100%',
    height: 3,
    borderRadius: 3,
    backgroundColor: theme.colors.magenta,
  },
  storyRow: {
    paddingTop: 12,
    paddingBottom: 8,
  },
  sectionSpacing: {
    marginTop: 4,
  },
  recentContactsCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: theme.colors.borderSoft,
    backgroundColor: 'rgba(35, 30, 46, 0.68)',
    paddingVertical: 12,
    paddingHorizontal: 10,
  },
  contactItem: {
    alignItems: 'center',
    marginHorizontal: 8,
  },
  contactAvatar: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: '#D8D8D8',
  },
  contactName: {
    color: theme.colors.textPrimary,
    fontSize: 14,
    marginTop: 5,
  },
  anonymousBanner: {
    marginTop: 14,
    marginBottom: 14,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 42, 163, 0.35)',
    backgroundColor: 'rgba(33, 15, 41, 0.88)',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 13,
    paddingVertical: 11,
  },
  anonymousIcon: {
    marginRight: 10,
  },
  anonymousTextWrap: {
    flex: 1,
  },
  anonymousTitle: {
    color: theme.colors.textPrimary,
    fontSize: 15,
    fontWeight: '700',
  },
  anonymousSubtitle: {
    color: theme.colors.textSecondary,
    marginTop: 1,
    fontSize: 13,
  },
  cardsWrap: {
    marginTop: 2,
  },
  loadingWrap: {
    gap: 12,
  },
  loadingCard: {
    height: 154,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: theme.colors.borderSoft,
    backgroundColor: 'rgba(255,255,255,0.06)',
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
  emptyStateText: {
    color: theme.colors.textSecondary,
    textAlign: 'center',
    marginTop: 20,
    marginBottom: 18,
  },
});

export default HomeScreen;
