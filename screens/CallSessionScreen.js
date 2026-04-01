import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, AppState, Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import theme from '../constants/theme';
import { AUTH_DEBUG_ENABLED } from '../constants/api';
import { useAuth } from '../context/AuthContext';
import { resetToAuthEntry } from '../navigation/navigationRef';
import { isUnauthorizedApiError } from '../services/apiClient';
import { endDemoCallSession } from '../services/demoMode';
import { startIncomingRingtone, stopIncomingRingtone } from '../services/incomingRingtoneService';
import { rejectCallRequest } from '../services/listenerApi';
import { connectRealtimeSocket, emitWithAck, getRealtimeSocket } from '../services/realtimeSocket';
import { endCallSession, getCallSession, refreshCallToken } from '../services/sessionApi';
import {
  destroyAgoraVoiceEngine,
  getAgoraVoiceSessionState,
  joinAgoraVoiceChannel,
  leaveAgoraVoiceChannel,
  muteLocalAudio,
  renewAgoraVoiceToken,
  setSpeakerEnabled,
  shouldKeepAgoraVoiceSessionAlive,
} from '../services/agoraVoiceService';
import { requestCallAudioPermissions } from '../services/audioPermissions';

const avatarPlaceholder = require('../assets/main/avatar-placeholder.png');
const src = (v) => (typeof v === 'string' ? { uri: v } : v || avatarPlaceholder);
const fmt = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
const activeControlIconColor = '#08040F';
const isSpeakerRoute = (routing) => {
  if (typeof routing === 'number') {
    return routing === 3;
  }

  const normalizedRouting = String(routing || '')
    .trim()
    .toLowerCase();

  return normalizedRouting === 'speaker' || normalizedRouting === 'speakerphone';
};

const logCallDebug = (label, payload) => {
  if (!AUTH_DEBUG_ENABLED) {
    return;
  }

  console.log(`[CallSessionScreen] ${label}`, payload);
};

