import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, AppState, Image, RefreshControl, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import StoryAvatar from '../components/StoryAvatar';
import SupportCard from '../components/SupportCard';
import WalletPill from '../components/WalletPill';
import BottomSheetAnonymous from '../components/BottomSheetAnonymous';
import HostPreviewModal from '../components/HostPreviewModal';
import { AUTH_DEBUG_ENABLED } from '../constants/api';
import theme from '../constants/theme';
import { useAuth } from '../context/AuthContext';
import { useWalletFlow } from '../context/WalletFlowContext';
import { resetToAuthEntry } from '../navigation/navigationRef';
import { isUnauthorizedApiError } from '../services/apiClient';
import { resolveAvatarSource, resolveAvatarUri } from '../services/avatarResolver';
import { fetchHostAvailability, fetchHosts } from '../services/listenersApi';
import { getChatSessions, getInboxItems, getWalletSummary, requestCall, requestChat } from '../services/sessionApi';
import { connectRealtimeSocket, subscribeRealtimeSocketState } from '../services/realtimeSocket';
import { queryKeys } from '../services/queryClient';
import { requestCallAudioPermissions } from '../services/audioPermissions';
import { getCallStatusMessageByCode, getCallStatusMessageFromError } from '../services/callStatusMessage';
import { isUserBlocked } from '../services/chatInteractionPrefs';

const TABS = ['Verified', 'Inbox'];
const SYNC = { connected: 'connected', reconnecting: 'reconnecting', disconnected: 'disconnected' };
const hostQueryParams = { page: 1, limit: 30, includeOnlyActive: true, includeOnlyVisible: true };
const up = (v) => String(v || '').toUpperCase();
const fmtTime = (v) => {
  if (!v) return '';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return '';
  const n = new Date();
  const sameDay = d.getDate() === n.getDate() && d.getMonth() === n.getMonth() && d.getFullYear() === n.getFullYear();
  return sameDay ? d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : d.toLocaleDateString([], { month: 'short', day: 'numeric' });
};

