import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import theme from '../constants/theme';
import AppLogo from '../components/AppLogo';
import { useAuth } from '../context/AuthContext';
import { fetchHostAvailability } from '../services/listenersApi';
import {
  connectRealtimeSocket,
  getRealtimeSocket,
  subscribeRealtimeSocketState,
} from '../services/realtimeSocket';
import {
  acceptCallRequest,
  acceptChatRequest,
  rejectCallRequest,
  rejectChatRequest,
  updateMyAvailability,
} from '../services/listenerApi';

const availabilityLabels = {
  ONLINE: 'ONLINE',
  OFFLINE: 'OFFLINE',
  BUSY: 'BUSY',
};

const ListenerHomeScreen = ({ navigation }) => {
  const { session, logout } = useAuth();
  const [availability, setAvailability] = useState('OFFLINE');
  const [updatingAvailability, setUpdatingAvailability] = useState(false);
  const [incomingRequests, setIncomingRequests] = useState([]);
  const [syncState, setSyncState] = useState('disconnected');

  const listenerName = session?.user?.displayName || 'Listener';

  const sortedRequests = useMemo(
    () =>
      [...incomingRequests].sort(
        (a, b) => new Date(b.requestedAt || Date.now()) - new Date(a.requestedAt || Date.now()),
      ),
    [incomingRequests],
  );

  const upsertIncomingRequest = (request) => {
    setIncomingRequests((prev) => {
      const existingIndex = prev.findIndex((item) => item.sessionId === request.sessionId);
      if (existingIndex >= 0) {
        const next = [...prev];
        next[existingIndex] = request;
        return next;
      }
      return [request, ...prev];
    });
  };

  const removeIncomingRequest = (sessionId) => {
    setIncomingRequests((prev) => prev.filter((item) => item.sessionId !== sessionId));
  };

  useEffect(() => {
    const loadCurrentAvailability = async () => {
      if (!session?.user?.id) {
        return;
      }

      try {
        const status = await fetchHostAvailability(session.user.id);
        if (status?.availability) {
          setAvailability(status.availability);
        }
      } catch (_error) {
        // Keep default state when backend read fails; user can retry with toggle actions.
      }
    };

    loadCurrentAvailability();
  }, [session?.user?.id]);

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

    const onCallRequest = (payload) => {
      upsertIncomingRequest({
        sessionId: payload.sessionId,
        type: 'call',
        requester: payload.requester,
        ratePerMinute: payload.ratePerMinute,
        requestedAt: payload.requestedAt,
      });
    };

    const onChatRequest = (payload) => {
      upsertIncomingRequest({
        sessionId: payload.sessionId,
        type: 'chat',
        requester: payload.requester,
        ratePerMinute: payload.ratePerMinute,
        requestedAt: payload.requestedAt,
      });
    };

    const onSessionResolved = (payload) => {
      if (payload?.sessionId) {
        removeIncomingRequest(payload.sessionId);
      }
    };

    socket.on('call_request', onCallRequest);
    socket.on('chat_request', onChatRequest);
    socket.on('call_rejected', onSessionResolved);
    socket.on('chat_rejected', onSessionResolved);
    socket.on('call_ended', onSessionResolved);
    socket.on('chat_ended', onSessionResolved);
    socket.on('session_ended', onSessionResolved);

    return () => {
      socket.off('call_request', onCallRequest);
      socket.off('chat_request', onChatRequest);
      socket.off('call_rejected', onSessionResolved);
      socket.off('chat_rejected', onSessionResolved);
      socket.off('call_ended', onSessionResolved);
      socket.off('chat_ended', onSessionResolved);
      socket.off('session_ended', onSessionResolved);
      unsubscribeSocketState();
    };
  }, [session?.accessToken]);

  const setOnlineState = async (nextAvailability) => {
    if (updatingAvailability || availability === nextAvailability) {
      return;
    }

    setUpdatingAvailability(true);
    try {
      await updateMyAvailability(nextAvailability);
      setAvailability(nextAvailability);

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
    } catch (apiError) {
      const message =
        apiError?.response?.data?.message || 'Unable to update listener availability.';
      Alert.alert('Status update failed', message);
    } finally {
      setUpdatingAvailability(false);
    }
  };

  const acceptRequest = async (request) => {
    try {
      if (request.type === 'call') {
        const callPayload = await acceptCallRequest(request.sessionId);
        removeIncomingRequest(request.sessionId);
        setAvailability('BUSY');
        navigation.navigate('CallSession', {
          callPayload,
          host: {
            name: request.requester?.displayName || 'User',
            avatar: null,
            userId: request.requester?.id,
            sessionId: request.sessionId,
          },
        });
        return;
      }

      const chatPayload = await acceptChatRequest(request.sessionId);
      removeIncomingRequest(request.sessionId);
      setAvailability('BUSY');
      navigation.navigate('ChatSession', {
        chatPayload,
        host: {
          name: request.requester?.displayName || 'User',
          avatar: null,
          userId: request.requester?.id,
          sessionId: request.sessionId,
        },
      });
    } catch (apiError) {
      const message =
        apiError?.response?.data?.message ||
        apiError?.message ||
        'Unable to accept request.';
      Alert.alert('Request failed', message);
      removeIncomingRequest(request.sessionId);
    }
  };

  const rejectRequest = async (request) => {
    try {
      if (request.type === 'call') {
        await rejectCallRequest(request.sessionId, 'Rejected by listener');
      } else {
        await rejectChatRequest(request.sessionId, 'Rejected by listener');
      }
    } catch (_error) {
      // Keep local queue clean even if network rejects.
    } finally {
      removeIncomingRequest(request.sessionId);
    }
  };

  const onLogout = async () => {
    const socket = getRealtimeSocket();
    if (socket) {
      socket.emit('listener_offline');
    }
    await logout();
    navigation.reset({
      index: 0,
      routes: [{ name: 'Onboarding' }],
    });
  };

  const renderRequest = ({ item }) => {
    const requestTypeLabel = item.type === 'call' ? 'Incoming Call' : 'Incoming Chat';
    const requesterName = item.requester?.displayName || 'Anonymous User';
    const requestedTime = new Date(item.requestedAt || Date.now()).toLocaleTimeString();

    return (
      <View style={styles.requestCard}>
        <Text style={styles.requestType}>{requestTypeLabel}</Text>
        <Text style={styles.requestName}>{requesterName}</Text>
        <Text style={styles.requestMeta}>
          Rate: INR {item.ratePerMinute}/min - {requestedTime}
        </Text>

        <View style={styles.requestActions}>
          <TouchableOpacity
            style={[styles.requestButton, styles.rejectButton]}
            onPress={() => rejectRequest(item)}
            activeOpacity={0.85}
          >
            <Text style={styles.requestButtonText}>Reject</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.requestButton, styles.acceptButton]}
            onPress={() => acceptRequest(item)}
            activeOpacity={0.85}
          >
            <Text style={styles.requestButtonText}>Accept</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <LinearGradient colors={['#04020C', '#0A0312', '#1B0623']} style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <AppLogo size="sm" />
          <TouchableOpacity style={styles.logoutButton} onPress={onLogout} activeOpacity={0.85}>
            <Ionicons name="log-out-outline" size={18} color={theme.colors.textPrimary} />
          </TouchableOpacity>
        </View>

        <View style={styles.welcomeCard}>
          <Text style={styles.welcomeTitle}>Welcome, {listenerName}</Text>
          <Text style={styles.welcomeSubTitle}>
            Listener Sync: {syncState.toUpperCase()} - Status: {availabilityLabels[availability]}
          </Text>
        </View>

        <View style={styles.toggleRow}>
          <TouchableOpacity
            style={[
              styles.toggleButton,
              availability === 'ONLINE' && styles.toggleButtonActive,
            ]}
            onPress={() => setOnlineState('ONLINE')}
            activeOpacity={0.85}
            disabled={updatingAvailability}
          >
            <Text style={styles.toggleText}>Go Online</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.toggleButton,
              availability === 'OFFLINE' && styles.toggleButtonActive,
            ]}
            onPress={() => setOnlineState('OFFLINE')}
            activeOpacity={0.85}
            disabled={updatingAvailability}
          >
            <Text style={styles.toggleText}>Go Offline</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.sectionTitle}>Incoming Requests</Text>

        <FlatList
          data={sortedRequests}
          keyExtractor={(item) => `${item.type}-${item.sessionId}`}
          renderItem={renderRequest}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>No incoming requests yet.</Text>
            </View>
          }
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        />
      </SafeAreaView>
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1, paddingHorizontal: 16, paddingBottom: 12 },
  header: {
    marginTop: 4,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  logoutButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: theme.colors.borderSoft,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.07)',
  },
  welcomeCard: {
    marginTop: 14,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: theme.colors.borderPink,
    backgroundColor: 'rgba(255, 42, 163, 0.08)',
    paddingHorizontal: 14,
    paddingVertical: 12,
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
  toggleRow: {
    marginTop: 14,
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
    backgroundColor: 'rgba(255, 42, 163, 0.24)',
  },
  toggleText: {
    color: theme.colors.textPrimary,
    fontSize: 13,
    fontWeight: '700',
  },
  sectionTitle: {
    marginTop: 18,
    color: theme.colors.textPrimary,
    fontSize: 16,
    fontWeight: '700',
  },
  listContent: {
    paddingTop: 10,
    paddingBottom: 20,
    flexGrow: 1,
  },
  requestCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.colors.borderSoft,
    backgroundColor: 'rgba(255,255,255,0.06)',
    padding: 12,
    marginBottom: 10,
  },
  requestType: {
    color: theme.colors.magenta,
    fontSize: 12,
    fontWeight: '700',
  },
  requestName: {
    marginTop: 4,
    color: theme.colors.textPrimary,
    fontSize: 17,
    fontWeight: '700',
  },
  requestMeta: {
    marginTop: 4,
    color: theme.colors.textSecondary,
    fontSize: 12,
  },
  requestActions: {
    marginTop: 10,
    flexDirection: 'row',
    gap: 10,
  },
  requestButton: {
    flex: 1,
    height: 40,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rejectButton: {
    borderColor: 'rgba(255,255,255,0.2)',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  acceptButton: {
    borderColor: theme.colors.borderPink,
    backgroundColor: 'rgba(255, 42, 163, 0.25)',
  },
  requestButtonText: {
    color: theme.colors.textPrimary,
    fontSize: 13,
    fontWeight: '700',
  },
  emptyState: {
    flex: 1,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.colors.borderSoft,
    backgroundColor: 'rgba(255,255,255,0.05)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 30,
  },
  emptyText: {
    color: theme.colors.textSecondary,
    fontSize: 13,
  },
});

export default ListenerHomeScreen;
