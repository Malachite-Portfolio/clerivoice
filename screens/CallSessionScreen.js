import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import theme from '../constants/theme';
import { useAuth } from '../context/AuthContext';
import AppLogo from '../components/AppLogo';
import {
  connectRealtimeSocket,
  emitWithAck,
  getRealtimeSocket,
} from '../services/realtimeSocket';
import {
  endCallSession,
  refreshCallToken,
} from '../services/sessionApi';
import {
  destroyAgoraVoiceEngine,
  joinAgoraVoiceChannel,
  leaveAgoraVoiceChannel,
  muteLocalAudio,
  renewAgoraVoiceToken,
  setSpeakerEnabled,
} from '../services/agoraVoiceService';

const avatarPlaceholder = require('../assets/main/avatar-placeholder.png');

const formatDuration = (seconds) => {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
};

const CallSessionScreen = ({ navigation, route }) => {
  const { session: authSession } = useAuth();
  const payload = route?.params?.callPayload;
  const host = route?.params?.host;
  const sessionId = payload?.session?.id;
  const isListener = authSession?.user?.role === 'LISTENER';
  const channelName = payload?.session?.channelName || payload?.agora?.channelName;
  const [statusText, setStatusText] = useState(
    payload?.session?.status === 'ACTIVE' ? 'Connecting...' : 'Ringing...',
  );
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [isSpeakerOn, setIsSpeakerOn] = useState(true);
  const [isConnected, setIsConnected] = useState(false);
  const [lowBalanceWarning, setLowBalanceWarning] = useState('');
  const intervalRef = useRef(null);
  const sessionEndedRef = useRef(false);
  const hasJoinedAgoraRef = useRef(false);
  const latestAgoraRef = useRef(payload?.agora || null);

  const displayName = useMemo(() => host?.name || 'Support Host', [host?.name]);

  const clearTimer = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const startTimer = useCallback(() => {
    clearTimer();
    intervalRef.current = setInterval(() => {
      setElapsedSeconds((prev) => prev + 1);
    }, 1000);
  }, [clearTimer]);

  const joinAgoraIfNeeded = useCallback(async () => {
    if (hasJoinedAgoraRef.current) {
      return;
    }

    if (!latestAgoraRef.current?.appId || !latestAgoraRef.current?.token) {
      if (!sessionId) {
        throw new Error('Missing approved call session.');
      }
      const refreshedRtc = await refreshCallToken(sessionId);

      latestAgoraRef.current = {
        appId: refreshedRtc?.agora?.appId,
        token: refreshedRtc?.agora?.token,
        uid: refreshedRtc?.agora?.uid,
        channelName: refreshedRtc?.channelName || channelName,
      };
    }

    const resolvedChannelName = latestAgoraRef.current?.channelName || channelName;
    if (!latestAgoraRef.current?.appId || !latestAgoraRef.current?.token || !resolvedChannelName) {
      throw new Error('Missing Agora call credentials.');
    }

    await joinAgoraVoiceChannel({
      appId: latestAgoraRef.current.appId,
      token: latestAgoraRef.current.token,
      channelName: resolvedChannelName,
      uid: latestAgoraRef.current.uid,
      onJoinSuccess: () => {
        setStatusText('Connected');
      },
      onUserJoined: () => {
        setStatusText('Connected');
      },
      onUserOffline: () => {
        setStatusText('Host left');
      },
      onTokenWillExpire: async () => {
        try {
          const refreshed = await refreshCallToken(sessionId);
          latestAgoraRef.current = refreshed?.agora || latestAgoraRef.current;
          if (refreshed?.agora?.token) {
            renewAgoraVoiceToken(refreshed.agora.token);
          }
        } catch (_error) {
          // Token refresh failure will be handled by session-ended events from backend.
        }
      },
    });

    hasJoinedAgoraRef.current = true;
    setIsConnected(true);
    setStatusText('Connected');
    startTimer();
  }, [channelName, sessionId, startTimer]);

  const handleSessionEnded = useCallback(
    (eventPayload) => {
      if (eventPayload?.sessionId !== sessionId || sessionEndedRef.current) {
        return;
      }

      sessionEndedRef.current = true;
      clearTimer();
      setStatusText('Call ended');

      if (eventPayload?.reasonCode === 'LOW_BALANCE') {
        Alert.alert(
          'Insufficient Balance',
          'You do not have sufficient balance. Please recharge your wallet to continue.',
          [{ text: 'OK', onPress: () => navigation.goBack() }],
        );
      } else {
        navigation.goBack();
      }
    },
    [clearTimer, navigation, sessionId],
  );

  useEffect(() => {
    if (!sessionId || !authSession?.accessToken) {
      Alert.alert('Call unavailable', 'Unable to start call session right now.');
      navigation.goBack();
      return undefined;
    }

    let socket = getRealtimeSocket();
    if (!socket) {
      socket = connectRealtimeSocket(authSession.accessToken);
    }

    const onCallAccepted = async (eventPayload) => {
      if (eventPayload?.sessionId !== sessionId) {
        return;
      }

      try {
        await joinAgoraIfNeeded();
      } catch (error) {
        setStatusText('Connection failed');
        Alert.alert('Call connection failed', error.message || 'Unable to connect call.');
      }
    };

    const onCallStarted = async (eventPayload) => {
      if (eventPayload?.sessionId !== sessionId) {
        return;
      }

      try {
        await joinAgoraIfNeeded();
      } catch (error) {
        setStatusText('Connection failed');
        Alert.alert('Call connection failed', error.message || 'Unable to connect call.');
      }
    };

    const onLowBalance = (eventPayload) => {
      if (eventPayload?.sessionId !== sessionId) {
        return;
      }

      setLowBalanceWarning(
        eventPayload?.message || 'Low balance. Please recharge to avoid disconnection.',
      );
    };

    socket.on('call_accepted', onCallAccepted);
    socket.on('call_started', onCallStarted);
    socket.on('call_low_balance_warning', onLowBalance);
    socket.on('call_end_due_to_low_balance', handleSessionEnded);
    socket.on('call_ended', handleSessionEnded);

    socket.emit('join_call_session', { sessionId });

    if (payload?.session?.status === 'ACTIVE') {
      onCallStarted({ sessionId });
    }

    return () => {
      socket.off('call_accepted', onCallAccepted);
      socket.off('call_started', onCallStarted);
      socket.off('call_low_balance_warning', onLowBalance);
      socket.off('call_end_due_to_low_balance', handleSessionEnded);
      socket.off('call_ended', handleSessionEnded);
      clearTimer();
      leaveAgoraVoiceChannel().catch(() => {});
      destroyAgoraVoiceEngine();
    };
  }, [
    authSession?.accessToken,
    clearTimer,
    handleSessionEnded,
    joinAgoraIfNeeded,
    navigation,
    payload?.session?.status,
    sessionId,
  ]);

  const onToggleMute = () => {
    const next = !isMuted;
    setIsMuted(next);
    muteLocalAudio(next);
  };

  const onToggleSpeaker = () => {
    const next = !isSpeakerOn;
    setIsSpeakerOn(next);
    setSpeakerEnabled(next);
  };

  const onEndCall = async () => {
    const endReason = isListener ? 'LISTENER_ENDED' : 'USER_ENDED';
    try {
      await endCallSession(sessionId, endReason);
      await emitWithAck('call_ended', { sessionId, endReason }).catch(() => {});
    } catch (_error) {
      // Continue teardown even if backend request fails.
    } finally {
      clearTimer();
      await leaveAgoraVoiceChannel().catch(() => {});
      destroyAgoraVoiceEngine();
      navigation.goBack();
    }
  };

  return (
    <LinearGradient colors={['#05020D', '#0B0316', '#180523']} style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.iconCircle}
            onPress={onEndCall}
            activeOpacity={0.85}
          >
            <Ionicons name="chevron-back" size={22} color={theme.colors.textPrimary} />
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <AppLogo size="xs" withCard={false} style={styles.headerLogo} />
            <Text style={styles.headerTitle}>Voice Session</Text>
          </View>
          <View style={styles.iconCirclePlaceholder} />
        </View>

        <View style={styles.centerContent}>
          <Image
            source={host?.avatar ? host.avatar : avatarPlaceholder}
            style={styles.avatar}
          />
          <Text style={styles.name}>{displayName}</Text>
          <Text style={styles.status}>
            {statusText} {isConnected ? `- ${formatDuration(elapsedSeconds)}` : ''}
          </Text>

          {lowBalanceWarning ? (
            <View style={styles.warningBox}>
              <Ionicons name="alert-circle" size={16} color={theme.colors.warning} />
              <Text style={styles.warningText}>{lowBalanceWarning}</Text>
            </View>
          ) : null}
        </View>

        <View style={styles.controlsRow}>
          <TouchableOpacity style={styles.controlButton} onPress={onToggleMute} activeOpacity={0.85}>
            <Ionicons
              name={isMuted ? 'mic-off' : 'mic'}
              size={22}
              color={theme.colors.textPrimary}
            />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.controlButton, styles.endButton]}
            onPress={onEndCall}
            activeOpacity={0.85}
          >
            <MaterialIcons name="call-end" size={26} color="#FFFFFF" />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.controlButton}
            onPress={onToggleSpeaker}
            activeOpacity={0.85}
          >
            <Ionicons
              name={isSpeakerOn ? 'volume-high' : 'volume-mute'}
              size={22}
              color={theme.colors.textPrimary}
            />
          </TouchableOpacity>
        </View>
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
    paddingHorizontal: 18,
    paddingBottom: 28,
  },
  header: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerCenter: {
    alignItems: 'center',
  },
  headerLogo: {
    marginBottom: 2,
  },
  headerTitle: {
    color: theme.colors.textPrimary,
    fontSize: 18,
    fontWeight: '700',
  },
  iconCircle: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 1,
    borderColor: theme.colors.borderSoft,
    backgroundColor: 'rgba(255,255,255,0.05)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconCirclePlaceholder: {
    width: 42,
    height: 42,
  },
  centerContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatar: {
    width: 116,
    height: 116,
    borderRadius: 58,
    borderWidth: 2,
    borderColor: theme.colors.magenta,
    backgroundColor: '#302341',
  },
  name: {
    marginTop: 16,
    color: theme.colors.textPrimary,
    fontSize: 24,
    fontWeight: '700',
  },
  status: {
    marginTop: 7,
    color: theme.colors.textSecondary,
    fontSize: 15,
    fontWeight: '500',
  },
  warningBox: {
    marginTop: 18,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 184, 0, 0.12)',
    borderColor: 'rgba(255, 184, 0, 0.4)',
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
  },
  warningText: {
    color: theme.colors.warning,
    fontSize: 13,
    flexShrink: 1,
  },
  controlsRow: {
    flexDirection: 'row',
    justifyContent: 'space-evenly',
    alignItems: 'center',
    marginBottom: 20,
  },
  controlButton: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(255,255,255,0.09)',
    borderWidth: 1,
    borderColor: theme.colors.borderSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  endButton: {
    backgroundColor: '#D91B66',
    borderColor: '#E71F74',
  },
});

export default CallSessionScreen;

