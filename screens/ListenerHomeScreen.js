import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
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
import { useQuery, useQueryClient } from '@tanstack/react-query';
import theme from '../constants/theme';
import { AUTH_DEBUG_ENABLED } from '../constants/api';
import { useAuth } from '../context/AuthContext';
import { getAuthEntryRouteName } from '../navigation/navigationRef';
import { isUnauthorizedApiError } from '../services/apiClient';
import {
  fetchListenerDashboard,
  fetchMyCallSessions,
  updateMyAvailability,
} from '../services/listenerApi';
import {
  connectRealtimeSocket,
  getRealtimeSocket,
  subscribeRealtimeSocketState,
} from '../services/realtimeSocket';
import { queryKeys } from '../services/queryClient';
import { getInboxItems } from '../services/sessionApi';
import { fetchWalletHistory } from '../services/walletApi';

const avatarPlaceholder = require('../assets/main/avatar-placeholder.png');

const TABS = ['Dashboard', 'Chats', 'Calls', 'Earnings'];

const availabilityLabels = {
  ONLINE: 'ONLINE',
  OFFLINE: 'OFFLINE',
  BUSY: 'BUSY',
};

const formatCurrency = (value) => `INR ${Number(value || 0).toFixed(0)}`;

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

const imageSource = (uri) => (uri ? { uri } : avatarPlaceholder);

const logListenerDebug = (label, payload) => {
  if (!AUTH_DEBUG_ENABLED) {
    return;
  }

  console.log(`[ListenerHomeScreen] ${label}`, payload);
};