const CallSessionScreen = ({ navigation, route }) => {
  const { session: authSession } = useAuth();
  const [runtimePayload, setRuntimePayload] = useState(route?.params?.callPayload || null);
  const incomingRequest = route?.params?.incomingRequest || null;
  const host = route?.params?.host || {};
  const payload = runtimePayload;
  const sessionId = payload?.session?.id || incomingRequest?.sessionId;
  const isListener = authSession?.user?.role === 'LISTENER';
  const isDemoSession = Boolean(authSession?.isDemoUser || payload?.demoMode || incomingRequest?.demoMode);
  const [statusText, setStatusText] = useState(incomingRequest && !payload ? 'Incoming Call' : payload?.session?.status === 'ACTIVE' ? 'Connecting...' : 'Ringing...');
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [isMicMuted, setIsMicMuted] = useState(false);
  const [isSpeakerOn, setIsSpeakerOn] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [lowBalanceWarning, setLowBalanceWarning] = useState('');
  const intervalRef = useRef(null);
  const demoConnectTimeoutRef = useRef(null);
  const sessionEndedRef = useRef(false);
  const hasJoinedAgoraRef = useRef(false);
  const joiningAgoraRef = useRef(false);
  const resolvingIncomingRef = useRef(false);
  const latestAgoraRef = useRef(payload?.agora || null);
  const runtimePayloadRef = useRef(route?.params?.callPayload || null);
  const callConnectedRef = useRef(payload?.session?.status === 'ACTIVE');
  const callStartedAtRef = useRef(payload?.session?.startedAt || payload?.session?.answeredAt || null);
  const joinAttemptCountRef = useRef(0);
  const currentAudioRouteRef = useRef(null);
  const callSyncTimeoutRef = useRef(null);
  const callSyncInFlightRef = useRef(false);
  const appStateRef = useRef(AppState.currentState || 'active');
  const [isResolvingIncoming, setIsResolvingIncoming] = useState(false);

  const displayName = useMemo(() => host?.name || incomingRequest?.requester?.displayName || 'Support Host', [host?.name, incomingRequest?.requester?.displayName]);
  const avatar = useMemo(() => src(host?.avatar || host?.profileImageUrl), [host?.avatar, host?.profileImageUrl]);
  const callMode = incomingRequest && !runtimePayload ? 'incoming' : isConnected ? 'active' : 'outgoing';

  const clearTimer = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = null;
  }, []);

  const startTimer = useCallback((initialSeconds = 0) => {
    clearTimer();
    setElapsedSeconds(initialSeconds);
    intervalRef.current = setInterval(() => setElapsedSeconds((prev) => prev + 1), 1000);
  }, [clearTimer]);

  useEffect(() => {
    runtimePayloadRef.current = runtimePayload;
    if (runtimePayload?.agora) {
      latestAgoraRef.current = runtimePayload.agora;
    }
    if (runtimePayload?.session?.status === 'ACTIVE') {
      callConnectedRef.current = true;
    }
    if (runtimePayload?.session?.startedAt || runtimePayload?.session?.answeredAt) {
      callStartedAtRef.current =
        runtimePayload?.session?.startedAt || runtimePayload?.session?.answeredAt;
    }
  }, [runtimePayload]);

  const activateConnectedState = useCallback((startedAt) => {
    if (callSyncTimeoutRef.current) {
      clearTimeout(callSyncTimeoutRef.current);
      callSyncTimeoutRef.current = null;
    }
    const resolvedStartedAt = startedAt || callStartedAtRef.current;
    setIsConnected(true);
    setStatusText('Connected');
    startTimer(
      resolvedStartedAt
        ? Math.max(0, Math.floor((Date.now() - new Date(resolvedStartedAt).getTime()) / 1000))
        : 0,
    );
  }, [startTimer]);

  const cleanupAgoraSession = useCallback(async (reason = 'unknown') => {
    if (isDemoSession) {
      return;
    }

    const agoraState = getAgoraVoiceSessionState();
    logCallDebug('leaveChannelCalled', {
      sessionId,
      joined: hasJoinedAgoraRef.current,
      reason,
      agoraState,
    });
    await leaveAgoraVoiceChannel().catch(() => {});
    logCallDebug('engineCleanup', {
      sessionId,
      reason,
    });
    destroyAgoraVoiceEngine();
    hasJoinedAgoraRef.current = false;
    joiningAgoraRef.current = false;
    callConnectedRef.current = false;
  }, [isDemoSession, sessionId]);

  const stopIncomingCallRingtone = useCallback((reason = 'unknown') => {
    if (!sessionId) {
      return;
    }

    stopIncomingRingtone({
      sessionId,
      reason,
    }).catch(() => {});
  }, [sessionId]);

  const syncRuntimePayloadFromSession = useCallback((liveSession) => {
    if (!liveSession) {
      return;
    }

    setRuntimePayload((prev) => {
      const nextPayload = prev
        ? {
            ...prev,
            session: {
              ...prev.session,
              ...liveSession,
            },
          }
        : {
            session: liveSession,
            agora: latestAgoraRef.current,
          };

      runtimePayloadRef.current = nextPayload;
      return nextPayload;
    });
  }, []);

  const joinAgoraIfNeeded = useCallback(async () => {
    if (hasJoinedAgoraRef.current || joiningAgoraRef.current || !sessionId) {
      logCallDebug('joinSkippedGuard', {
        sessionId,
        hasJoined: hasJoinedAgoraRef.current,
        joining: joiningAgoraRef.current,
      });
      return;
    }
    if (isDemoSession) {
      hasJoinedAgoraRef.current = true;
      setIsConnected(true);
      setStatusText('Connected');
      const startedAt = runtimePayloadRef.current?.session?.startedAt || runtimePayloadRef.current?.session?.answeredAt || new Date();
      startTimer(
        Math.max(0, Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000)),
      );
      return;
    }

    joiningAgoraRef.current = true;
    joinAttemptCountRef.current += 1;
    const activePayload = runtimePayloadRef.current;

    try {
      const permissionResult = await requestCallAudioPermissions();
      logCallDebug('microphonePermissionResult', {
        sessionId,
        granted: permissionResult?.granted === true,
        permissions: permissionResult?.permissions || null,
      });

      if (!permissionResult?.granted) {
        throw new Error('Microphone permission is required to join the call.');
      }

      if (!latestAgoraRef.current?.appId || !latestAgoraRef.current?.token) {
        const refreshedRtc = await refreshCallToken(sessionId);
        latestAgoraRef.current = {
          appId: refreshedRtc?.agora?.appId,
          token: refreshedRtc?.agora?.token,
          uid: refreshedRtc?.agora?.uid,
          channelName:
            refreshedRtc?.channelName ||
            activePayload?.session?.channelName ||
            activePayload?.agora?.channelName,
        };
      }
      const resolvedChannelName =
        latestAgoraRef.current?.channelName ||
        activePayload?.session?.channelName ||
        activePayload?.agora?.channelName;
      if (!latestAgoraRef.current?.appId || !latestAgoraRef.current?.token || !resolvedChannelName) {
        throw new Error('Missing Agora call credentials.');
      }

      logCallDebug('joinChannelCalled', {
        sessionId,
        channelName: resolvedChannelName,
        attemptCount: joinAttemptCountRef.current,
      });
      await joinAgoraVoiceChannel({
        appId: latestAgoraRef.current.appId,
        token: latestAgoraRef.current.token,
        channelName: resolvedChannelName,
        uid: latestAgoraRef.current.uid,
        sessionId,
        onJoinSuccess: () => {
          logCallDebug('joinSuccess', {
            sessionId,
            channelName: resolvedChannelName,
            attemptCount: joinAttemptCountRef.current,
          });
          // Default voice calls to the earpiece like a normal phone call.
          muteLocalAudio(false);
          setSpeakerEnabled(false, {
            isMicMuted: false,
            reason: 'initial_join',
          }).catch(() => {});
          logCallDebug('audioDefaultsApplied', {
            sessionId,
            muted: false,
            speakerOn: false,
          });
        },
        onUserJoined: (remoteUid) => {
          logCallDebug('remoteUserJoined', {
            sessionId,
            remoteUid,
          });
        },
        onUserOffline: (remoteUid) => {
          logCallDebug('remoteUserOffline', {
            sessionId,
            remoteUid,
          });
          setStatusText('Call ended');
        },
        onConnectionStateChanged: ({ state, reason }) => {
          logCallDebug('agoraConnectionStateChanged', {
            sessionId,
            state,
            reason,
          });
        },
        onLocalAudioStateChanged: ({ state, reason }) => {
          logCallDebug('localAudioStateChanged', {
            sessionId,
            state,
            reason,
          });
        },
        onRemoteAudioStateChanged: ({ remoteUid, state, reason }) => {
          logCallDebug('remoteAudioStateChanged', {
            sessionId,
            remoteUid,
            state,
            reason,
          });
        },
        onAudioRoutingChanged: ({ routing }) => {
          currentAudioRouteRef.current = routing;
          setIsSpeakerOn(isSpeakerRoute(routing));
          logCallDebug('audioRoutingChanged', {
            sessionId,
            routing,
            speakerOn: isSpeakerRoute(routing),
          });
        },
        onAudioVolumeIndication: ({ totalVolume, speakers }) => {
          const top = Array.isArray(speakers) ? speakers.slice(0, 2) : [];
          logCallDebug('audioVolumeIndication', {
            sessionId,
            totalVolume,
            speakers: top.map((item) => ({
              uid: item?.uid ?? null,
              volume: item?.volume ?? null,
              vad: item?.vad ?? null,
            })),
          });
        },
        onTokenWillExpire: async () => {
          try {
            const refreshed = await refreshCallToken(sessionId);
            latestAgoraRef.current = refreshed?.agora || latestAgoraRef.current;
            if (refreshed?.agora?.token) renewAgoraVoiceToken(refreshed.agora.token);
          } catch (_error) {}
        },
      });
      hasJoinedAgoraRef.current = true;
      await emitWithAck('call_media_joined', { sessionId });
      logCallDebug('callMediaJoinedAck', {
        sessionId,
      });
      if (callConnectedRef.current) {
        activateConnectedState(callStartedAtRef.current);
      } else {
        setStatusText('Connecting...');
      }
    } catch (error) {
      hasJoinedAgoraRef.current = false;
      logCallDebug('joinFailure', {
        sessionId,
        message: error?.message || 'Unknown error',
        attemptCount: joinAttemptCountRef.current,
      });
      await cleanupAgoraSession('join_failure').catch(() => {});
      throw error;
    } finally {
      joiningAgoraRef.current = false;
    }
  }, [activateConnectedState, cleanupAgoraSession, isDemoSession, sessionId, startTimer]);

  const handleSessionEnded = useCallback((eventPayload) => {
    if (eventPayload?.sessionId !== sessionId || sessionEndedRef.current) return;
    sessionEndedRef.current = true;
    if (callSyncTimeoutRef.current) {
      clearTimeout(callSyncTimeoutRef.current);
      callSyncTimeoutRef.current = null;
    }
    logCallDebug('callEnded', {
      sessionId,
      reasonCode: eventPayload?.reasonCode || null,
      endReason: eventPayload?.endReason || null,
    });

    const normalizedEndReason = String(eventPayload?.endReason || '').trim().toUpperCase();
    const normalizedReasonCode = String(eventPayload?.reasonCode || '').trim().toUpperCase();

    if (
      ['USER_ENDED', 'CANCELLED'].includes(normalizedEndReason) ||
      ['ENDED_BY_USER', 'CANCELLED_BY_USER'].includes(normalizedReasonCode)
    ) {
      logCallDebug('callerCancelled', {
        sessionId,
        endReason: normalizedEndReason || null,
        reasonCode: normalizedReasonCode || null,
      });
      stopIncomingCallRingtone('caller_cancelled');
    } else if (
      ['MISSED', 'TIMEOUT'].includes(normalizedEndReason) ||
      ['MISSED', 'TIMEOUT'].includes(normalizedReasonCode)
    ) {
      logCallDebug('missedCallTimeout', {
        sessionId,
        endReason: normalizedEndReason || null,
        reasonCode: normalizedReasonCode || null,
      });
      stopIncomingCallRingtone('missed_call_timeout');
    } else {
      stopIncomingCallRingtone('call_ended');
    }

    clearTimer();
    cleanupAgoraSession('session_ended').catch(() => {});
    setStatusText('Call ended');
    if (eventPayload?.reasonCode === 'LOW_BALANCE') {
      Alert.alert('Insufficient Balance', 'You do not have sufficient balance. Please recharge your wallet to continue.', [{ text: 'OK', onPress: () => navigation.goBack() }]);
    } else {
      navigation.goBack();
    }
  }, [cleanupAgoraSession, clearTimer, navigation, sessionId, stopIncomingCallRingtone]);

  useEffect(() => {
    if (isDemoSession) {
      return undefined;
    }

    const subscription = AppState.addEventListener('change', (nextState) => {
      const previousState = appStateRef.current;
      appStateRef.current = nextState;
      const agoraState = getAgoraVoiceSessionState();
      const callActive =
        Boolean(callConnectedRef.current) ||
        Boolean(hasJoinedAgoraRef.current) ||
        Boolean(joiningAgoraRef.current) ||
        shouldKeepAgoraVoiceSessionAlive();

      logCallDebug('appStateChanged', {
        sessionId,
        previousState,
        nextState,
        callActive,
        callConnected: callConnectedRef.current,
        agoraState,
      });

      if (nextState !== 'active') {
        logCallDebug('screenBackgroundTransition', {
          sessionId,
          nextState,
          callActive,
          callConnected: callConnectedRef.current,
        });
        return;
      }

      if (callActive && callStartedAtRef.current) {
        activateConnectedState(callStartedAtRef.current);
      }
    });

    return () => {
      subscription.remove();
    };
  }, [activateConnectedState, isDemoSession, sessionId]);

  const reconcileCallerCallState = useCallback(async (reason = 'poll') => {
    if (
      isDemoSession ||
      isListener ||
      incomingRequest ||
      !authSession?.accessToken ||
      !sessionId ||
      sessionEndedRef.current ||
      callConnectedRef.current ||
      callSyncInFlightRef.current
    ) {
      return;
    }

    callSyncInFlightRef.current = true;

    try {
      logCallDebug('callSyncCheckStart', {
        sessionId,
        reason,
        hasJoined: hasJoinedAgoraRef.current,
        joining: joiningAgoraRef.current,
        connected: callConnectedRef.current,
      });

      const snapshot = await getCallSession(sessionId);
      const liveSession = snapshot?.session || null;
      const realtime = snapshot?.realtime || {};

      if (!liveSession) {
        return;
      }

      syncRuntimePayloadFromSession(liveSession);

      const normalizedStatus = String(liveSession?.status || '').toUpperCase();
      callStartedAtRef.current =
        liveSession?.startedAt || liveSession?.answeredAt || callStartedAtRef.current;

      logCallDebug('callSyncCheckResult', {
        sessionId,
        reason,
        status: normalizedStatus || null,
        isAccepted: Boolean(realtime?.isAccepted),
        hasUserJoinedMedia: Boolean(realtime?.hasUserJoinedMedia),
        hasListenerJoinedMedia: Boolean(realtime?.hasListenerJoinedMedia),
      });

      if (
        realtime?.isRejected ||
        ['REJECTED', 'CANCELLED', 'MISSED', 'ENDED'].includes(normalizedStatus)
      ) {
        sessionEndedRef.current = true;
        clearTimer();
        await cleanupAgoraSession().catch(() => {});
        setStatusText(normalizedStatus === 'REJECTED' ? 'Call rejected' : 'Call ended');
        Alert.alert(
          normalizedStatus === 'REJECTED' ? 'Call rejected' : 'Call ended',
          normalizedStatus === 'REJECTED'
            ? 'Call rejected by listener.'
            : 'This call is no longer active.',
          [
            {
              text: 'OK',
              onPress: () => navigation.goBack(),
            },
          ],
        );
        return;
      }

      if (realtime?.isAccepted && !callConnectedRef.current) {
        setStatusText('Connecting...');
        logCallDebug('callAcceptedRecovered', {
          sessionId,
          reason,
          hasJoined: hasJoinedAgoraRef.current,
          hasListenerJoinedMedia: Boolean(realtime?.hasListenerJoinedMedia),
        });

        if (!hasJoinedAgoraRef.current && !joiningAgoraRef.current) {
          await joinAgoraIfNeeded();
        }
      }

      if (normalizedStatus === 'ACTIVE') {
        callConnectedRef.current = true;
        if (!hasJoinedAgoraRef.current && !joiningAgoraRef.current) {
          await joinAgoraIfNeeded();
        }
        if (hasJoinedAgoraRef.current) {
          activateConnectedState(callStartedAtRef.current);
        }
      }
    } catch (error) {
      logCallDebug('callSyncCheckFailure', {
        sessionId,
        reason,
        message: error?.response?.data?.message || error?.message || 'Unknown error',
      });
    } finally {
      callSyncInFlightRef.current = false;
    }
  }, [
    activateConnectedState,
    authSession?.accessToken,
    cleanupAgoraSession,
    clearTimer,
    incomingRequest,
    isDemoSession,
    isListener,
    joinAgoraIfNeeded,
    navigation,
    sessionId,
    syncRuntimePayloadFromSession,
  ]);

  useEffect(() => {
    logCallDebug('callScreenInit', {
      sessionId,
      isListener,
      initialStatus:
        runtimePayloadRef.current?.session?.status || incomingRequest?.type || null,
      hasIncomingRequest: Boolean(incomingRequest),
    });
    if (isDemoSession) {
      if (!sessionId) {
        Alert.alert('Call unavailable', 'Unable to start demo call right now.');
        navigation.goBack();
        return undefined;
      }

      if (callMode === 'incoming') {
        setStatusText('Incoming Call');
      } else {
        setStatusText('Connecting...');
        demoConnectTimeoutRef.current = setTimeout(() => {
          setIsConnected(true);
          setStatusText('Connected');
          startTimer(payload?.session?.startedAt ? Math.max(0, Math.floor((Date.now() - new Date(payload.session.startedAt).getTime()) / 1000)) : 0);
        }, 900);
      }

      return () => {
        if (demoConnectTimeoutRef.current) clearTimeout(demoConnectTimeoutRef.current);
        clearTimer();
      };
    }

    if (!authSession?.accessToken) {
      resetToAuthEntry();
      return undefined;
    }
    if (!sessionId) {
      Alert.alert('Call unavailable', 'Unable to start call session right now.');
      navigation.goBack();
      return undefined;
    }
    let socket = getRealtimeSocket();
    if (!socket) socket = connectRealtimeSocket(authSession.accessToken);

    const onCallAccepted = async (eventPayload) => {
      if (eventPayload?.sessionId !== sessionId) return;
      logCallDebug('callAccepted', {
        sessionId: eventPayload?.sessionId || null,
        role: isListener ? 'listener' : 'caller',
      });
      setStatusText('Connecting...');
      try { await joinAgoraIfNeeded(); } catch (error) { if (!isUnauthorizedApiError(error)) Alert.alert('Call connection failed', error?.message || 'Unable to connect call.'); }
    };
    const onCallStarted = async (eventPayload) => {
      if (eventPayload?.sessionId !== sessionId) return;
      callConnectedRef.current = true;
      callStartedAtRef.current =
        eventPayload?.startedAt || eventPayload?.answeredAt || callStartedAtRef.current;
      setRuntimePayload((prev) =>
        prev
          ? {
              ...prev,
              session: {
                ...prev.session,
                status: 'ACTIVE',
                startedAt: eventPayload?.startedAt || prev.session?.startedAt,
                answeredAt: eventPayload?.answeredAt || prev.session?.answeredAt,
              },
            }
          : prev,
      );
      logCallDebug('callStarted', {
        sessionId: eventPayload?.sessionId || null,
        startedAt: callStartedAtRef.current,
      });
      try {
        if (!hasJoinedAgoraRef.current && !joiningAgoraRef.current) {
          await joinAgoraIfNeeded();
        }
        if (hasJoinedAgoraRef.current) {
          activateConnectedState(callStartedAtRef.current);
        }
      } catch (error) {
        if (!isUnauthorizedApiError(error)) Alert.alert('Call connection failed', error?.message || 'Unable to connect call.');
      }
    };
    const onCallRejected = (eventPayload) => {
      if (eventPayload?.sessionId !== sessionId) return;
      logCallDebug('callRejected', {
        sessionId: eventPayload?.sessionId || null,
        reason: eventPayload?.reason || null,
      });
      stopIncomingCallRingtone('call_rejected');
      clearTimer();
      cleanupAgoraSession('call_rejected').catch(() => {});
      setStatusText('Call rejected');
      Alert.alert('Call rejected', eventPayload?.reason || 'Call rejected by listener.', [
        {
          text: 'OK',
          onPress: () => navigation.goBack(),
        },
      ]);
    };
    const onLowBalance = (eventPayload) => { if (eventPayload?.sessionId === sessionId) setLowBalanceWarning(eventPayload?.message || 'Low balance. Please recharge to avoid disconnection.'); };

    socket.on('call_accepted', onCallAccepted);
    socket.on('call_started', onCallStarted);
    socket.on('call_rejected', onCallRejected);
    socket.on('call_low_balance_warning', onLowBalance);
    socket.on('call_end_due_to_low_balance', handleSessionEnded);
    socket.on('call_ended', handleSessionEnded);
    socket.emit('join_call_session', { sessionId });
    if (runtimePayloadRef.current?.session?.status === 'ACTIVE') {
      onCallStarted({
        sessionId,
        startedAt: runtimePayloadRef.current?.session?.startedAt,
        answeredAt: runtimePayloadRef.current?.session?.answeredAt,
      });
    }

    return () => {
      socket.off('call_accepted', onCallAccepted);
      socket.off('call_started', onCallStarted);
      socket.off('call_rejected', onCallRejected);
      socket.off('call_low_balance_warning', onLowBalance);
      socket.off('call_end_due_to_low_balance', handleSessionEnded);
      socket.off('call_ended', handleSessionEnded);
      clearTimer();
      const agoraState = getAgoraVoiceSessionState();
      const keepCallAlive =
        !sessionEndedRef.current &&
        !isDemoSession &&
        (Boolean(callConnectedRef.current) ||
          Boolean(hasJoinedAgoraRef.current) ||
          Boolean(joiningAgoraRef.current) ||
          shouldKeepAgoraVoiceSessionAlive());

      logCallDebug(
        keepCallAlive ? 'screenCleanupSkippedActiveCall' : 'screenCleanupProceeding',
        {
          sessionId,
          appState: appStateRef.current,
          callConnected: callConnectedRef.current,
          hasJoined: hasJoinedAgoraRef.current,
          joining: joiningAgoraRef.current,
          sessionEnded: sessionEndedRef.current,
          agoraState,
        },
      );

      if (!keepCallAlive) {
        cleanupAgoraSession('screen_unmount').catch(() => {});
      }
    };
  }, [activateConnectedState, authSession?.accessToken, cleanupAgoraSession, clearTimer, handleSessionEnded, incomingRequest, isDemoSession, isListener, joinAgoraIfNeeded, navigation, sessionId, startTimer, stopIncomingCallRingtone]);

  useEffect(() => {
    if (isDemoSession || !isListener || callMode !== 'incoming' || !sessionId) {
      return undefined;
    }

    startIncomingRingtone({
      sessionId,
      source: 'incoming_call_screen',
    }).catch(() => {});

    return () => {
      stopIncomingCallRingtone('screen_cleanup');
    };
  }, [callMode, isDemoSession, isListener, sessionId, stopIncomingCallRingtone]);

  useEffect(() => {
    if (isDemoSession || isListener || incomingRequest || !sessionId) {
      return undefined;
    }

    let cancelled = false;

    const runSyncCheck = async (reason) => {
      if (cancelled || sessionEndedRef.current || callConnectedRef.current) {
        return;
      }

      await reconcileCallerCallState(reason);

      if (cancelled || sessionEndedRef.current || callConnectedRef.current) {
        return;
      }

      callSyncTimeoutRef.current = setTimeout(() => {
        runSyncCheck('poll');
      }, 1500);
    };

    runSyncCheck('initial');

    return () => {
      cancelled = true;
      if (callSyncTimeoutRef.current) {
        clearTimeout(callSyncTimeoutRef.current);
        callSyncTimeoutRef.current = null;
      }
    };
  }, [incomingRequest, isDemoSession, isListener, reconcileCallerCallState, sessionId]);

  useEffect(() => {
    if (isDemoSession || runtimePayload?.session?.id !== sessionId) {
      return;
    }

    if (runtimePayload?.session?.status === 'ACTIVE') {
      callConnectedRef.current = true;
      callStartedAtRef.current =
        runtimePayload?.session?.startedAt || runtimePayload?.session?.answeredAt || callStartedAtRef.current;

      if (hasJoinedAgoraRef.current) {
        activateConnectedState(callStartedAtRef.current);
      }
    }
  }, [
    activateConnectedState,
    isDemoSession,
    runtimePayload?.session?.answeredAt,
    runtimePayload?.session?.id,
    runtimePayload?.session?.startedAt,
    runtimePayload?.session?.status,
    sessionId,
  ]);

  const onToggleMute = () => {
    const next = !isMicMuted;
    logCallDebug('micButtonPressed', {
      sessionId,
      nextMuted: next,
      currentAudioRoute: currentAudioRouteRef.current,
      speakerOn: isSpeakerOn,
    });
    setIsMicMuted(next);
    if (!isDemoSession) {
      muteLocalAudio(next);
      logCallDebug('micToggleResult', {
        sessionId,
        muted: next,
        currentAudioRoute: currentAudioRouteRef.current,
      });
    }
  };
  const onToggleSpeaker = async () => {
    const next = !isSpeakerOn;
    logCallDebug('speakerButtonPressed', {
      sessionId,
      nextSpeakerOn: next,
      currentAudioRoute: currentAudioRouteRef.current,
      micMuted: isMicMuted,
    });
    if (!isDemoSession) {
      await setSpeakerEnabled(next, {
        isMicMuted,
        reason: 'toggle_from_call_screen',
      });
      logCallDebug('speakerToggleResult', {
        sessionId,
        speakerOn: next,
        currentAudioRoute: currentAudioRouteRef.current,
        micMuted: isMicMuted,
      });
      setIsSpeakerOn(next);
      return;
    }
    setIsSpeakerOn(next);
  };

  const onRejectIncoming = async () => {
    if (resolvingIncomingRef.current) {
      logCallDebug('callRejectSkipped', {
        sessionId,
        reason: 'already_resolving',
      });
      return;
    }

    resolvingIncomingRef.current = true;
    setIsResolvingIncoming(true);

    if (isDemoSession) {
      resolvingIncomingRef.current = false;
      setIsResolvingIncoming(false);
      navigation.goBack();
      return;
    }

    logCallDebug('callRejectStart', {
      sessionId,
    });
    logCallDebug('rejectPressed', {
      sessionId,
    });
    stopIncomingCallRingtone('reject_pressed');
    try {
      await rejectCallRequest(sessionId, 'Rejected by listener');
    } catch (_error) {
    } finally {
      resolvingIncomingRef.current = false;
      setIsResolvingIncoming(false);
      navigation.goBack();
    }
  };

  const onAcceptIncoming = async () => {
    if (resolvingIncomingRef.current) {
      logCallDebug('callAcceptSkipped', {
        sessionId,
        reason: 'already_resolving',
      });
      return;
    }

    resolvingIncomingRef.current = true;
    setIsResolvingIncoming(true);

    if (isDemoSession) {
      setRuntimePayload({
        session: {
          id: sessionId || `demo-call-${Date.now()}`,
          status: 'ACTIVE',
          startedAt: new Date().toISOString(),
          listenerId: incomingRequest?.requester?.id || host?.listenerId || null,
        },
        agora: null,
        demoMode: true,
      });
      setStatusText('Connecting...');
      resolvingIncomingRef.current = false;
      setIsResolvingIncoming(false);
      return;
    }

    try {
      logCallDebug('acceptPressed', {
        sessionId,
      });
      stopIncomingCallRingtone('accept_pressed');
      logCallDebug('callAcceptStart', {
        sessionId,
      });

      const permissionResult = await requestCallAudioPermissions();
      logCallDebug('microphonePermissionResult', {
        sessionId,
        granted: permissionResult?.granted === true,
        permissions: permissionResult?.permissions || null,
        source: 'acceptIncoming',
      });

      if (!permissionResult?.granted) {
        resolvingIncomingRef.current = false;
        setIsResolvingIncoming(false);
        startIncomingRingtone({
          sessionId,
          source: 'accept_permission_denied_resume',
        }).catch(() => {});
        Alert.alert(
          'Microphone permission needed',
          'Enable microphone permission to accept this call.',
        );
        return;
      }

      let socket = getRealtimeSocket();
      if (!socket) {
        socket = connectRealtimeSocket(authSession?.accessToken);
      }

      logCallDebug('callAcceptEmitStart', {
        sessionId,
        socketConnected: Boolean(socket?.connected),
      });

      const nextPayload = await emitWithAck('call_accepted', { sessionId });
      logCallDebug('callAcceptEmitSuccess', {
        sessionId: nextPayload?.session?.id || sessionId || null,
      });
      latestAgoraRef.current = nextPayload?.agora || null;
      runtimePayloadRef.current = nextPayload;
      setRuntimePayload(nextPayload);
      setStatusText('Connecting...');
      logCallDebug('callAcceptSuccess', {
        sessionId: nextPayload?.session?.id || sessionId || null,
      });
      await joinAgoraIfNeeded();
    } catch (error) {
      resolvingIncomingRef.current = false;
      setIsResolvingIncoming(false);
      startIncomingRingtone({
        sessionId,
        source: 'accept_failure_resume',
      }).catch(() => {});
      logCallDebug('callAcceptFailure', {
        sessionId,
        message: error?.response?.data?.message || error?.message || 'Unknown error',
      });
      if (!isUnauthorizedApiError(error)) Alert.alert('Unable to accept call', error?.response?.data?.message || error?.message || 'Unable to accept this call right now.');
      navigation.goBack();
    }
  };

  const onEndCall = async () => {
    if (isDemoSession) {
      clearTimer();
      await endDemoCallSession(sessionId, isListener ? 'LISTENER_ENDED' : 'USER_ENDED');
      navigation.goBack();
      return;
    }

    logCallDebug('callEndStart', {
      sessionId,
      isListener,
      callMode,
    });
    try {
      if (callMode === 'incoming') {
        await rejectCallRequest(sessionId, 'Rejected by listener').catch(() => {});
      } else {
        await endCallSession(sessionId, isListener ? 'LISTENER_ENDED' : 'USER_ENDED');
        await emitWithAck('call_ended', { sessionId, endReason: isListener ? 'LISTENER_ENDED' : 'USER_ENDED' }).catch(() => {});
      }
    } catch (_error) {
    } finally {
      clearTimer();
      await cleanupAgoraSession('manual_end_call').catch(() => {});
      navigation.goBack();
    }
  };

  return (
    <LinearGradient colors={['#08040F', '#110713', '#1A0A22']} style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <TouchableOpacity style={styles.backBtn} onPress={onEndCall} activeOpacity={0.85}>
          <Ionicons name="chevron-back" size={22} color={theme.colors.textPrimary} />
        </TouchableOpacity>

        <View style={styles.center}>
          <View style={styles.glowRing} />
          <View style={styles.avatarRing}>
            <Image source={avatar} style={styles.avatar} />
          </View>
          <Text style={styles.name}>{displayName}</Text>
          <Text style={styles.statusText}>{statusText}</Text>
          <Text style={styles.timerText}>{fmt(elapsedSeconds)}</Text>
          {lowBalanceWarning ? <View style={styles.warning}><Ionicons name="alert-circle" size={16} color={theme.colors.warning} /><Text style={styles.warningText}>{lowBalanceWarning}</Text></View> : null}
        </View>

        {callMode === 'incoming' ? (
          <View style={styles.incomingRow}>
            <TouchableOpacity style={[styles.answerBtn, styles.acceptBtn]} onPress={onAcceptIncoming} activeOpacity={0.88} disabled={isResolvingIncoming}>
              <MaterialIcons name="call" size={28} color="#FFFFFF" />
            </TouchableOpacity>
            <TouchableOpacity style={[styles.answerBtn, styles.rejectBtn]} onPress={onRejectIncoming} activeOpacity={0.88} disabled={isResolvingIncoming}>
              <MaterialIcons name="call-end" size={28} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.controlsDock}>
            <TouchableOpacity style={styles.controlBtn} onPress={onToggleMute} activeOpacity={0.88}>
              <Ionicons name={isMicMuted ? 'mic-off' : 'mic'} size={22} color={theme.colors.textPrimary} />
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.controlBtn, isSpeakerOn ? styles.controlBtnActive : null]}
              onPress={onToggleSpeaker}
              activeOpacity={0.88}
            >
              <Ionicons
                name="volume-high"
                size={22}
                color={isSpeakerOn ? activeControlIconColor : theme.colors.textPrimary}
              />
            </TouchableOpacity>
            <TouchableOpacity style={[styles.controlBtn, styles.endBtn]} onPress={onEndCall} activeOpacity={0.88}>
              <MaterialIcons name="call-end" size={26} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
        )}
      </SafeAreaView>
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 }, safeArea: { flex: 1, paddingHorizontal: 18, paddingBottom: 28 }, backBtn: { marginTop: 8, width: 42, height: 42, borderRadius: 21, borderWidth: 1, borderColor: theme.colors.borderSoft, backgroundColor: 'rgba(255,255,255,0.05)', alignItems: 'center', justifyContent: 'center' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' }, glowRing: { position: 'absolute', width: 190, height: 190, borderRadius: 95, backgroundColor: 'rgba(255,42,163,0.12)', shadowColor: theme.colors.magenta, shadowOpacity: 0.35, shadowRadius: 28, shadowOffset: { width: 0, height: 0 } }, avatarRing: { width: 150, height: 150, borderRadius: 75, borderWidth: 1.5, borderColor: 'rgba(255,42,163,0.7)', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.02)' }, avatar: { width: 134, height: 134, borderRadius: 67 },
  name: { marginTop: 18, color: theme.colors.textPrimary, fontSize: 30, fontWeight: '700' }, statusText: { marginTop: 10, color: theme.colors.textSecondary, fontSize: 16, fontWeight: '500' }, timerText: { marginTop: 4, color: 'rgba(255,255,255,0.82)', fontSize: 22, fontWeight: '600' },
  warning: { marginTop: 18, flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 14, borderWidth: 1, borderColor: 'rgba(255,184,0,0.4)', backgroundColor: 'rgba(255,184,0,0.12)', paddingHorizontal: 12, paddingVertical: 8 }, warningText: { color: theme.colors.warning, fontSize: 13, flexShrink: 1 },
  incomingRow: { flexDirection: 'row', justifyContent: 'space-evenly', alignItems: 'center', marginBottom: 24 }, answerBtn: { width: 78, height: 78, borderRadius: 39, alignItems: 'center', justifyContent: 'center' }, acceptBtn: { backgroundColor: '#08C45A' }, rejectBtn: { backgroundColor: '#FF4545' },
  controlsDock: { alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 14, borderRadius: 22, borderWidth: 1, borderColor: 'rgba(255,42,163,0.18)', backgroundColor: 'rgba(32,17,37,0.96)', paddingHorizontal: 16, paddingVertical: 12, marginBottom: 20 },
  controlBtn: { width: 56, height: 56, borderRadius: 28, backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' }, endBtn: { backgroundColor: '#FF4259' },
  controlBtnActive: { backgroundColor: '#FFFFFF' },
});

export default CallSessionScreen;
