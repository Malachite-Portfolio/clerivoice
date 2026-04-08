import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AUTH_DEBUG_ENABLED } from '../constants/api';
import { useAuth } from '../context/AuthContext';
import { getAuthEntryRouteName } from '../navigation/navigationRef';
import { isUnauthorizedApiError } from '../services/apiClient';
import { resolveAvatarSource, resolveAvatarUri } from '../services/avatarResolver';
import {
  fetchListenerDashboard,
  fetchMyCallSessions,
  updateMyAvailability,
} from '../services/listenerApi';
import {
  getPresenceLabel,
  isPresenceOnline,
  normalizePresenceStatus,
  PRESENCE_STATUS,
} from '../services/presenceStatus';
import {
  connectRealtimeSocket,
  getRealtimeSocket,
  subscribeRealtimeSocketState,
} from '../services/realtimeSocket';
import { queryKeys } from '../services/queryClient';
import { getInboxItems } from '../services/sessionApi';
import { fetchWalletHistory } from '../services/walletApi';
import theme from '../theme';
import {
  AppButton,
  AppModalSheet,
  DrawerItem,
  ListCard,
  ProfileAvatar,
  StatusBanner,
} from '../components/ui';
import { DashboardLayout, ListLayout } from '../components/layouts';

const TAB_ITEMS = [
  { key: 'home', label: 'Home' },
  { key: 'favourite', label: 'Favourite users' },
  { key: 'inbox', label: 'Inbox' },
  { key: 'others', label: 'Others' },
  { key: 'verified', label: 'Verified' },
];

const formatCurrency = (value) => `₹${Number(value || 0).toFixed(0)}`;

const formatShortTime = (value) => {
  if (!value) {
    return 'Now';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'Now';
  }

  const now = new Date();
  const isSameDay =
    now.getDate() === date.getDate() &&
    now.getMonth() === date.getMonth() &&
    now.getFullYear() === date.getFullYear();

  return isSameDay
    ? date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    : date.toLocaleDateString([], { month: 'short', day: 'numeric' });
};