const ListenerHomeScreen = ({ navigation }) => {
  const { session, logout } = useAuth();
  const queryClient = useQueryClient();
  const [availability, setAvailability] = useState('OFFLINE');
  const [updatingAvailability, setUpdatingAvailability] = useState(false);
  const [syncState, setSyncState] = useState('disconnected');
  const [activeTab, setActiveTab] = useState('Dashboard');

  const listenerName = session?.user?.displayName || 'Listener';
  const listenerAvatarSource = useMemo(
    () => imageSource(session?.user?.profileImageUrl),
    [session?.user?.profileImageUrl],
  );

  const dashboardQuery = useQuery({
    queryKey: queryKeys.listener.dashboard,
    queryFn: fetchListenerDashboard,
    enabled: Boolean(session?.accessToken),
    staleTime: 8000,
  });

  const chatsQuery = useQuery({
    queryKey: queryKeys.sessions.inbox('listener'),
    queryFn: () => getInboxItems({ currentUserId: session?.user?.id, limit: 12 }),
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
      setAvailability(dashboardQuery.data.listener.availability);
    }
  }, [dashboardQuery.data?.listener?.availability]);

  useEffect(() => {
    logListenerDebug('dashboardResponse', {
      balance: dashboardQuery.data?.balance ?? null,
      totalEarned: dashboardQuery.data?.totalEarned ?? null,
      activeChats: dashboardQuery.data?.activeChats ?? null,
      activeCalls: dashboardQuery.data?.activeCalls ?? null,
    });
  }, [
    dashboardQuery.data?.activeCalls,
    dashboardQuery.data?.activeChats,
    dashboardQuery.data?.balance,
    dashboardQuery.data?.totalEarned,
  ]);

  useEffect(() => {
    logListenerDebug('historyFetchResponses', {
      chatItems: chatsQuery.data?.length || 0,
      callItems: callsQuery.data?.items?.length || 0,
      earningItems: earningsQuery.data?.items?.length || 0,
    });
  }, [callsQuery.data?.items?.length, chatsQuery.data?.length, earningsQuery.data?.items?.length]);

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

    const invalidateLiveData = () => {
      refreshAll().catch(() => {});
    };

    const onCallResolved = (payload) => {
      invalidateLiveData();
    };
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
      setAvailability(nextAvailability);
      logListenerDebug('presenceUpdate', {
        listenerId: payload?.listenerId || null,
        status: nextAvailability,
        source: 'socket_listener_status_changed',
      });
    };

    socket.on('chat_started', invalidateLiveData);
    socket.on('chat_message', invalidateLiveData);
    socket.on('chat_ended', invalidateLiveData);
    socket.on('call_started', onCallResolved);
    socket.on('call_rejected', onCallResolved);
    socket.on('call_ended', onCallResolved);
    socket.on('session_ended', onCallResolved);
    socket.on('wallet_updated', invalidateLiveData);
    socket.on('listener_status_changed', onListenerStatusChanged);
    socket.on('host_status_changed', onListenerStatusChanged);

    return () => {
      socket.off('chat_started', invalidateLiveData);
      socket.off('chat_message', invalidateLiveData);
      socket.off('chat_ended', invalidateLiveData);
      socket.off('call_started', onCallResolved);
      socket.off('call_rejected', onCallResolved);
      socket.off('call_ended', onCallResolved);
      socket.off('session_ended', onCallResolved);
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

  const earningItems = useMemo(() => {
    return (earningsQuery.data?.items || []).filter((item) => {
      const description = String(item?.description || '').toLowerCase();
      return item?.metadata?.source === 'SESSION_EARNING' || description.includes('session earning');
    });
  }, [earningsQuery.data?.items]);

  const recentSessions = useMemo(
    () => dashboardQuery.data?.recentSessions || [],
    [dashboardQuery.data?.recentSessions],
  );

  const setOnlineState = async (nextAvailability) => {
    if (updatingAvailability || availability === nextAvailability) {
      return;
    }

    setUpdatingAvailability(true);
    logListenerDebug('availabilityChangeStart', {
      nextAvailability,
    });

    try {
      await updateMyAvailability(nextAvailability);
      setAvailability(nextAvailability);
      logListenerDebug('availabilityChangeSuccess', {
        nextAvailability,
      });

      const socket = getRealtimeSocket();
      if (socket) {
        if (nextAvailability === 'ONLINE') {
          socket.emit('listener_online');
        } else if (nextAvailability === 'BUSY') {
          socket.emit('listener_busy');
        } else {
          socket.emit('listener_offline');
        }
      }

      await refreshAll();
    } catch (apiError) {
      logListenerDebug('availabilityChangeFailure', {
        nextAvailability,
        message: apiError?.response?.data?.message || apiError?.message || 'Unknown error',
      });

      if (isUnauthorizedApiError(apiError)) {
        return;
      }

      const message =
        apiError?.response?.data?.message || 'Unable to update listener availability.';
      Alert.alert('Status update failed', message);
    } finally {
      setUpdatingAvailability(false);
    }
  };

  const openChatItem = (item) => {
    navigation.navigate('ChatSession', {
      chatPayload: {
        session: item.session,
        agora: null,
      },
      host: {
        name: item?.participant?.name || 'Conversation',
        avatar: item?.participant?.profileImageUrl || null,
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
        `${item?.user?.displayName || sessionRecord?.user?.displayName || 'User'} - ${normalizedStatus || 'ENDED'}\n${totalCalls} call${totalCalls > 1 ? 's' : ''} • ${formatDuration(totalDuration)}`,
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
        avatar: item?.user?.profileImageUrl || sessionRecord?.user?.profileImageUrl || null,
        userId: item?.user?.id || sessionRecord?.user?.id || sessionRecord?.userId || null,
      },
    });
  };

  const onLogout = async () => {
    const socket = getRealtimeSocket();
    if (socket) {
      socket.emit('listener_offline');
    }

    await logout();
    navigation.reset({
      index: 0,
      routes: [{ name: getAuthEntryRouteName() }],
    });
  };

  const renderMetricCard = (label, value, tone = 'default') => (
    <View
      style={[
        styles.metricCard,
        tone === 'accent' ? styles.metricCardAccent : null,
        tone === 'success' ? styles.metricCardSuccess : null,
      ]}
    >
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
    </View>
  );

  const renderDashboard = () => (
    <>
      <View style={styles.metricsGrid}>
        {renderMetricCard('Balance', formatCurrency(dashboardQuery.data?.balance), 'accent')}
        {renderMetricCard('Total Earned', formatCurrency(dashboardQuery.data?.totalEarned), 'success')}
        {renderMetricCard('Today Earned', formatCurrency(dashboardQuery.data?.todayEarned))}
        {renderMetricCard(
          'Active Sessions',
          `${dashboardQuery.data?.activeChats || 0} chat • ${dashboardQuery.data?.activeCalls || 0} call`,
        )}
      </View>

      <View style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>Availability</Text>
        <Text style={styles.sectionSubTitle}>
          Sync: {syncState.toUpperCase()} • Status: {availabilityLabels[availability]}
        </Text>
        <View style={styles.toggleRow}>
          {['ONLINE', 'OFFLINE'].map((status) => (
            <TouchableOpacity
              key={status}
              style={[
                styles.toggleButton,
                availability === status ? styles.toggleButtonActive : null,
              ]}
              onPress={() => setOnlineState(status)}
              activeOpacity={0.85}
              disabled={updatingAvailability}
            >
              <Text style={styles.toggleText}>{status === 'ONLINE' ? 'Go Online' : 'Go Offline'}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>Recent Sessions</Text>
        {recentSessions.length ? (
          recentSessions.map((item) => (
            <TouchableOpacity
              key={`${item.type}-${item.id}`}
              style={styles.historyRow}
              onPress={() =>
                item.type === 'chat'
                  ? openChatItem({
                      session: {
                        id: item.id,
                        listenerId: session?.user?.id,
                        userId: item?.counterparty?.id || null,
                        status: item.status,
                        startedAt: item.timestamp,
                      },
                      participant: {
                        id: item?.counterparty?.id || null,
                        name: item?.counterparty?.displayName || 'Anonymous User',
                        profileImageUrl: item?.counterparty?.profileImageUrl || null,
                      },
                    })
                  : openCallItem({
                      id: item.id,
                      userId: item?.counterparty?.id || null,
                      listenerId: session?.user?.id,
                      user: {
                        id: item?.counterparty?.id || null,
                        displayName: item?.counterparty?.displayName || 'Anonymous User',
                        profileImageUrl: item?.counterparty?.profileImageUrl || null,
                      },
                      status: item.status,
                      durationSeconds: item.durationSeconds || 0,
                      totalAmount: item.totalAmount || 0,
                      startedAt: item.timestamp,
                      answeredAt: item.timestamp,
                    })
              }
              activeOpacity={0.85}
            >
              <View style={styles.historyIconWrap}>
                <Ionicons
                  name={item.type === 'chat' ? 'chatbubble-ellipses' : 'call'}
                  size={18}
                  color={theme.colors.textPrimary}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.historyName}>
                  {item?.counterparty?.displayName || 'Anonymous User'}
                </Text>
                <Text style={styles.historyMeta}>
                  {String(item.status || '').toUpperCase()} • {formatShortTime(item.timestamp)}
                </Text>
              </View>
              <Text style={styles.historyValue}>{formatCurrency(item.totalAmount)}</Text>
            </TouchableOpacity>
          ))
        ) : (
          <Text style={styles.emptyText}>Recent sessions will appear here.</Text>
        )}
      </View>
    </>
  );

  const renderChats = () => (
    <View style={styles.sectionCard}>
      <Text style={styles.sectionTitle}>Chat Inbox</Text>
      {chatItems.length ? (
        chatItems.map((item) => (
          <TouchableOpacity
            key={item.id}
            style={styles.inboxRow}
            onPress={() => openChatItem(item)}
            activeOpacity={0.85}
          >
            <Image
              source={imageSource(item?.participant?.profileImageUrl)}
              style={styles.requestAvatar}
            />
            <View style={{ flex: 1 }}>
              <Text style={styles.requestName}>{item?.participant?.name || 'Conversation'}</Text>
              <Text style={styles.requestMeta}>{item?.preview || 'Start conversation...'}</Text>
            </View>
            <View style={styles.trailingColumn}>
              <Text style={styles.trailingTime}>{formatShortTime(item?.timestamp)}</Text>
              {item?.unreadCount ? (
                <View style={styles.unreadBadge}>
                  <Text style={styles.unreadBadgeText}>
                    {item.unreadCount > 9 ? '9+' : item.unreadCount}
                  </Text>
                </View>
              ) : null}
            </View>
          </TouchableOpacity>
        ))
      ) : (
        <Text style={styles.emptyText}>Your real chat sessions will appear here.</Text>
      )}
    </View>
  );

  const renderCalls = () => (
    <View style={styles.sectionCard}>
      <Text style={styles.sectionTitle}>Call History</Text>
      {callItems.length ? (
        callItems.map((item) => (
          <TouchableOpacity
            key={item.id}
            style={styles.historyRow}
            onPress={() => openCallItem(item)}
            activeOpacity={0.85}
          >
            <View style={styles.historyIconWrap}>
              <Ionicons name="call" size={18} color={theme.colors.textPrimary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.historyName}>{item?.user?.displayName || 'Anonymous User'}</Text>
              <Text style={styles.historyMeta}>
                {String(item?.status || '').toUpperCase()} •{' '}
                {formatDuration(item?.totalDuration || item?.durationSeconds || 0)} •{' '}
                {Number(item?.totalCalls || 1)} call{Number(item?.totalCalls || 1) > 1 ? 's' : ''}
              </Text>
            </View>
            <View style={styles.trailingColumn}>
              <Text style={styles.trailingTime}>{formatShortTime(item?.startedAt || item?.requestedAt)}</Text>
              <Text style={styles.historyValue}>{formatCurrency(item?.totalAmount)}</Text>
            </View>
          </TouchableOpacity>
        ))
      ) : (
        <Text style={styles.emptyText}>Your real call history will appear here.</Text>
      )}
    </View>
  );

  const renderEarnings = () => (
    <View style={styles.sectionCard}>
      <Text style={styles.sectionTitle}>Earnings History</Text>
      <Text style={styles.sectionSubTitle}>
        {formatCurrency(dashboardQuery.data?.totalEarned)} total • {formatCurrency(dashboardQuery.data?.todayEarned)} today
      </Text>
      {earningItems.length ? (
        earningItems.map((item) => (
          <View key={item.id} style={styles.earningRow}>
            <View style={styles.historyIconWrap}>
              <Ionicons name="wallet" size={18} color={theme.colors.textPrimary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.historyName}>{item?.description || 'Session earning'}</Text>
              <Text style={styles.historyMeta}>
                {String(item?.metadata?.sessionType || item?.sessionType || '').toUpperCase() || 'SESSION'} •{' '}
                {formatShortTime(item?.createdAt)}
              </Text>
            </View>
            <View style={styles.trailingColumn}>
              <Text style={styles.earningAmount}>+{formatCurrency(item?.amount)}</Text>
              <Text style={styles.trailingTime}>
                Bal: {formatCurrency(item?.balanceAfter)}
              </Text>
            </View>
          </View>
        ))
      ) : (
        <Text style={styles.emptyText}>Listener earnings will appear here after paid sessions.</Text>
      )}
    </View>
  );

  const renderActiveTab = () => {
    if (activeTab === 'Chats') {
      return renderChats();
    }

    if (activeTab === 'Calls') {
      return renderCalls();
    }

    if (activeTab === 'Earnings') {
      return renderEarnings();
    }

    return renderDashboard();
  };

  const isRefreshing =
    dashboardQuery.isRefetching ||
    chatsQuery.isRefetching ||
    callsQuery.isRefetching ||
    earningsQuery.isRefetching;

  return (
    <LinearGradient colors={['#04020C', '#0A0312', '#1B0623']} style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.content}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={refreshAll}
              tintColor="#FF2AA3"
            />
          }
        >
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Listener Dashboard</Text>
            <View style={styles.headerActions}>
              <TouchableOpacity
                style={styles.profileAvatarBtn}
                onPress={() => {
                  logListenerDebug('profileOpen', {
                    source: 'listener_header',
                  });
                  navigation.navigate('Profile');
                }}
                activeOpacity={0.85}
              >
                <Image source={listenerAvatarSource} style={styles.profileAvatarImg} />
              </TouchableOpacity>
              <TouchableOpacity style={styles.logoutButton} onPress={onLogout} activeOpacity={0.85}>
                <Ionicons name="log-out-outline" size={18} color={theme.colors.textPrimary} />
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.welcomeCard}>
            <Text style={styles.welcomeTitle}>Welcome, {listenerName}</Text>
            <Text style={styles.welcomeSubTitle}>
              {formatCurrency(dashboardQuery.data?.balance)} available • {availabilityLabels[availability]}
            </Text>
          </View>

          <View style={styles.tabRow}>
            {TABS.map((tab) => {
              const isActive = tab === activeTab;
              return (
                <TouchableOpacity
                  key={tab}
                  style={[styles.tabButton, isActive ? styles.tabButtonActive : null]}
                  onPress={() => setActiveTab(tab)}
                  activeOpacity={0.85}
                >
                  <Text style={[styles.tabButtonText, isActive ? styles.tabButtonTextActive : null]}>
                    {tab}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {renderActiveTab()}
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1 },
  content: { paddingHorizontal: 16, paddingBottom: 24 },
  header: {
    marginTop: 6,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  profileAvatarBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    borderColor: theme.colors.borderPink,
    backgroundColor: 'rgba(255,255,255,0.06)',
    overflow: 'hidden',
  },
  profileAvatarImg: {
    width: '100%',
    height: '100%',
  },
  headerTitle: {
    color: theme.colors.textPrimary,
    fontSize: 18,
    fontWeight: '700',
  },
  logoutButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    borderColor: theme.colors.borderSoft,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.07)',
  },
  welcomeCard: {
    marginTop: 14,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: theme.colors.borderPink,
    backgroundColor: 'rgba(255, 42, 163, 0.08)',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  welcomeTitle: {
    color: theme.colors.textPrimary,
    fontSize: 18,
    fontWeight: '700',
  },
  welcomeSubTitle: {
    marginTop: 4,
    color: theme.colors.textSecondary,
    fontSize: 12,
  },
  tabRow: {
    marginTop: 14,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  tabButton: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.colors.borderSoft,
    backgroundColor: 'rgba(255,255,255,0.06)',
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  tabButtonActive: {
    borderColor: theme.colors.borderPink,
    backgroundColor: 'rgba(255,42,163,0.22)',
  },
  tabButtonText: {
    color: theme.colors.textSecondary,
    fontSize: 13,
    fontWeight: '700',
  },
  tabButtonTextActive: {
    color: theme.colors.textPrimary,
  },
  metricsGrid: {
    marginTop: 16,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  metricCard: {
    width: '48%',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: theme.colors.borderSoft,
    backgroundColor: 'rgba(255,255,255,0.06)',
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  metricCardAccent: {
    borderColor: theme.colors.borderPink,
    backgroundColor: 'rgba(255,42,163,0.14)',
  },
  metricCardSuccess: {
    borderColor: 'rgba(15,214,122,0.35)',
    backgroundColor: 'rgba(15,214,122,0.10)',
  },
  metricLabel: {
    color: theme.colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
  metricValue: {
    marginTop: 8,
    color: theme.colors.textPrimary,
    fontSize: 18,
    fontWeight: '700',
  },
  sectionCard: {
    marginTop: 16,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: theme.colors.borderSoft,
    backgroundColor: 'rgba(255,255,255,0.06)',
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  sectionTitle: {
    color: theme.colors.textPrimary,
    fontSize: 16,
    fontWeight: '700',
  },
  sectionSubTitle: {
    marginTop: 4,
    color: theme.colors.textSecondary,
    fontSize: 12,
  },
  toggleRow: {
    marginTop: 12,
    flexDirection: 'row',
    gap: 10,
  },
  toggleButton: {
    flex: 1,
    height: 42,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.colors.borderSoft,
    backgroundColor: 'rgba(255,255,255,0.07)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  toggleButtonActive: {
    borderColor: theme.colors.borderPink,
    backgroundColor: 'rgba(255,42,163,0.24)',
  },
  toggleText: {
    color: theme.colors.textPrimary,
    fontSize: 13,
    fontWeight: '700',
  },
  requestCard: {
    marginTop: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.colors.borderSoft,
    backgroundColor: 'rgba(255,255,255,0.05)',
    padding: 12,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  requestAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 1.5,
    borderColor: 'rgba(255,42,163,0.5)',
    marginRight: 12,
  },
  requestName: {
    color: theme.colors.textPrimary,
    fontSize: 15,
    fontWeight: '700',
  },
  requestMeta: {
    marginTop: 4,
    color: theme.colors.textSecondary,
    fontSize: 12,
  },
  livePill: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,42,163,0.35)',
    backgroundColor: 'rgba(255,42,163,0.16)',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  livePillText: {
    color: theme.colors.textPrimary,
    fontSize: 11,
    fontWeight: '700',
  },
  requestActions: {
    marginTop: 12,
    flexDirection: 'row',
    gap: 10,
  },
  actionButton: {
    flex: 1,
    height: 40,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  acceptButton: {
    borderColor: theme.colors.borderPink,
    backgroundColor: 'rgba(255,42,163,0.24)',
  },
  rejectButton: {
    borderColor: 'rgba(255,255,255,0.2)',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  actionButtonText: {
    color: theme.colors.textPrimary,
    fontSize: 13,
    fontWeight: '700',
  },
  historyRow: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },
  historyIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 1,
    borderColor: theme.colors.borderSoft,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
    marginRight: 12,
  },
  historyName: {
    color: theme.colors.textPrimary,
    fontSize: 14,
    fontWeight: '700',
  },
  historyMeta: {
    marginTop: 3,
    color: theme.colors.textSecondary,
    fontSize: 12,
  },
  historyValue: {
    color: theme.colors.textPrimary,
    fontSize: 13,
    fontWeight: '700',
  },
  trailingColumn: {
    alignItems: 'flex-end',
  },
  trailingTime: {
    color: theme.colors.textMuted,
    fontSize: 11,
  },
  inboxRow: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },
  unreadBadge: {
    marginTop: 6,
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: theme.colors.magenta,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  unreadBadgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
  earningRow: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },
  earningAmount: {
    color: theme.colors.success,
    fontSize: 13,
    fontWeight: '700',
  },
  emptyText: {
    marginTop: 12,
    color: theme.colors.textSecondary,
    fontSize: 13,
  },
});

export default ListenerHomeScreen;