const HomeScreen = ({ navigation }) => {
  const { session } = useAuth();
  const { currentBalance, setCurrentBalance } = useWalletFlow();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState(TABS[0]);
  const [showAnonymousModal, setShowAnonymousModal] = useState(false);
  const [socketState, setSocketState] = useState(SYNC.disconnected);
  const [searchQuery, setSearchQuery] = useState('');
  const [previewHost, setPreviewHost] = useState(null);
  const searchInputRef = useRef(null);

  const hostsQuery = useQuery({ queryKey: queryKeys.hosts.list(hostQueryParams), queryFn: () => fetchHosts(hostQueryParams), staleTime: 10000 });
  const walletQuery = useQuery({ queryKey: queryKeys.wallet.summary, queryFn: getWalletSummary, staleTime: 10000, enabled: Boolean(session?.accessToken) });
  const inboxQuery = useQuery({
    queryKey: queryKeys.sessions.inbox(session?.user?.role || 'user'),
    queryFn: () => getInboxItems({ currentUserId: session?.user?.id, limit: 12 }),
    staleTime: 8000,
    enabled: Boolean(session?.accessToken) && activeTab === 'Inbox',
  });

  const inboxItems = useMemo(() => inboxQuery.data || [], [inboxQuery.data]);
  const userAvatarSource = useMemo(() => {
    return resolveAvatarSource({
      uploadedImageUrl: session?.user?.uploadedProfileImageUrl || null,
      profileImageUrl: session?.user?.profileImageUrl || null,
      id: session?.user?.id || null,
      phone: session?.user?.phone || null,
      name: session?.user?.displayName || null,
      role: session?.user?.role || null,
    });
  }, [
    session?.user?.displayName,
    session?.user?.id,
    session?.user?.phone,
    session?.user?.profileImageUrl,
    session?.user?.role,
    session?.user?.uploadedProfileImageUrl,
  ]);

  const refreshLiveData = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.hosts.all }),
      queryClient.invalidateQueries({ queryKey: queryKeys.wallet.summary }),
      queryClient.invalidateQueries({ queryKey: queryKeys.sessions.all }),
    ]);
  }, [queryClient]);

  useFocusEffect(useCallback(() => { refreshLiveData(); }, [refreshLiveData]));

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => { if (state === 'active') refreshLiveData(); });
    return () => sub.remove();
  }, [refreshLiveData]);

  useEffect(() => {
    if (!session?.accessToken) {
      setSocketState(SYNC.disconnected);
      return undefined;
    }
    const socket = connectRealtimeSocket(session.accessToken);
    const unsubscribe = subscribeRealtimeSocketState(({ state }) => setSocketState(state || SYNC.disconnected));
    if (!socket) return unsubscribe;
    const invalidateHosts = () => queryClient.invalidateQueries({ queryKey: queryKeys.hosts.all });
    const invalidateWallet = () => queryClient.invalidateQueries({ queryKey: queryKeys.wallet.summary });
    const invalidateSessions = () => queryClient.invalidateQueries({ queryKey: queryKeys.sessions.all });
    ['host_updated', 'host_deleted', 'host_status_changed', 'pricing_updated', 'referral_updated', 'listener_status_changed'].forEach((eventName) => socket.on(eventName, invalidateHosts));
    ['wallet_updated'].forEach((eventName) => socket.on(eventName, invalidateWallet));
    ['chat_started', 'chat_accepted', 'chat_message', 'chat_ended', 'call_started', 'call_accepted', 'call_ended'].forEach((eventName) => socket.on(eventName, invalidateSessions));
    return () => {
      ['host_updated', 'host_deleted', 'host_status_changed', 'pricing_updated', 'referral_updated', 'listener_status_changed'].forEach((eventName) => socket.off(eventName, invalidateHosts));
      ['wallet_updated'].forEach((eventName) => socket.off(eventName, invalidateWallet));
      ['chat_started', 'chat_accepted', 'chat_message', 'chat_ended', 'call_started', 'call_accepted', 'call_ended'].forEach((eventName) => socket.off(eventName, invalidateSessions));
      unsubscribe();
    };
  }, [queryClient, session?.accessToken]);

  useEffect(() => {
    if (typeof walletQuery.data?.balance === 'number') {
      setCurrentBalance(walletQuery.data.balance);
    }
  }, [setCurrentBalance, walletQuery.data?.balance]);

  const hosts = useMemo(
    () =>
      (hostsQuery.data?.items || [])
        .filter((item) => {
          const visibility = up(item?.visibility || item?.profileVisibility);
          const status = up(item?.status || item?.accountStatus || item?.user?.status);
          const verification = up(item?.verificationStatus);
          return (
            item?.isVisible !== false &&
            item?.isEnabled !== false &&
            !['HIDDEN', 'DELETED'].includes(visibility) &&
            !['BLOCKED', 'SUSPENDED', 'DELETED', 'INACTIVE'].includes(status) &&
            (!verification || verification === 'VERIFIED')
          );
        })
        .map((item) => {
          const callRate = Number(item.callRatePerMinute || 0);
          const avatarUrl = resolveAvatarUri({
            uploadedImageUrl: item?.user?.uploadedProfileImageUrl || null,
            profileImageUrl: item?.user?.profileImageUrl || null,
            id: item?.userId || null,
            userId: item?.userId || null,
            name: item?.user?.displayName || null,
            role: 'LISTENER',
          });
          return {
            id: item.userId,
            listenerId: item.userId,
            name: item.user?.displayName || 'Support Host',
            rating: Number(item.rating || 0) || 4.8,
            reviewCount: Number(item.totalSessions || 0) || 0,
            experience: `${item.experienceYears || 0}+ yrs exp`,
            experienceYears: Number(item.experienceYears || 0),
            quote:
              item.bio ||
              `A safe and private support space with ${item.user?.displayName || 'this host'}.`,
            bio: item.bio || '',
            category: item.category || null,
            age: item.age || null,
            languages: Array.isArray(item.languages) ? item.languages : [],
            price: `${callRate}/min`,
            avatar: avatarUrl,
            profileImageUrl: avatarUrl,
            isOnline: up(item.availability) === 'ONLINE',
            chatRatePerMinute: Number(item.chatRatePerMinute || callRate),
            callRatePerMinute: callRate,
          };
        }),
    [hostsQuery.data?.items],
  );

  const normalizedSearchQuery = useMemo(
    () =>
      String(searchQuery || '')
        .trim()
        .replace(/\s+/g, ' ')
        .toLowerCase(),
    [searchQuery],
  );

  const filteredHosts = useMemo(() => {
    if (!normalizedSearchQuery) {
      return hosts;
    }

    return hosts.filter((item) => {
      const searchableValue = `${item?.name || ''} ${item?.quote || ''} ${item?.experience || ''} ${item?.price || ''}`
        .trim()
        .toLowerCase();
      return searchableValue.includes(normalizedSearchQuery);
    });
  }, [hosts, normalizedSearchQuery]);

  const filteredInboxItems = useMemo(() => {
    if (!normalizedSearchQuery) {
      return inboxItems;
    }

    return inboxItems.filter((item) => {
      const searchableValue = `${item?.participant?.name || ''} ${item?.preview || ''} ${item?.type || ''} ${item?.status || ''}`
        .trim()
        .toLowerCase();
      return searchableValue.includes(normalizedSearchQuery);
    });
  }, [inboxItems, normalizedSearchQuery]);

  useEffect(() => {
    if (!AUTH_DEBUG_ENABLED) {
      return;
    }

    console.log('[HomeScreen] searchQueryChanged', {
      query: normalizedSearchQuery || null,
      activeTab,
      hostResultCount: filteredHosts.length,
      inboxResultCount: filteredInboxItems.length,
    });
  }, [activeTab, filteredHosts.length, filteredInboxItems.length, normalizedSearchQuery]);

  const syncUi = {
    connected: { title: 'LIVE SYNC ON', subtitle: 'Connected and updating live data', button: 'LIVE', helper: '', pill: styles.livePill },
    reconnecting: { title: 'LIVE SYNC RECONNECTING', subtitle: 'Trying to restore live data', button: 'SYNCING', helper: 'Trying to restore live data', pill: styles.syncingPill },
    disconnected: { title: 'LIVE SYNC OFF', subtitle: 'Live updates are temporarily unavailable', button: 'RETRY', helper: 'Live updates are temporarily unavailable', pill: styles.retryPill },
  }[socketState === SYNC.connected ? 'connected' : socketState === SYNC.reconnecting ? 'reconnecting' : 'disconnected'];

  const validateHostAvailability = useCallback(async (listenerId) => {
    const availability = await fetchHostAvailability(listenerId);
    const isVisible = availability?.isVisible !== false;
    const isEnabled = availability?.isEnabled !== false;
    const normalizedAvailability = up(availability?.availability);
    if (normalizedAvailability !== 'ONLINE' || !isVisible || !isEnabled) {
      const reasonCode = normalizedAvailability === 'BUSY' ? 'HOST_BUSY' : 'HOST_OFFLINE';
      const error = new Error(getCallStatusMessageByCode(reasonCode));
      error.code = reasonCode;
      throw error;
    }
  }, []);

  const openHostPreviewCard = useCallback((host) => {
    if (!host) {
      return;
    }

    if (AUTH_DEBUG_ENABLED) {
      console.log('[HomeScreen] profileOpen', {
        source: 'host_card_avatar',
        listenerId: host.listenerId || host.id || null,
      });
    }

    setPreviewHost(host);
  }, []);

  const openCall = async (host) => {
    if (!session?.accessToken) return resetToAuthEntry();
    try {
      const blocked = await isUserBlocked({
        currentUserId: session?.user?.id,
        counterpartyId: host?.listenerId,
      });
      if (blocked) {
        Alert.alert('Blocked contact', 'Unblock this host from chat menu before starting calls.');
        return;
      }

      await validateHostAvailability(host.listenerId);

      const permissionResult = await requestCallAudioPermissions();
      console.log('[Call] microphone permission preflight', {
        granted: permissionResult?.granted === true,
        permissions: permissionResult?.permissions || null,
        source: 'HomeScreen.openCall',
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
      if (!isUnauthorizedApiError(error)) {
        Alert.alert('Call unavailable', getCallStatusMessageFromError(error));
      }
    }
  };

  const openChat = async (host) => {
    if (!session?.accessToken) return resetToAuthEntry();
    try {
      const blocked = await isUserBlocked({
        currentUserId: session?.user?.id,
        counterpartyId: host?.listenerId,
      });
      if (blocked) {
        Alert.alert('Blocked contact', 'Unblock this host from chat menu before starting a chat.');
        return;
      }

      await validateHostAvailability(host.listenerId);

      // Prefer resuming an already-active chat session so history is preserved.
      const cachedInbox = queryClient.getQueryData(
        queryKeys.sessions.inbox(session?.user?.role || 'user'),
      );
      const cachedActiveSession = (cachedInbox || []).find(
        (item) =>
          item?.type === 'chat' &&
          String(item?.session?.status || '').toUpperCase() === 'ACTIVE' &&
          String(item?.session?.listenerId || '') === String(host.listenerId),
      )?.session;

      if (cachedActiveSession?.id) {
        navigation.navigate('ChatSession', { chatPayload: { session: cachedActiveSession, agora: null }, host });
        return;
      }

      let existingActive = null;
      try {
        const sessions = await getChatSessions({ page: 1, limit: 25, status: 'ACTIVE' });
        existingActive = (sessions?.items || []).find(
          (item) => String(item?.listenerId || '') === String(host.listenerId),
        );
      } catch (_error) {}

      if (existingActive?.id) {
        navigation.navigate('ChatSession', { chatPayload: { session: existingActive, agora: null }, host });
        return;
      }

      const chatPayload = await requestChat(host.listenerId);
      await refreshLiveData();
      navigation.navigate('ChatSession', { chatPayload, host });
    } catch (error) {
      if (!isUnauthorizedApiError(error)) Alert.alert('Unable to start chat', error?.response?.data?.message || error?.message || 'This host is currently unavailable.');
    }
  };

  const openInboxItem = async (item) => {
    if (!session?.accessToken) return resetToAuthEntry();
    if (item?.type !== 'chat') {
      return Alert.alert('Call history', item?.preview || 'Call activity updated.');
    }

    const host = {
      name: item?.participant?.name || 'Conversation',
      avatar: resolveAvatarUri({
        profileImageUrl: item?.participant?.profileImageUrl || null,
        id: item?.participant?.id || item?.session?.listenerId || null,
        userId: item?.participant?.id || item?.session?.listenerId || null,
        name: item?.participant?.name || null,
      }),
      listenerId: item?.session?.listenerId || null,
      userId: item?.participant?.id || null,
      isOnline: up(item?.status) === 'ACTIVE',
    };

    const normalizedStatus = up(item?.session?.status);
    const isListenerRole = up(session?.user?.role) === 'LISTENER';

    if (!isListenerRole && normalizedStatus !== 'ACTIVE') {
      if (!host?.listenerId) {
        Alert.alert('Chat unavailable', 'Unable to start a new chat session right now.');
        return;
      }

      try {
        const chatPayload = await requestChat(host.listenerId);
        await refreshLiveData();
        navigation.navigate('ChatSession', { chatPayload, host });
      } catch (error) {
        if (!isUnauthorizedApiError(error)) {
          Alert.alert(
            'Unable to start chat',
            error?.response?.data?.message ||
              error?.message ||
              'This host is currently unavailable.',
          );
        }
      }
      return;
    }

    if (isListenerRole && normalizedStatus !== 'ACTIVE') {
      Alert.alert(
        'No active chat',
        'This session has already ended. Wait for the user to start a new chat.',
      );
      return;
    }

    navigation.navigate('ChatSession', { chatPayload: { session: item.session, agora: null }, host });
  };

  const openWallet = () => {
    const parentNavigation = navigation.getParent();
    console.log('[Wallet] wallet icon press', {
      from: 'Home',
      route: 'MyWallet',
      balance: walletQuery.data?.balance ?? currentBalance ?? 0,
    });

    if (parentNavigation) {
      console.log('[Wallet] route navigation', {
        from: 'Home',
        to: 'MyWallet',
      });
      parentNavigation.navigate('MyWallet');
      return;
    }

    navigation.navigate('MyWallet');
  };

  return (
    <LinearGradient colors={['#04020C', '#0A0312', '#1B0623']} style={styles.container}>
      <StatusBar style="light" />
      <SafeAreaView style={styles.safeArea}>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={hostsQuery.isRefetching || walletQuery.isRefetching || inboxQuery.isRefetching} onRefresh={refreshLiveData} tintColor="#FF2AA3" />}>
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <TouchableOpacity style={styles.avatarShell} activeOpacity={0.85} onPress={() => navigation.openDrawer()}>
                <Image source={userAvatarSource} style={styles.avatar} />
              </TouchableOpacity>
              <View style={styles.headerText}>
                <Text style={styles.greeting}>Good Evening,</Text>
                <Text style={styles.heading}>How are you feeling today?</Text>
              </View>
            </View>
            <View style={styles.headerRight}>
              <TouchableOpacity
                style={styles.iconBtn}
                activeOpacity={0.8}
                onPress={() => searchInputRef.current?.focus()}
              >
                <Ionicons name="search" size={20} color={theme.colors.magenta} />
              </TouchableOpacity>
              <WalletPill amount={walletQuery.data?.balance ?? currentBalance ?? 0} onPress={openWallet} />
            </View>
          </View>

          <View style={styles.searchBar}>
            <Ionicons name="search" size={16} color={theme.colors.textSecondary} />
            <TextInput
              ref={searchInputRef}
              value={searchQuery}
              onChangeText={setSearchQuery}
              onSubmitEditing={() => {
                if (!AUTH_DEBUG_ENABLED) {
                  return;
                }
                console.log('[HomeScreen] searchSubmitted', {
                  query: normalizedSearchQuery || null,
                  activeTab,
                });
              }}
              placeholder={activeTab === 'Inbox' ? 'Search inbox...' : 'Search hosts...'}
              placeholderTextColor="rgba(255,255,255,0.4)"
              style={styles.searchInput}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
            />
            {searchQuery ? (
              <TouchableOpacity onPress={() => setSearchQuery('')} activeOpacity={0.8}>
                <Ionicons name="close-circle" size={18} color={theme.colors.textSecondary} />
              </TouchableOpacity>
            ) : null}
          </View>

          {session?.isDemoUser ? (
            <View style={styles.demoBadge}>
              <Text style={styles.demoBadgeText}>Demo Mode</Text>
            </View>
          ) : null}

          <TouchableOpacity style={styles.syncCard} onPress={() => { if (session?.accessToken && socketState !== SYNC.connected) connectRealtimeSocket(session.accessToken); refreshLiveData(); }} activeOpacity={0.9}>
            <View style={{ flex: 1, paddingRight: 12 }}>
              <Text style={styles.syncTitle}>{syncUi.title}</Text>
              <Text style={styles.syncSubtitle}>{syncUi.subtitle}</Text>
            </View>
            <View style={[styles.syncPill, syncUi.pill]}><Text style={styles.syncPillText}>{syncUi.button}</Text></View>
          </TouchableOpacity>
          {syncUi.helper ? <View style={styles.syncHelper}><Text style={styles.syncHelperText}>{syncUi.helper}</Text></View> : null}

          <View style={styles.tabs}>
            {TABS.map((tab) => {
              const active = tab === activeTab;
              return (
                <TouchableOpacity key={tab} style={styles.tabBtn} onPress={() => setActiveTab(tab)} activeOpacity={0.8}>
                  <Text style={[styles.tabText, active && styles.tabTextActive]}>{tab}</Text>
                  {active ? <View style={styles.tabLine} /> : null}
                </TouchableOpacity>
              );
            })}
          </View>

          {activeTab === 'Verified' ? (
            <>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.storyRow}>
                {filteredHosts.slice(0, 8).map((story) => (
                  <StoryAvatar
                    key={story.id}
                    name={story.name}
                    online={story.isOnline}
                    image={story.avatar}
                    avatarSeedId={story.listenerId || story.id}
                    onPress={() =>
                      navigation.navigate('Profile', {
                        profileMode: 'counterparty',
                        profileData: {
                          id: story.listenerId || story.id,
                          name: story.name,
                          avatar: typeof story.avatar === 'string' ? story.avatar : null,
                          role: 'LISTENER',
                          availability: story.isOnline ? 'ONLINE' : 'OFFLINE',
                        },
                      })
                    }
                  />
                ))}
              </ScrollView>
              <TouchableOpacity style={styles.anonCard} onPress={() => setShowAnonymousModal(true)} activeOpacity={0.9}>
                <MaterialCommunityIcons name="incognito" size={20} color={theme.colors.magenta} style={{ marginRight: 10 }} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.anonTitle}>You are Anonymous</Text>
                  <Text style={styles.anonSub}>Tap to view your privacy details</Text>
                </View>
              </TouchableOpacity>
              <Text style={styles.sectionTitle}>Available Verified Hosts</Text>
              {hostsQuery.isLoading && !hostsQuery.data ? <View style={styles.stateCard}><Text style={styles.stateText}>Loading live hosts...</Text></View> : null}
              {hostsQuery.isError && !hostsQuery.data ? <View style={styles.errorCard}><Text style={styles.errorTitle}>Unable to load live data.</Text><TouchableOpacity style={styles.smallBtn} onPress={refreshLiveData}><Text style={styles.smallBtnText}>Retry</Text></TouchableOpacity></View> : null}
                              {!hostsQuery.isLoading && !hostsQuery.isError && !filteredHosts.length ? <View style={styles.stateCard}><Text style={styles.stateText}>{normalizedSearchQuery ? 'No hosts match your search.' : 'No available hosts right now.'}</Text></View> : null}
              {!hostsQuery.isLoading && !hostsQuery.isError
                ? filteredHosts.slice(0, 6).map((person) => (
                    <SupportCard
                      key={person.id}
                      person={person}
                      talkDisabled={!person.isOnline}
                      chatDisabled={!person.isOnline}
                      onAvatarPress={() => openHostPreviewCard(person)}
                      onTalkPress={() => openCall(person)}
                      onChatPress={() => openChat(person)}
                    />
                  ))
                : null}
            </>
          ) : (
            <View style={styles.inboxWrap}>
              {inboxQuery.isLoading && !inboxQuery.data ? <View style={styles.stateCard}><Text style={styles.stateText}>Loading your real conversations...</Text></View> : null}
              {inboxQuery.isError && !inboxQuery.data ? <View style={styles.errorCard}><Text style={styles.errorTitle}>Unable to load inbox.</Text><TouchableOpacity style={styles.smallBtn} onPress={refreshLiveData}><Text style={styles.smallBtnText}>Retry</Text></TouchableOpacity></View> : null}
              {!inboxQuery.isLoading && !inboxQuery.isError && !filteredInboxItems.length ? <View style={styles.emptyCard}><Text style={styles.emptyTitle}>{normalizedSearchQuery ? 'No matching conversations' : 'Start conversation...'}</Text><Text style={styles.emptySub}>{normalizedSearchQuery ? 'Try another name or keyword.' : 'Your real chat and call history will appear here once you connect with a host.'}</Text></View> : null}
              {filteredInboxItems.map((item) => (
                <TouchableOpacity key={item.id} style={styles.inboxRow} activeOpacity={0.88} onPress={() => openInboxItem(item)}>
                  <View style={styles.inboxAvatarWrap}>
                    <Image
                      source={resolveAvatarSource({
                        profileImageUrl: item?.participant?.profileImageUrl || null,
                        id: item?.participant?.id || item?.session?.listenerId || null,
                        userId: item?.participant?.id || item?.session?.listenerId || null,
                        name: item?.participant?.name || null,
                      })}
                      style={styles.inboxAvatar}
                    />
                    <View style={[styles.dot, up(item?.status) === 'ACTIVE' ? styles.dotOn : styles.dotOff]} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={styles.inboxTop}>
                      <Text style={styles.inboxName} numberOfLines={1}>{item?.participant?.name || 'Conversation'}</Text>
                      <Text style={styles.inboxTime}>{fmtTime(item?.timestamp)}</Text>
                    </View>
                    <View style={styles.inboxBottom}>
                      <Text style={[styles.inboxPreview, item?.unreadCount ? styles.inboxPreviewUnread : null]} numberOfLines={2}>{item?.preview || 'Start conversation...'}</Text>
                      {item?.unreadCount ? <View style={styles.badge}><Text style={styles.badgeText}>{item.unreadCount > 9 ? '9+' : item.unreadCount}</Text></View> : <View style={[styles.typePill, item?.type === 'chat' ? styles.chatPill : styles.callPill]}><Text style={styles.typeText}>{item?.type === 'chat' ? 'CHAT' : 'CALL'}</Text></View>}
                    </View>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
      <HostPreviewModal
        visible={Boolean(previewHost)}
        host={previewHost}
        onClose={() => setPreviewHost(null)}
        onChatNow={() => {
          const selectedHost = previewHost;
          setPreviewHost(null);
          if (selectedHost) {
            openChat(selectedHost);
          }
        }}
        onTalkNow={() => {
          const selectedHost = previewHost;
          setPreviewHost(null);
          if (selectedHost) {
            openCall(selectedHost);
          }
        }}
      />
      <BottomSheetAnonymous visible={showAnonymousModal} onClose={() => setShowAnonymousModal(false)} />
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 }, safeArea: { flex: 1 }, content: { paddingHorizontal: 16, paddingTop: 6, paddingBottom: 28 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginTop: 8, marginBottom: 12 },
  headerLeft: { flexDirection: 'row', alignItems: 'center', flexShrink: 1, marginRight: 10 }, headerRight: { flexDirection: 'row', alignItems: 'center', gap: 8 }, headerText: { marginLeft: 10, flexShrink: 1 },
  avatarShell: { width: 48, height: 48, borderRadius: 24, borderWidth: 1.5, borderColor: theme.colors.magenta, padding: 2, backgroundColor: 'rgba(255,255,255,0.08)' }, avatar: { width: '100%', height: '100%', borderRadius: 24 },
  greeting: { color: theme.colors.textSecondary, fontSize: 15, fontWeight: '500' }, heading: { color: theme.colors.textPrimary, fontSize: 17, fontWeight: '700', lineHeight: 22, maxWidth: 132 },
  iconBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: theme.colors.borderSoft, alignItems: 'center', justifyContent: 'center' },
  searchBar: { marginBottom: 12, borderRadius: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', backgroundColor: 'rgba(255,255,255,0.06)', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, minHeight: 44, gap: 8 },
  searchInput: { flex: 1, color: theme.colors.textPrimary, fontSize: 14, paddingVertical: 8 },
  demoBadge: { alignSelf: 'flex-start', marginBottom: 10, borderRadius: 999, borderWidth: 1, borderColor: 'rgba(255,42,163,0.3)', backgroundColor: 'rgba(255,42,163,0.12)', paddingHorizontal: 12, paddingVertical: 6 },
  demoBadgeText: { color: theme.colors.textPrimary, fontSize: 11, fontWeight: '700', letterSpacing: 0.4, textTransform: 'uppercase' },
  syncCard: { borderRadius: 18, borderWidth: 1, borderColor: 'rgba(255,42,163,0.4)', backgroundColor: 'rgba(36,15,42,0.85)', paddingHorizontal: 14, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  syncTitle: { color: theme.colors.textPrimary, fontSize: 16, fontWeight: '700' }, syncSubtitle: { color: theme.colors.magenta, fontSize: 12, marginTop: 1 }, syncPill: { borderRadius: 18, borderWidth: 1, paddingHorizontal: 16, paddingVertical: 7 }, syncPillText: { color: theme.colors.textPrimary, fontSize: 13, fontWeight: '700' },
  livePill: { borderColor: theme.colors.borderPink, backgroundColor: 'rgba(255,35,159,0.18)' }, syncingPill: { borderColor: 'rgba(255,184,0,0.45)', backgroundColor: 'rgba(255,184,0,0.14)' }, retryPill: { borderColor: 'rgba(255,85,96,0.45)', backgroundColor: 'rgba(255,85,96,0.14)' },
  syncHelper: { borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', backgroundColor: 'rgba(255,255,255,0.05)', paddingHorizontal: 12, paddingVertical: 8, marginBottom: 12 }, syncHelperText: { color: theme.colors.textSecondary, fontSize: 12 },
  tabs: { flexDirection: 'row', gap: 18, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.07)', paddingBottom: 8, marginTop: 4 }, tabBtn: { paddingBottom: 3 }, tabText: { color: theme.colors.textMuted, fontSize: theme.typography.h3, fontWeight: '600' }, tabTextActive: { color: theme.colors.textPrimary }, tabLine: { marginTop: 6, height: 3, borderRadius: 3, backgroundColor: theme.colors.magenta },
  storyRow: { paddingTop: 12, paddingBottom: 8 }, anonCard: { marginTop: 8, marginBottom: 14, borderRadius: 20, borderWidth: 1, borderColor: 'rgba(255,42,163,0.35)', backgroundColor: 'rgba(33,15,41,0.88)', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 13, paddingVertical: 11 }, anonTitle: { color: theme.colors.textPrimary, fontSize: 15, fontWeight: '700' }, anonSub: { color: theme.colors.textSecondary, fontSize: 13, marginTop: 1 },
  sectionTitle: { color: theme.colors.textPrimary, fontSize: 16, fontWeight: '700', marginBottom: 8 }, stateCard: { borderRadius: 18, borderWidth: 1, borderColor: theme.colors.borderSoft, backgroundColor: 'rgba(255,255,255,0.06)', paddingVertical: 20, alignItems: 'center', justifyContent: 'center', marginBottom: 12 }, stateText: { color: theme.colors.textSecondary, fontSize: 14 },
  errorCard: { borderRadius: 18, borderWidth: 1, borderColor: 'rgba(255,85,96,0.4)', backgroundColor: 'rgba(255,85,96,0.08)', paddingHorizontal: 14, paddingVertical: 12, marginBottom: 12 }, errorTitle: { color: theme.colors.textPrimary, fontSize: 14, fontWeight: '700' }, smallBtn: { alignSelf: 'flex-start', marginTop: 10, borderRadius: 12, borderWidth: 1, borderColor: theme.colors.borderPink, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: 'rgba(255,42,163,0.18)' }, smallBtnText: { color: theme.colors.textPrimary, fontWeight: '700', fontSize: 12 },
  inboxWrap: { marginTop: 14, gap: 12 }, emptyCard: { borderRadius: 24, borderWidth: 1, borderColor: 'rgba(255,42,163,0.25)', backgroundColor: 'rgba(24,13,35,0.92)', paddingHorizontal: 18, paddingVertical: 28 }, emptyTitle: { color: theme.colors.textPrimary, fontSize: 18, fontWeight: '700' }, emptySub: { marginTop: 8, color: theme.colors.textSecondary, fontSize: 13, lineHeight: 20 },
  inboxRow: { borderRadius: 24, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', backgroundColor: 'rgba(23,13,35,0.96)', paddingHorizontal: 14, paddingVertical: 13, flexDirection: 'row', alignItems: 'center' }, inboxAvatarWrap: { marginRight: 12 }, inboxAvatar: { width: 60, height: 60, borderRadius: 30, borderWidth: 1.5, borderColor: 'rgba(255,42,163,0.55)', backgroundColor: '#2A2137' },
  dot: { position: 'absolute', right: 1, bottom: 1, width: 12, height: 12, borderRadius: 6, borderWidth: 2, borderColor: '#180B23' }, dotOn: { backgroundColor: theme.colors.success }, dotOff: { backgroundColor: 'rgba(255,255,255,0.26)' },
  inboxTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }, inboxBottom: { flexDirection: 'row', alignItems: 'center', marginTop: 6 }, inboxName: { flex: 1, color: theme.colors.textPrimary, fontSize: 17, fontWeight: '700' }, inboxTime: { color: theme.colors.textMuted, fontSize: 12, marginTop: 2 }, inboxPreview: { flex: 1, paddingRight: 12, color: theme.colors.textSecondary, fontSize: 13, lineHeight: 18 }, inboxPreviewUnread: { color: theme.colors.textPrimary },
  badge: { minWidth: 24, height: 24, borderRadius: 12, paddingHorizontal: 7, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,42,163,0.92)' }, badgeText: { color: '#FFFFFF', fontSize: 11, fontWeight: '700' },
  typePill: { borderRadius: 11, borderWidth: 1, paddingHorizontal: 9, paddingVertical: 4 }, chatPill: { borderColor: 'rgba(15,214,122,0.35)', backgroundColor: 'rgba(15,214,122,0.12)' }, callPill: { borderColor: 'rgba(255,42,163,0.35)', backgroundColor: 'rgba(255,42,163,0.12)' }, typeText: { color: theme.colors.textPrimary, fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
});

export default HomeScreen;