const formatDuration = (seconds) => {
  const safeSeconds = Number(seconds || 0);
  const minutes = Math.floor(safeSeconds / 60);
  const remainder = safeSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`;
};

const logListenerDebug = (label, payload) => {
  if (!AUTH_DEBUG_ENABLED) {
    return;
  }

  console.log(`[ListenerHomeScreen] ${label}`, payload);
};

const ListenerHomeScreen = ({ navigation }) => {
  const { session, logout } = useAuth();
  const queryClient = useQueryClient();
  const [availability, setAvailability] = useState(PRESENCE_STATUS.OFFLINE);
  const [updatingAvailability, setUpdatingAvailability] = useState(false);
  const [syncState, setSyncState] = useState('disconnected');
  const [activeTab, setActiveTab] = useState('home');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [settingsExpanded, setSettingsExpanded] = useState(true);
  const [welcomeVisible, setWelcomeVisible] = useState(false);
  const [welcomeMessage, setWelcomeMessage] = useState('');

  const listenerName = session?.user?.displayName || 'Listener';
  const availabilityStatus = normalizePresenceStatus(availability);
  const listenerAvatarSource = useMemo(
    () =>
      resolveAvatarSource({
        uploadedImageUrl: session?.user?.uploadedProfileImageUrl || null,
        profileImageUrl: session?.user?.profileImageUrl || null,
        id: session?.user?.id || null,
        phone: session?.user?.phone || null,
        name: session?.user?.displayName || null,
        role: session?.user?.role || null,
      }),
    [
      session?.user?.displayName,
      session?.user?.id,
      session?.user?.phone,
      session?.user?.profileImageUrl,
      session?.user?.role,
      session?.user?.uploadedProfileImageUrl,
    ],
  );

  const dashboardQuery = useQuery({
    queryKey: queryKeys.listener.dashboard,
    queryFn: fetchListenerDashboard,
    enabled: Boolean(session?.accessToken),
    staleTime: 8000,
  });

  const chatsQuery = useQuery({
    queryKey: queryKeys.sessions.inbox('listener'),
    queryFn: () => getInboxItems({ currentUserId: session?.user?.id, limit: 20 }),
    enabled: Boolean(session?.accessToken),
    staleTime: 8000,
  });

  const callsQuery = useQuery({
    queryKey: queryKeys.listener.calls,
    queryFn: fetchMyCallSessions,
    enabled: Boolean(session?.accessToken),
    staleTime: 8000,
  });

  const earningsQuery = useQuery({
    queryKey: queryKeys.listener.earnings({ type: 'ADMIN_CREDIT' }),
    queryFn: () => fetchWalletHistory({ page: 1, limit: 20, type: 'ADMIN_CREDIT' }),
    enabled: Boolean(session?.accessToken),
    staleTime: 8000,
  });

  const refreshAll = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.listener.dashboard }),
      queryClient.invalidateQueries({ queryKey: queryKeys.sessions.inbox('listener') }),
      queryClient.invalidateQueries({ queryKey: queryKeys.listener.calls }),
      queryClient.invalidateQueries({
        queryKey: queryKeys.listener.earnings({ type: 'ADMIN_CREDIT' }),
      }),
    ]);
  }, [queryClient]);

  useEffect(() => {
    if (dashboardQuery.data?.listener?.availability) {
      setAvailability(normalizePresenceStatus(dashboardQuery.data.listener.availability));
    }
  }, [dashboardQuery.data?.listener?.availability]);

  useEffect(() => {
    if (!session?.accessToken) {
      return undefined;
    }

    let socket = getRealtimeSocket();
    if (!socket) {
      socket = connectRealtimeSocket(session.accessToken);
    }

    const unsubscribeSocketState = subscribeRealtimeSocketState(({ state }) => {
      setSyncState(state);
    });

    const invalidateLiveData = () => refreshAll().catch(() => {});

    const onListenerStatusChanged = (payload) => {
      if (String(payload?.listenerId || '') !== String(session?.user?.id || '')) {
        return;
      }
      const nextAvailability = String(payload?.status || payload?.availability || '')
        .trim()
        .toUpperCase();
      if (!nextAvailability) {
        return;
      }
      setAvailability(normalizePresenceStatus(nextAvailability));
    };

    socket.on('chat_started', invalidateLiveData);
    socket.on('chat_message', invalidateLiveData);
    socket.on('chat_ended', invalidateLiveData);
    socket.on('call_started', invalidateLiveData);
    socket.on('call_rejected', invalidateLiveData);
    socket.on('call_ended', invalidateLiveData);
    socket.on('session_ended', invalidateLiveData);
    socket.on('wallet_updated', invalidateLiveData);
    socket.on('listener_status_changed', onListenerStatusChanged);
    socket.on('host_status_changed', onListenerStatusChanged);

    return () => {
      socket.off('chat_started', invalidateLiveData);
      socket.off('chat_message', invalidateLiveData);
      socket.off('chat_ended', invalidateLiveData);
      socket.off('call_started', invalidateLiveData);
      socket.off('call_rejected', invalidateLiveData);
      socket.off('call_ended', invalidateLiveData);
      socket.off('session_ended', invalidateLiveData);
      socket.off('wallet_updated', invalidateLiveData);
      socket.off('listener_status_changed', onListenerStatusChanged);
      socket.off('host_status_changed', onListenerStatusChanged);
      unsubscribeSocketState();
    };
  }, [refreshAll, session?.accessToken, session?.user?.id]);

  const chatItems = useMemo(
    () => (chatsQuery.data || []).filter((item) => item?.type === 'chat'),
    [chatsQuery.data],
  );

  const callItems = useMemo(() => callsQuery.data?.items || [], [callsQuery.data?.items]);

  const earningItems = useMemo(
    () =>
      (earningsQuery.data?.items || []).filter((item) => {
        const description = String(item?.description || '').toLowerCase();
        return item?.metadata?.source === 'SESSION_EARNING' || description.includes('session');
      }),
    [earningsQuery.data?.items],
  );

  const recentSessions = useMemo(
    () => dashboardQuery.data?.recentSessions || [],
    [dashboardQuery.data?.recentSessions],
  );

  const totalTalkMinutes = useMemo(() => {
    const totalDurationSeconds = callItems.reduce(
      (sum, item) => sum + Number(item?.totalDuration || item?.durationSeconds || 0),
      0,
    );
    return Math.floor(totalDurationSeconds / 60);
  }, [callItems]);

  const verificationStatus = String(
    dashboardQuery.data?.listener?.verificationStatus || '',
  ).toUpperCase();
  const showVerificationWarning = verificationStatus && verificationStatus !== 'VERIFIED';

  const setOnlineState = async (nextAvailability) => {
    const normalizedNextAvailability = normalizePresenceStatus(nextAvailability);
    if (updatingAvailability || availabilityStatus === normalizedNextAvailability) {
      return;
    }

    setUpdatingAvailability(true);
    logListenerDebug('availabilityChangeStart', { nextAvailability: normalizedNextAvailability });

    try {
      await updateMyAvailability(normalizedNextAvailability);
      setAvailability(normalizedNextAvailability);

      const socket = getRealtimeSocket();
      if (socket) {
        if (normalizedNextAvailability === PRESENCE_STATUS.ONLINE) {
          socket.emit('listener_online', { reason: 'MANUAL_TOGGLE' });
        } else if (normalizedNextAvailability === PRESENCE_STATUS.BUSY) {
          socket.emit('listener_busy', { reason: 'MANUAL_TOGGLE' });
        } else {
          socket.emit('listener_offline', { reason: 'MANUAL_TOGGLE' });
        }
      }

      await refreshAll();
    } catch (apiError) {
      if (!isUnauthorizedApiError(apiError)) {
        const message =
          apiError?.response?.data?.message || 'Unable to update listener availability.';
        Alert.alert('Status update failed', message);
      }
    } finally {
      setUpdatingAvailability(false);
    }
  };

  const openChatItem = (item) => {
    const normalizedStatus = String(item?.session?.status || '').trim().toUpperCase();
    if (normalizedStatus !== 'ACTIVE') {
      Alert.alert(
        'No active chat',
        'This chat session has ended. A new chat will appear when the user starts one.',
      );
      return;
    }

    navigation.navigate('ChatSession', {
      chatPayload: {
        session: item.session,
        agora: null,
      },
      host: {
        name: item?.participant?.name || 'Conversation',
        avatar: resolveAvatarUri({
          profileImageUrl: item?.participant?.profileImageUrl || null,
          id: item?.participant?.id || item?.session?.userId || null,
          userId: item?.participant?.id || item?.session?.userId || null,
          name: item?.participant?.name || null,
          role: 'USER',
        }),
        userId: item?.participant?.id || item?.session?.userId || null,
        listenerId: item?.session?.listenerId || null,
      },
    });
  };

  const openCallItem = (item) => {
    const sessionRecord = item?.lastCall || item;
    const normalizedStatus = String(sessionRecord?.status || '').toUpperCase();
    const totalCalls = Number(item?.totalCalls || 1);
    const totalDuration = Number(item?.totalDuration || sessionRecord?.durationSeconds || 0);

    if (!['ACTIVE', 'RINGING'].includes(normalizedStatus)) {
      Alert.alert(
        'Call history',
        `${item?.user?.displayName || sessionRecord?.user?.displayName || 'User'} - ${normalizedStatus || 'ENDED'}\n${totalCalls} call${totalCalls > 1 ? 's' : ''} | ${formatDuration(totalDuration)}`,
      );
      return;
    }

    navigation.navigate('CallSession', {
      callPayload: {
        session: sessionRecord,
        agora: null,
      },
      host: {
        name: item?.user?.displayName || sessionRecord?.user?.displayName || 'User',
        avatar: resolveAvatarUri({
          profileImageUrl:
            item?.user?.profileImageUrl || sessionRecord?.user?.profileImageUrl || null,
          id: item?.user?.id || sessionRecord?.user?.id || sessionRecord?.userId || null,
          userId: item?.user?.id || sessionRecord?.user?.id || sessionRecord?.userId || null,
          name: item?.user?.displayName || sessionRecord?.user?.displayName || null,
          role: 'USER',
        }),
        userId: item?.user?.id || sessionRecord?.user?.id || sessionRecord?.userId || null,
      },
    });
  };

  const onLogout = async () => {
    try {
      await updateMyAvailability(PRESENCE_STATUS.OFFLINE);
    } catch (_error) {
      // Best-effort offline sync before logout.
    }

    const socket = getRealtimeSocket();
    if (socket) {
      socket.emit('listener_offline', { reason: 'LOGOUT' });
    }

    await logout();
    navigation.reset({
      index: 0,
      routes: [{ name: getAuthEntryRouteName() }],
    });
  };

  const renderHomeTab = () => (
    <View style={styles.homeTabWrap}>
      <Text style={styles.centerName}>{listenerName}</Text>
      <Text style={styles.centerMeta}>
        Total earning :{' '}
        <Text style={styles.centerMetaAccent}>{formatCurrency(dashboardQuery.data?.totalEarned)}</Text>
      </Text>

      <View style={styles.circleStatsRow}>
        <View style={styles.metricCircle}>
          <Text style={styles.metricCircleText}>{formatCurrency(dashboardQuery.data?.balance)}</Text>
        </View>
        <View style={styles.metricCircle}>
          <Text style={styles.metricCircleText}>{totalTalkMinutes} m</Text>
        </View>
      </View>

      <Text style={styles.onlineDuration}>
        {getPresenceLabel(availabilityStatus)} : {totalTalkMinutes}m
      </Text>

      <TouchableOpacity style={styles.ghostPill} activeOpacity={0.86}>
        <Text style={styles.ghostPillText}>Penalty</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.linkBtn}
        onPress={() => setWelcomeVisible(true)}
        activeOpacity={0.86}
      >
        <Text style={styles.linkBtnText}>Change mode</Text>
      </TouchableOpacity>

      <AppButton
        title={isPresenceOnline(availabilityStatus) ? 'Go Offline' : 'Go Online'}
        onPress={() =>
          setOnlineState(
            isPresenceOnline(availabilityStatus)
              ? PRESENCE_STATUS.OFFLINE
              : PRESENCE_STATUS.ONLINE,
          )
        }
        loading={updatingAvailability}
        variant={isPresenceOnline(availabilityStatus) ? 'secondary' : 'primary'}
        style={styles.modeButton}
      />
    </View>
  );

  const renderFavouriteTab = () => (
    <ListLayout title="Favourite users">
      {recentSessions.length ? (
        recentSessions.map((item) => (
          <ListCard
            key={`${item.type}-${item.id}`}
            avatarSource={resolveAvatarSource({
              profileImageUrl: item?.counterparty?.profileImageUrl || null,
              id: item?.counterparty?.id || null,
              userId: item?.counterparty?.id || null,
              name: item?.counterparty?.displayName || null,
              role: 'USER',
            })}
            name={item?.counterparty?.displayName || 'Anonymous'}
            meta={`${String(item?.status || '').toUpperCase()} | ${item?.type}`}
            subtitle={`Recent interaction at ${formatShortTime(item?.timestamp)}`}
            rightTime={formatShortTime(item?.timestamp)}
            priceLabel={item?.totalAmount ? formatCurrency(item.totalAmount) : null}
            showCta={false}
            online={isPresenceOnline(item?.counterparty?.availability)}
          />
        ))
      ) : (
        <Text style={styles.emptyText}>No favourite users yet.</Text>
      )}
    </ListLayout>
  );

  const renderInboxTab = () => (
    <ListLayout title="Inbox">
      {chatItems.length ? (
        chatItems.map((item) => (
          <ListCard
            key={item.id}
            avatarSource={resolveAvatarSource({
              profileImageUrl: item?.participant?.profileImageUrl || null,
              id: item?.participant?.id || item?.session?.userId || null,
              userId: item?.participant?.id || item?.session?.userId || null,
              name: item?.participant?.name || null,
              role: 'USER',
            })}
            name={item?.participant?.name || 'Conversation'}
            meta={item?.unreadCount ? `${item.unreadCount} unread` : 'No unread messages'}
            subtitle={item?.preview || 'Open to continue chat'}
            rightTime={formatShortTime(item?.timestamp)}
            ctaLabel="Open"
            onPress={() => openChatItem(item)}
            onCtaPress={() => openChatItem(item)}
            showCta
            online={isPresenceOnline(item?.participant?.availability)}
          />
        ))
      ) : (
        <Text style={styles.emptyText}>Your inbox is empty.</Text>
      )}
    </ListLayout>
  );

  const renderOthersTab = () => (
    <ListLayout title="Others" subtitle="Earning and usage details">
      {earningItems.length ? (
        earningItems.map((item) => (
          <ListCard
            key={item.id}
            avatarSource={listenerAvatarSource}
            name={item?.description || 'Session earning'}
            meta={String(item?.metadata?.sessionType || item?.sessionType || 'SESSION').toUpperCase()}
            subtitle={`Balance after credit: ${formatCurrency(item?.balanceAfter)}`}
            rightTime={formatShortTime(item?.createdAt)}
            priceLabel={`+${formatCurrency(item?.amount)}`}
            ctaLabel="Wallet"
            onCtaPress={() => navigation.navigate('ListenerWallet')}
            showCta
          />
        ))
      ) : (
        <Text style={styles.emptyText}>No earnings yet.</Text>
      )}
    </ListLayout>
  );

  const renderVerifiedTab = () => (
    <ListLayout title="Verified users">
      {callItems.length ? (
        callItems.map((item) => (
          <ListCard
            key={item.id}
            avatarSource={resolveAvatarSource({
              profileImageUrl: item?.user?.profileImageUrl || null,
              id: item?.user?.id || null,
              userId: item?.user?.id || null,
              name: item?.user?.displayName || null,
              role: 'USER',
            })}
            name={item?.user?.displayName || 'Anonymous User'}
            meta={`${Number(item?.totalCalls || 1)} calls | ${formatDuration(item?.totalDuration || item?.durationSeconds || 0)}`}
            subtitle={`Status: ${String(item?.status || '').toUpperCase()}`}
            priceLabel={formatCurrency(item?.totalAmount)}
            ctaLabel="Talk now"
            onPress={() => openCallItem(item)}
            onCtaPress={() => openCallItem(item)}
            showCta
            online
          />
        ))
      ) : (
        <Text style={styles.emptyText}>Verified list will appear here.</Text>
      )}
    </ListLayout>
  );

  const renderActiveTab = () => {
    if (activeTab === 'favourite') return renderFavouriteTab();
    if (activeTab === 'inbox') return renderInboxTab();
    if (activeTab === 'others') return renderOthersTab();
    if (activeTab === 'verified') return renderVerifiedTab();
    return renderHomeTab();
  };

  const isRefreshing =
    dashboardQuery.isRefetching ||
    chatsQuery.isRefetching ||
    callsQuery.isRefetching ||
    earningsQuery.isRefetching;

  return (
    <LinearGradient colors={theme.gradients.bg} style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.content}
          refreshControl={
            <RefreshControl refreshing={isRefreshing} onRefresh={refreshAll} tintColor="#FF2AA3" />
          }
        >
          <DashboardLayout
            avatarSource={listenerAvatarSource}
            name={listenerName}
            statusText={`Current Status  ${getPresenceLabel(availabilityStatus)}  (${syncState})`}
            statusOnline={isPresenceOnline(availabilityStatus)}
            walletLabel={formatCurrency(dashboardQuery.data?.balance)}
            tabs={TAB_ITEMS}
            activeTab={activeTab}
            onChangeTab={setActiveTab}
            onMenuPress={() => setDrawerOpen(true)}
            onWalletPress={() => navigation.navigate('ListenerWallet')}
          >
            {showVerificationWarning ? (
              <StatusBanner
                variant="warning"
                title="Profile under review"
                message="Verification may take up to 2 business days"
                style={styles.banner}
              />
            ) : (
              <StatusBanner
                variant="success"
                title="Profile verified"
                message="Your listener account is active"
                style={styles.banner}
              />
            )}
            {renderActiveTab()}
          </DashboardLayout>
        </ScrollView>

        <Modal
          visible={drawerOpen}
          animationType="fade"
          transparent
          onRequestClose={() => setDrawerOpen(false)}
        >
          <View style={styles.drawerRoot}>
            <Pressable style={styles.drawerOverlay} onPress={() => setDrawerOpen(false)} />
            <LinearGradient colors={theme.gradients.drawer} style={styles.drawerPanel}>
              <View style={styles.drawerHeader}>
                <ProfileAvatar source={listenerAvatarSource} size={58} showOnline online />
                <Text style={styles.drawerName}>{listenerName}</Text>
                <Text style={styles.drawerPhone}>{session?.user?.phone || '+91 0000000000'}</Text>
              </View>

              <DrawerItem
                icon="person-circle-outline"
                label="My Profile"
                onPress={() => {
                  setDrawerOpen(false);
                  navigation.navigate('Profile');
                }}
                showDivider
              />
              <DrawerItem
                icon="chatbox-ellipses-outline"
                label="My chat template"
                onPress={() => {
                  setActiveTab('inbox');
                  setDrawerOpen(false);
                }}
                showDivider
              />
              <DrawerItem
                icon="business-outline"
                label="Bank details"
                onPress={() => {
                  setDrawerOpen(false);
                  navigation.navigate('ListenerWallet');
                }}
                showDivider
              />
              <DrawerItem
                icon="settings-outline"
                label="Settings"
                rightElement={
                  <Ionicons
                    name={settingsExpanded ? 'chevron-up' : 'chevron-down'}
                    size={16}
                    color={theme.colors.primary}
                  />
                }
                onPress={() => setSettingsExpanded((prev) => !prev)}
                showDivider={settingsExpanded}
              />

              {settingsExpanded ? (
                <View>
                  <DrawerItem
                    icon="trash-outline"
                    label="Delete Account"
                    onPress={() => {
                      setDrawerOpen(false);
                      Alert.alert('Delete Account', 'This feature will be available soon.');
                    }}
                    destructive
                    showDivider
                  />
                  <DrawerItem
                    icon="stats-chart-outline"
                    label="Usage"
                    onPress={() => {
                      setActiveTab('others');
                      setDrawerOpen(false);
                    }}
                    destructive
                    showDivider
                  />
                  <DrawerItem
                    icon="log-out-outline"
                    label="Log out"
                    onPress={() => {
                      setDrawerOpen(false);
                      onLogout();
                    }}
                    destructive
                  />
                </View>
              ) : null}

              <Text style={styles.drawerFooter}>App v2.0</Text>
            </LinearGradient>
          </View>
        </Modal>

        <AppModalSheet
          visible={welcomeVisible}
          onClose={() => setWelcomeVisible(false)}
          title="Welcome message"
          footer={
            <AppButton
              title="Update"
              onPress={() => setWelcomeVisible(false)}
              style={styles.welcomeButton}
            />
          }
        >
          <TextInput
            value={welcomeMessage}
            onChangeText={setWelcomeMessage}
            placeholder="Click to edit"
            placeholderTextColor={theme.colors.textMuted}
            style={styles.welcomeInput}
            multiline
          />
        </AppModalSheet>
      </SafeAreaView>
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1 },
  content: {
    paddingHorizontal: theme.spacing.screen,
    paddingBottom: theme.spacing.xl,
  },
  banner: {
    marginTop: theme.spacing.sm,
  },
  homeTabWrap: {
    marginTop: theme.spacing.xl,
    alignItems: 'center',
  },
  centerName: {
    color: theme.colors.textPrimary,
    fontSize: 32,
    fontWeight: theme.typography.weights.bold,
  },
  centerMeta: {
    marginTop: 4,
    color: theme.colors.textSecondary,
    fontSize: theme.typography.h3,
    fontWeight: theme.typography.weights.medium,
  },
  centerMetaAccent: {
    color: theme.colors.primary,
    fontWeight: theme.typography.weights.bold,
  },
  circleStatsRow: {
    marginTop: theme.spacing.xl,
    flexDirection: 'row',
    gap: theme.spacing.lg,
  },
  metricCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 1,
    borderColor: theme.colors.borderStrong,
    backgroundColor: theme.colors.secondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  metricCircleText: {
    color: theme.colors.textPrimary,
    fontSize: theme.typography.h2,
    fontWeight: theme.typography.weights.semibold,
  },
  onlineDuration: {
    marginTop: theme.spacing.xl,
    color: theme.colors.primary,
    fontSize: theme.typography.h2,
    fontWeight: theme.typography.weights.medium,
  },
  ghostPill: {
    marginTop: theme.spacing.lg,
    borderRadius: theme.radius.round,
    borderWidth: 1,
    borderColor: theme.colors.borderSoft,
    backgroundColor: 'rgba(255,255,255,0.03)',
    minWidth: 120,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
  },
  ghostPillText: {
    color: theme.colors.textPrimary,
    fontSize: theme.typography.title,
    fontWeight: theme.typography.weights.semibold,
  },
  linkBtn: {
    marginTop: 80,
    paddingVertical: theme.spacing.sm,
  },
  linkBtnText: {
    color: theme.colors.primary,
    fontSize: theme.typography.h2,
    textDecorationLine: 'underline',
    fontWeight: theme.typography.weights.medium,
  },
  modeButton: {
    marginTop: theme.spacing.lg,
    minWidth: 200,
  },
  emptyText: {
    color: theme.colors.textSecondary,
    fontSize: theme.typography.body,
    marginTop: theme.spacing.md,
  },
  drawerRoot: {
    flex: 1,
    flexDirection: 'row',
  },
  drawerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  drawerPanel: {
    width: '78%',
    borderLeftWidth: 1,
    borderColor: theme.colors.borderStrong,
    paddingTop: theme.spacing.xl,
  },
  drawerHeader: {
    paddingHorizontal: theme.spacing.md,
    marginBottom: theme.spacing.md,
  },
  drawerName: {
    marginTop: 8,
    color: theme.colors.textPrimary,
    fontSize: theme.typography.h3,
    fontWeight: theme.typography.weights.bold,
  },
  drawerPhone: {
    marginTop: 2,
    color: theme.colors.textSecondary,
    fontSize: theme.typography.caption,
  },
  drawerFooter: {
    marginTop: 'auto',
    marginBottom: theme.spacing.lg,
    marginLeft: theme.spacing.md,
    color: theme.colors.textSecondary,
    fontSize: theme.typography.body,
  },
  welcomeInput: {
    minHeight: 90,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.borderSoft,
    backgroundColor: 'rgba(255,255,255,0.03)',
    color: theme.colors.textPrimary,
    fontSize: theme.typography.body,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
    textAlignVertical: 'top',
  },
  welcomeButton: {
    marginTop: theme.spacing.lg,
  },
});

export default ListenerHomeScreen;
