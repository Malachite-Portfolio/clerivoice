import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, AppState, BackHandler, Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import theme from '../constants/theme';
import { AUTH_DEBUG_ENABLED } from '../constants/api';
import { useAuth } from '../context/AuthContext';
import { useCallSession } from '../context/CallSessionContext';
import { resetToAuthEntry } from '../navigation/navigationRef';
import { isUnauthorizedApiError } from '../services/apiClient';
import { resolveAvatarSource } from '../services/avatarResolver';
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
  setLocalVideoEnabled,
  setSpeakerEnabled,
  switchLocalCamera,
  isAgoraRtcNativeModuleAvailable,
  shouldKeepAgoraVoiceSessionAlive,
} from '../services/agoraVoiceService';
import {
  requestCallAudioPermissions,
  requestVideoCallPermissions,
} from '../services/audioPermissions';
import { getCallStatusMessageByCode } from '../services/callStatusMessage';

let agoraRtcUiModule = null;
let agoraRtcUiLoadError = null;

try {
  agoraRtcUiModule = require('react-native-agora');
} catch (error) {
  agoraRtcUiLoadError = error;
}

const RenderModeType = agoraRtcUiModule?.RenderModeType || {
  RenderModeHidden: 1,
};
const VideoSourceType = agoraRtcUiModule?.VideoSourceType || {
  VideoSourceCameraPrimary: 0,
};
const RtcSurfaceView = agoraRtcUiModule?.RtcSurfaceView || null;
const hasAgoraRtcSurfaceView = Boolean(RtcSurfaceView);

const fmt = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
const activeControlIconColor = '#08040F';
const normalizeCallType = (value) =>
  String(value || '').trim().toLowerCase() === 'video' ? 'video' : 'audio';
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
  const { setActiveCallFromParams, clearActiveCall } = useCallSession();
  const [runtimePayload, setRuntimePayload] = useState(route?.params?.callPayload || null);
  const incomingRequest = route?.params?.incomingRequest || null;
  const host = useMemo(() => route?.params?.host || {}, [route?.params?.host]);
  const payload = runtimePayload;
  const sessionId = payload?.session?.id || incomingRequest?.sessionId;
  const resolvedCallType = useMemo(
    () =>
      normalizeCallType(
        payload?.session?.callType ||
          payload?.realtime?.callType ||
          incomingRequest?.callType ||
          route?.params?.callPayload?.session?.callType ||
          route?.params?.incomingRequest?.callType,
      ),
    [
      incomingRequest?.callType,
      payload?.realtime?.callType,
      payload?.session?.callType,
      route?.params?.callPayload?.session?.callType,
      route?.params?.incomingRequest?.callType,
    ],
  );
  const isVideoCall = resolvedCallType === 'video';
  const isListener = authSession?.user?.role === 'LISTENER';
  const isDemoSession = Boolean(authSession?.isDemoUser || payload?.demoMode || incomingRequest?.demoMode);
  const [statusText, setStatusText] = useState(
    incomingRequest && !payload
      ? isVideoCall
        ? 'Incoming video call'
        : 'Incoming call'
      : payload?.session?.status === 'ACTIVE'
        ? 'Connecting...'
        : 'Calling...',
  );
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [isMicMuted, setIsMicMuted] = useState(false);
  const [isSpeakerOn, setIsSpeakerOn] = useState(false);
  const [isCameraEnabled, setIsCameraEnabled] = useState(isVideoCall);
  const [remoteVideoUid, setRemoteVideoUid] = useState(null);
  const [hasLocalVideoFrame, setHasLocalVideoFrame] = useState(false);
  const [isLocalPreviewBound, setIsLocalPreviewBound] = useState(false);
  const [hasRemoteVideoFrame, setHasRemoteVideoFrame] = useState(false);
  const [isCallConnected, setIsCallConnected] = useState(false);
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
  const backendMarkedActiveRef = useRef(payload?.session?.status === 'ACTIVE');
  const callStartedAtRef = useRef(payload?.session?.startedAt || payload?.session?.answeredAt || null);
  const joinAttemptCountRef = useRef(0);
  const currentAudioRouteRef = useRef(null);
  const callSyncTimeoutRef = useRef(null);
  const callSyncInFlightRef = useRef(false);
  const rtcConnectedRef = useRef(false);
  const remoteUserJoinedRef = useRef(false);
  const previousSessionIdRef = useRef(sessionId);
  const appStateRef = useRef(AppState.currentState || 'active');
  const localVideoBootstrapTimeoutRef = useRef(null);
  const localPreviewFailureTimeoutRef = useRef(null);
  const [isResolvingIncoming, setIsResolvingIncoming] = useState(false);
  const callTypeRef = useRef(resolvedCallType);

  const displayName = useMemo(() => host?.name || incomingRequest?.requester?.displayName || 'Support Host', [host?.name, incomingRequest?.requester?.displayName]);
  const avatar = useMemo(
    () =>
      resolveAvatarSource({
        avatarUrl: host?.avatar || null,
        profileImageUrl: host?.profileImageUrl || null,
        id: host?.userId || host?.listenerId || incomingRequest?.requester?.id || null,
        userId: host?.userId || host?.listenerId || incomingRequest?.requester?.id || null,
        name: host?.name || incomingRequest?.requester?.displayName || null,
        role: isListener ? 'USER' : 'LISTENER',
      }),
    [
      host?.avatar,
      host?.listenerId,
      host?.name,
      host?.profileImageUrl,
      host?.userId,
      incomingRequest?.requester?.displayName,
      incomingRequest?.requester?.id,
      isListener,
    ],
  );
  const callMode =
    incomingRequest && !runtimePayload ? 'incoming' : isCallConnected ? 'active' : 'outgoing';
  const showVideoSurfaces = isVideoCall && callMode !== 'incoming' && !isDemoSession;

  useEffect(() => {
    logCallDebug('rendererMounted', {
      sessionId,
      showVideoSurfaces,
      hasRtcSurfaceView: hasAgoraRtcSurfaceView,
      nativeLoadError: hasAgoraRtcSurfaceView ? null : agoraRtcUiLoadError?.message || null,
      hasLocalVideoFrame,
      isLocalPreviewBound,
      hasRemoteVideoFrame,
      remoteVideoUid,
      cameraEnabled: isCameraEnabled,
    });
  }, [
    hasLocalVideoFrame,
    isLocalPreviewBound,
    hasRemoteVideoFrame,
    isCameraEnabled,
    remoteVideoUid,
    sessionId,
    showVideoSurfaces,
  ]);

  const clearTimer = useCallback(
    ({ reset = false, reason = 'unknown' } = {}) => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
      intervalRef.current = null;
      if (reset) {
        setElapsedSeconds(0);
      }
      logCallDebug(reset ? 'timerReset' : 'timerStopped', {
        sessionId,
        reason,
        reset,
      });
    },
    [sessionId],
  );

  const startTimer = useCallback(
    (initialSeconds = 0, reason = 'unknown') => {
      clearTimer({
        reason: `${reason}_restart`,
      });
      setElapsedSeconds(initialSeconds);
      intervalRef.current = setInterval(() => setElapsedSeconds((prev) => prev + 1), 1000);
      logCallDebug('timerStarted', {
        sessionId,
        initialSeconds,
        reason,
      });
    },
    [clearTimer, sessionId],
  );

  const setCallConnectedState = useCallback(
    (connected, reason = 'unknown') => {
      const nextConnected = Boolean(connected);
      callConnectedRef.current = nextConnected;
      setIsCallConnected((prev) => {
        if (prev === nextConnected) {
          return prev;
        }

        logCallDebug('callConnectionStateChanged', {
          sessionId,
          previous: prev,
          next: nextConnected,
          reason,
        });

        return nextConnected;
      });
    },
    [sessionId],
  );

  useEffect(() => {
    runtimePayloadRef.current = runtimePayload;
    if (runtimePayload?.agora) {
      latestAgoraRef.current = runtimePayload.agora;
    }
    if (runtimePayload?.session?.status === 'ACTIVE') {
      backendMarkedActiveRef.current = true;
    }
    if (runtimePayload?.session?.startedAt || runtimePayload?.session?.answeredAt) {
      callStartedAtRef.current =
        runtimePayload?.session?.startedAt || runtimePayload?.session?.answeredAt;
    }
  }, [runtimePayload]);

  useEffect(() => {
    callTypeRef.current = resolvedCallType;
    if (!isVideoCall) {
      setIsCameraEnabled(false);
      setHasLocalVideoFrame(false);
      setIsLocalPreviewBound(false);
      setHasRemoteVideoFrame(false);
      setRemoteVideoUid(null);
      return;
    }

    setIsCameraEnabled((prev) => (prev === false ? true : prev));
  }, [isVideoCall, resolvedCallType]);

  useEffect(() => {
    const previousSessionId = previousSessionIdRef.current;
    const didSwitchSession =
      Boolean(previousSessionId) &&
      Boolean(sessionId) &&
      String(previousSessionId) !== String(sessionId);
    previousSessionIdRef.current = sessionId;

    if (didSwitchSession && !isDemoSession) {
      logCallDebug('sessionChangedCleanupStart', {
        previousSessionId,
        sessionId,
      });
      destroyAgoraVoiceEngine();
    }

    sessionEndedRef.current = false;
    callSyncInFlightRef.current = false;
    hasJoinedAgoraRef.current = false;
    joiningAgoraRef.current = false;
    callConnectedRef.current = false;
    backendMarkedActiveRef.current = runtimePayloadRef.current?.session?.status === 'ACTIVE';
    callStartedAtRef.current =
      runtimePayloadRef.current?.session?.startedAt ||
      runtimePayloadRef.current?.session?.answeredAt ||
      null;
    joinAttemptCountRef.current = 0;
    currentAudioRouteRef.current = null;
    rtcConnectedRef.current = false;
    remoteUserJoinedRef.current = false;
    setCallConnectedState(false, 'session_changed_reset');
    setElapsedSeconds(0);
    setIsLocalPreviewBound(false);
    if (callSyncTimeoutRef.current) {
      clearTimeout(callSyncTimeoutRef.current);
      callSyncTimeoutRef.current = null;
    }
    if (localPreviewFailureTimeoutRef.current) {
      clearTimeout(localPreviewFailureTimeoutRef.current);
      localPreviewFailureTimeoutRef.current = null;
    }
    logCallDebug('callSessionStateInitialized', {
      sessionId,
      didSwitchSession,
      previousSessionId,
    });
  }, [isDemoSession, sessionId, setCallConnectedState]);

  useEffect(() => {
    if (incomingRequest && !runtimePayload) {
      setStatusText(isVideoCall ? 'Incoming video call' : 'Incoming Call');
    }
  }, [incomingRequest, isVideoCall, runtimePayload]);

  const buildActiveCallRouteParams = useCallback(() => {
    if (!sessionId) {
      return null;
    }

    if (runtimePayload) {
      return {
        callPayload: runtimePayload,
        host,
      };
    }

    if (incomingRequest) {
      return {
        incomingRequest,
        host,
      };
    }

    return null;
  }, [host, incomingRequest, runtimePayload, sessionId]);

  useEffect(() => {
    const params = buildActiveCallRouteParams();

    if (!params) {
      return;
    }

    setActiveCallFromParams(params, 'call_screen_state_sync');
  }, [buildActiveCallRouteParams, setActiveCallFromParams]);

  const activateConnectedState = useCallback((startedAt) => {
    if (callSyncTimeoutRef.current) {
      clearTimeout(callSyncTimeoutRef.current);
      callSyncTimeoutRef.current = null;
    }
    const resolvedStartedAt = startedAt || callStartedAtRef.current;
    setCallConnectedState(true, 'activate_connected_state');
    setStatusText('Connected');
    logCallDebug('callConnected', {
      sessionId,
      startedAt: resolvedStartedAt || null,
      backendMarkedActive: backendMarkedActiveRef.current,
      rtcConnected: rtcConnectedRef.current,
      remoteUserJoined: remoteUserJoinedRef.current,
    });
    startTimer(
      resolvedStartedAt
        ? Math.max(0, Math.floor((Date.now() - new Date(resolvedStartedAt).getTime()) / 1000))
        : 0,
      'call_connected',
    );
  }, [sessionId, setCallConnectedState, startTimer]);

  const requestLocalVideoBootstrap = useCallback((reason = 'unknown', callType = callTypeRef.current) => {
    if (isDemoSession || normalizeCallType(callType) !== 'video') {
      return;
    }

    const runEnable = (source) => {
      logCallDebug('videoTrackEnableRequested', {
        sessionId,
        source,
        reason,
        hasJoined: hasJoinedAgoraRef.current,
        cameraEnabled: isCameraEnabled,
      });
      setLocalVideoEnabled(true, {
        reason: `${reason}_${source}`,
      });
      setIsLocalPreviewBound(true);
      logCallDebug('localPreviewBound', {
        sessionId,
        source: `${reason}_${source}`,
      });
      logCallDebug('localVideoTrackEnabled', {
        sessionId,
        source: `${reason}_${source}`,
        enabled: true,
      });
    };

    requestAnimationFrame(() => {
      runEnable('animation_frame');
    });

    if (localVideoBootstrapTimeoutRef.current) {
      clearTimeout(localVideoBootstrapTimeoutRef.current);
    }
    localVideoBootstrapTimeoutRef.current = setTimeout(() => {
      runEnable('timeout_fallback');
      localVideoBootstrapTimeoutRef.current = null;
    }, 250);
  }, [isCameraEnabled, isDemoSession, sessionId]);

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
    backendMarkedActiveRef.current = false;
    rtcConnectedRef.current = false;
    remoteUserJoinedRef.current = false;
    setCallConnectedState(false, `cleanup_${reason}`);
    if (localVideoBootstrapTimeoutRef.current) {
      clearTimeout(localVideoBootstrapTimeoutRef.current);
      localVideoBootstrapTimeoutRef.current = null;
    }
    if (localPreviewFailureTimeoutRef.current) {
      clearTimeout(localPreviewFailureTimeoutRef.current);
      localPreviewFailureTimeoutRef.current = null;
    }
    setHasLocalVideoFrame(false);
    setIsLocalPreviewBound(false);
    setHasRemoteVideoFrame(false);
    setRemoteVideoUid(null);
    setIsCameraEnabled(isVideoCall);
  }, [isDemoSession, isVideoCall, sessionId, setCallConnectedState]);

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
      setCallConnectedState(true, 'demo_join');
      setStatusText('Connected');
      const startedAt = runtimePayloadRef.current?.session?.startedAt || runtimePayloadRef.current?.session?.answeredAt || new Date();
      startTimer(
        Math.max(0, Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000)),
        'demo_join',
      );
      return;
    }

    if (!isAgoraRtcNativeModuleAvailable()) {
      logCallDebug('agoraNativeUnavailable', {
        sessionId,
        source: 'joinAgoraIfNeeded_guard',
      });
      throw new Error(
        'Agora RTC native module is unavailable. Install release APK with native Agora linking enabled.',
      );
    }

    joiningAgoraRef.current = true;
    joinAttemptCountRef.current += 1;
    const activePayload = runtimePayloadRef.current;
    const activeCallType = normalizeCallType(
      activePayload?.session?.callType ||
        activePayload?.realtime?.callType ||
        callTypeRef.current,
    );

    try {
      rtcConnectedRef.current = false;
      remoteUserJoinedRef.current = false;
      setHasRemoteVideoFrame(false);
      setRemoteVideoUid(null);
      if (activeCallType === 'video') {
        setHasLocalVideoFrame(false);
        setIsCameraEnabled(true);
        logCallDebug('rendererPrimedForLocalVideo', {
          sessionId,
          callType: activeCallType,
          hasJoined: hasJoinedAgoraRef.current,
        });
      }

      logCallDebug('localMediaInitStart', {
        sessionId,
        callType: activeCallType,
        source: 'joinAgoraIfNeeded',
      });
      if (activeCallType === 'video') {
        logCallDebug('localCameraInitStarted', {
          sessionId,
          source: 'joinAgoraIfNeeded',
        });
      }
      const permissionResult =
        activeCallType === 'video'
          ? await requestVideoCallPermissions()
          : await requestCallAudioPermissions();
      logCallDebug(
        activeCallType === 'video'
          ? 'cameraPermissionStatus'
          : 'microphonePermissionResult',
        {
        sessionId,
        callType: activeCallType,
        granted: permissionResult?.granted === true,
        permissions: permissionResult?.permissions || null,
        },
      );

      if (!permissionResult?.granted) {
        logCallDebug('localMediaInitFailure', {
          sessionId,
          callType: activeCallType,
          source: 'joinAgoraIfNeeded_permission_denied',
        });
        throw new Error(
          activeCallType === 'video'
            ? 'Camera and microphone permission is required to join this video call.'
            : 'Microphone permission is required to join the call.',
        );
      }
      logCallDebug('localMediaInitSuccess', {
        sessionId,
        callType: activeCallType,
        source: 'joinAgoraIfNeeded_permissions_granted',
      });

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
        callType: activeCallType,
      });
      await joinAgoraVoiceChannel({
        appId: latestAgoraRef.current.appId,
        token: latestAgoraRef.current.token,
        channelName: resolvedChannelName,
        uid: latestAgoraRef.current.uid,
        sessionId,
        callType: activeCallType,
        onJoinSuccess: () => {
          logCallDebug('joinSuccess', {
            sessionId,
            channelName: resolvedChannelName,
            attemptCount: joinAttemptCountRef.current,
            callType: activeCallType,
          });
          if (activeCallType === 'video') {
            setIsCameraEnabled(true);
            setIsLocalPreviewBound(true);
            logCallDebug('localPreviewBound', {
              sessionId,
              source: 'join_success',
            });
            requestLocalVideoBootstrap('join_success_auto_enable', activeCallType);
            logCallDebug('videoEnabled', {
              sessionId,
              callType: activeCallType,
              enabled: true,
              source: 'join_success',
            });
            logCallDebug('localVideoTrackEnabled', {
              sessionId,
              source: 'join_success',
              enabled: true,
            });
          } else {
            setIsCameraEnabled(false);
          }
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
          remoteUserJoinedRef.current = true;
          if (activeCallType === 'video' && Number.isFinite(Number(remoteUid))) {
            setRemoteVideoUid(Number(remoteUid));
          }
          logCallDebug('remoteUserJoined', {
            sessionId,
            remoteUid,
            backendMarkedActive: backendMarkedActiveRef.current,
          });
          if (!backendMarkedActiveRef.current && !callConnectedRef.current) {
            setStatusText(activeCallType === 'video' ? 'Connecting video...' : 'Connecting...');
          }
        },
        onUserOffline: (remoteUid) => {
          setRemoteVideoUid(null);
          setHasRemoteVideoFrame(false);
          logCallDebug('remoteUserOffline', {
            sessionId,
            remoteUid,
          });
          setStatusText('Call ended');
        },
        onConnectionStateChanged: ({ state, reason }) => {
          const numericState = Number(state);
          const normalizedState = String(state || '').trim().toLowerCase();
          const rtcConnected =
            numericState === 3 ||
            normalizedState === 'connected' ||
            normalizedState === 'connectionstateconnected';
          rtcConnectedRef.current = rtcConnected;
          logCallDebug('agoraConnectionStateChanged', {
            sessionId,
            state,
            reason,
            rtcConnected,
            backendMarkedActive: backendMarkedActiveRef.current,
          });
          if (rtcConnected && !backendMarkedActiveRef.current && !callConnectedRef.current) {
            setStatusText(activeCallType === 'video' ? 'Connecting video...' : 'Connecting...');
          }
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
        onFirstLocalVideoFrame: ({ width, height, elapsed }) => {
          if (activeCallType !== 'video') {
            return;
          }

          setHasLocalVideoFrame(true);
          setIsLocalPreviewBound(true);
          logCallDebug('localStreamSet', {
            sessionId,
            callType: activeCallType,
            hasLocalVideoFrame: true,
          });
          logCallDebug('localPreviewRenderSuccess', {
            sessionId,
            source: 'onFirstLocalVideoFrame',
            width,
            height,
            elapsed,
          });
          logCallDebug('localPreviewStarted', {
            sessionId,
            width,
            height,
            elapsed,
          });
        },
        onFirstRemoteVideoFrame: ({ remoteUid, width, height, elapsed }) => {
          if (activeCallType !== 'video') {
            return;
          }

          if (Number.isFinite(Number(remoteUid))) {
            setRemoteVideoUid(Number(remoteUid));
          }
          setHasRemoteVideoFrame(true);
          logCallDebug('remoteVideoReceived', {
            sessionId,
            remoteUid,
            width,
            height,
            elapsed,
          });
        },
        onRemoteVideoStateChanged: ({ remoteUid, state, reason, elapsed }) => {
          if (activeCallType !== 'video') {
            return;
          }

          const normalizedState = Number(state);
          const remoteVideoActive = [1, 2].includes(normalizedState);
          if (Number.isFinite(Number(remoteUid))) {
            setRemoteVideoUid(Number(remoteUid));
          }
          setHasRemoteVideoFrame(remoteVideoActive);
          logCallDebug('remoteVideoStateChanged', {
            sessionId,
            remoteUid,
            state: normalizedState,
            reason,
            elapsed,
            remoteVideoActive,
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
      if (backendMarkedActiveRef.current) {
        activateConnectedState(callStartedAtRef.current);
      } else {
        setStatusText(activeCallType === 'video' ? 'Connecting video...' : 'Connecting...');
      }
    } catch (error) {
      hasJoinedAgoraRef.current = false;
      logCallDebug('localMediaInitFailure', {
        sessionId,
        callType: activeCallType,
        source: 'joinAgoraIfNeeded_failure',
        message: error?.message || 'Unknown error',
      });
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
  }, [
    activateConnectedState,
    cleanupAgoraSession,
    isDemoSession,
    isAgoraRtcNativeModuleAvailable,
    requestLocalVideoBootstrap,
    sessionId,
    setCallConnectedState,
    startTimer,
  ]);

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

    setCallConnectedState(false, 'session_ended_event');
    clearTimer({
      reset: true,
      reason: 'session_ended_event',
    });
    cleanupAgoraSession('session_ended').catch(() => {});
    clearActiveCall('session_ended_event', sessionId);
    setStatusText('Call ended');
    if (eventPayload?.reasonCode === 'LOW_BALANCE') {
      Alert.alert('Insufficient Balance', 'You do not have sufficient balance. Please recharge your wallet to continue.', [{ text: 'OK', onPress: () => navigation.goBack() }]);
    } else {
      navigation.goBack();
    }
  }, [
    cleanupAgoraSession,
    clearActiveCall,
    clearTimer,
    navigation,
    sessionId,
    setCallConnectedState,
    stopIncomingCallRingtone,
  ]);

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

      if (callActive && backendMarkedActiveRef.current && callStartedAtRef.current) {
        activateConnectedState(callStartedAtRef.current);
      }

      if (
        (callConnectedRef.current || backendMarkedActiveRef.current) &&
        !hasJoinedAgoraRef.current &&
        !joiningAgoraRef.current
      ) {
        logCallDebug('restoreMediaJoinStart', {
          sessionId,
          source: 'app_resume',
          callType: callTypeRef.current,
        });
        joinAgoraIfNeeded().catch((error) => {
          logCallDebug('restoreMediaJoinFailure', {
            sessionId,
            source: 'app_resume',
            message: error?.message || 'Unknown error',
          });
        });
      }

      if (
        isVideoCall &&
        hasJoinedAgoraRef.current &&
        isCameraEnabled &&
        !hasLocalVideoFrame
      ) {
        requestLocalVideoBootstrap('app_resume_reassert', callTypeRef.current);
      }
    });

    return () => {
      subscription.remove();
    };
  }, [
    activateConnectedState,
    hasLocalVideoFrame,
    isCameraEnabled,
    isDemoSession,
    isVideoCall,
    joinAgoraIfNeeded,
    requestLocalVideoBootstrap,
    sessionId,
  ]);

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
        const rejectedReasonCode =
          realtime?.rejectedReasonCode || (normalizedStatus === 'REJECTED' ? 'CALL_REJECTED' : '');
        const isRejectedCall = normalizedStatus === 'REJECTED' || rejectedReasonCode === 'CALL_REJECTED';
        const reasonMessage = getCallStatusMessageByCode(
          rejectedReasonCode,
          isRejectedCall ? 'Call rejected' : 'This call is no longer active.',
        );
        sessionEndedRef.current = true;
        setCallConnectedState(false, 'call_sync_terminal_state');
        clearTimer({
          reset: true,
          reason: 'call_sync_terminal_state',
        });
        await cleanupAgoraSession().catch(() => {});
        clearActiveCall('call_sync_terminal_state', sessionId);
        setStatusText(isRejectedCall ? 'Call rejected' : 'Call ended');
        Alert.alert(
          isRejectedCall ? 'Call rejected' : 'Call ended',
          reasonMessage,
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
        backendMarkedActiveRef.current = true;
        if (!hasJoinedAgoraRef.current && !joiningAgoraRef.current) {
          await joinAgoraIfNeeded();
        }
        const hasBothJoinedMedia =
          Boolean(realtime?.hasUserJoinedMedia) &&
          Boolean(realtime?.hasListenerJoinedMedia);
        if (hasJoinedAgoraRef.current && hasBothJoinedMedia) {
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
    callMode,
    cleanupAgoraSession,
    clearActiveCall,
    clearTimer,
    incomingRequest,
    isDemoSession,
    isListener,
    joinAgoraIfNeeded,
    navigation,
    sessionId,
    setCallConnectedState,
    syncRuntimePayloadFromSession,
  ]);

  useEffect(() => {
    logCallDebug('callScreenInit', {
      sessionId,
      isListener,
      callType: callTypeRef.current,
      hasAgoraRtcUiModule: Boolean(agoraRtcUiModule),
      hasRtcSurfaceView: hasAgoraRtcSurfaceView,
      agoraRtcUiLoadError: agoraRtcUiLoadError?.message || null,
      hasAgoraRtcNativeModule: isAgoraRtcNativeModuleAvailable(),
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
          setCallConnectedState(true, 'demo_connect_timeout');
          setStatusText('Connected');
          startTimer(
            payload?.session?.startedAt
              ? Math.max(0, Math.floor((Date.now() - new Date(payload.session.startedAt).getTime()) / 1000))
              : 0,
            'demo_connect_timeout',
          );
        }, 900);
      }

      return () => {
        if (demoConnectTimeoutRef.current) clearTimeout(demoConnectTimeoutRef.current);
        clearTimer({ reason: 'demo_screen_cleanup' });
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
      const acceptedCallType = normalizeCallType(eventPayload?.callType || callTypeRef.current);
      callTypeRef.current = acceptedCallType;
      if (acceptedCallType === 'video') {
        setIsCameraEnabled(true);
        setHasLocalVideoFrame(false);
        setIsLocalPreviewBound(true);
        logCallDebug('localPreviewBound', {
          sessionId,
          source: 'call_accepted_event',
        });
      }
      if (eventPayload?.callType) {
        setRuntimePayload((prev) =>
          prev
            ? {
                ...prev,
                session: {
                  ...prev.session,
                  callType: eventPayload.callType,
                },
              }
            : prev,
        );
      }
      logCallDebug('callAccepted', {
        sessionId: eventPayload?.sessionId || null,
        role: isListener ? 'listener' : 'caller',
        callType: eventPayload?.callType || callTypeRef.current,
      });
      setStatusText(
        acceptedCallType === 'video'
          ? 'Connecting video...'
          : 'Connecting...',
      );
      try { await joinAgoraIfNeeded(); } catch (error) { if (!isUnauthorizedApiError(error)) Alert.alert('Call connection failed', error?.message || 'Unable to connect call.'); }
    };
    const onCallStarted = async (eventPayload) => {
      if (eventPayload?.sessionId !== sessionId) return;
      backendMarkedActiveRef.current = true;
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
                callType:
                  eventPayload?.callType ||
                  prev.session?.callType ||
                  callTypeRef.current,
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
      const reasonCode = String(eventPayload?.reasonCode || 'CALL_REJECTED')
        .trim()
        .toUpperCase();
      const reasonMessage = getCallStatusMessageByCode(
        reasonCode,
        eventPayload?.reason || 'Call rejected',
      );
      logCallDebug('callRejected', {
        sessionId: eventPayload?.sessionId || null,
        reasonCode,
        reason: reasonMessage,
      });
      stopIncomingCallRingtone('call_rejected');
      setCallConnectedState(false, 'call_rejected_event');
      clearTimer({
        reset: true,
        reason: 'call_rejected_event',
      });
      cleanupAgoraSession('call_rejected').catch(() => {});
      clearActiveCall('call_rejected_event', sessionId);
      setStatusText('Call rejected');
      Alert.alert('Call rejected', reasonMessage, [
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
    socket.on('call_missed', handleSessionEnded);
    socket.emit('join_call_session', { sessionId });
    if (runtimePayloadRef.current?.session?.status === 'ACTIVE') {
      onCallStarted({
        sessionId,
        startedAt: runtimePayloadRef.current?.session?.startedAt,
        answeredAt: runtimePayloadRef.current?.session?.answeredAt,
      });
    }

    return () => {
      logCallDebug('callScreenUnmount', {
        sessionId,
        callMode,
        appState: appStateRef.current,
      });
      socket.off('call_accepted', onCallAccepted);
      socket.off('call_started', onCallStarted);
      socket.off('call_rejected', onCallRejected);
      socket.off('call_low_balance_warning', onLowBalance);
      socket.off('call_end_due_to_low_balance', handleSessionEnded);
      socket.off('call_ended', handleSessionEnded);
      socket.off('call_missed', handleSessionEnded);
      clearTimer({
        reason: 'screen_effect_cleanup',
      });
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
  }, [
    activateConnectedState,
    authSession?.accessToken,
    callMode,
    cleanupAgoraSession,
    clearActiveCall,
    clearTimer,
    handleSessionEnded,
    incomingRequest,
    isDemoSession,
    isListener,
    joinAgoraIfNeeded,
    navigation,
    sessionId,
    setCallConnectedState,
    startTimer,
    stopIncomingCallRingtone,
  ]);

  useEffect(() => {
    if (!isVideoCall || isDemoSession) {
      return;
    }

    logCallDebug('rendererMountState', {
      sessionId,
      showVideoSurfaces,
      hasJoined: hasJoinedAgoraRef.current,
      joining: joiningAgoraRef.current,
      cameraEnabled: isCameraEnabled,
      hasLocalVideoFrame,
      localPreviewBound: isLocalPreviewBound,
      localStreamState: hasLocalVideoFrame ? 'present' : 'absent',
    });

    if (
      !showVideoSurfaces ||
      !isCameraEnabled ||
      hasLocalVideoFrame ||
      !hasJoinedAgoraRef.current ||
      joiningAgoraRef.current
    ) {
      return;
    }

    requestLocalVideoBootstrap('renderer_mount_reassert', callTypeRef.current);
  }, [
    hasLocalVideoFrame,
    isCameraEnabled,
    isDemoSession,
    isLocalPreviewBound,
    isVideoCall,
    requestLocalVideoBootstrap,
    sessionId,
    showVideoSurfaces,
  ]);

  useEffect(() => {
    if (localPreviewFailureTimeoutRef.current) {
      clearTimeout(localPreviewFailureTimeoutRef.current);
      localPreviewFailureTimeoutRef.current = null;
    }

    if (
      !isVideoCall ||
      isDemoSession ||
      !isCameraEnabled ||
      !showVideoSurfaces ||
      !hasJoinedAgoraRef.current ||
      hasLocalVideoFrame
    ) {
      return undefined;
    }

    localPreviewFailureTimeoutRef.current = setTimeout(() => {
      if (
        sessionEndedRef.current ||
        !isCameraEnabled ||
        hasLocalVideoFrame ||
        !hasJoinedAgoraRef.current
      ) {
        return;
      }

      logCallDebug('localPreviewRenderFailure', {
        sessionId,
        reason: 'first_local_frame_timeout',
        cameraEnabled: isCameraEnabled,
        localPreviewBound: isLocalPreviewBound,
      });
    }, 3500);

    return () => {
      if (localPreviewFailureTimeoutRef.current) {
        clearTimeout(localPreviewFailureTimeoutRef.current);
        localPreviewFailureTimeoutRef.current = null;
      }
    };
  }, [
    hasLocalVideoFrame,
    isCameraEnabled,
    isDemoSession,
    isLocalPreviewBound,
    isVideoCall,
    sessionId,
    showVideoSurfaces,
  ]);

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
      backendMarkedActiveRef.current = true;
      callStartedAtRef.current =
        runtimePayload?.session?.startedAt || runtimePayload?.session?.answeredAt || callStartedAtRef.current;

      if (hasJoinedAgoraRef.current && backendMarkedActiveRef.current) {
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

  const onToggleCamera = () => {
    if (!isVideoCall) {
      return;
    }

    const next = !isCameraEnabled;
    logCallDebug('cameraButtonPressed', {
      sessionId,
      nextEnabled: next,
      hasJoined: hasJoinedAgoraRef.current,
    });
    setIsCameraEnabled(next);
    if (!next) {
      setHasLocalVideoFrame(false);
      setIsLocalPreviewBound(false);
    } else {
      setIsLocalPreviewBound(true);
      logCallDebug('localPreviewBound', {
        sessionId,
        source: 'camera_toggle_on',
      });
    }

    if (!isDemoSession) {
      setLocalVideoEnabled(next, {
        reason: 'toggle_from_call_screen',
      });
      logCallDebug('localVideoTrackEnabled', {
        sessionId,
        source: 'camera_toggle_button',
        enabled: next,
      });
    }
  };

  const onSwitchCamera = () => {
    if (!isVideoCall || !isCameraEnabled || isDemoSession) {
      return;
    }

    logCallDebug('switchCameraPressed', {
      sessionId,
    });
    switchLocalCamera();
  };

  const minimizeCallScreen = useCallback(() => {
    const persistedParams = buildActiveCallRouteParams();
    if (persistedParams) {
      setActiveCallFromParams(persistedParams, 'call_screen_minimize');
      logCallDebug('activeCallStateSaved', {
        sessionId,
        source: 'call_screen_minimize',
        callType: callTypeRef.current,
      });
    }

    logCallDebug('callScreenMinimized', {
      sessionId,
      callMode,
      isCallConnected,
      hasJoined: hasJoinedAgoraRef.current,
      joining: joiningAgoraRef.current,
    });

    if (navigation.canGoBack()) {
      navigation.goBack();
      return true;
    }

    if (isListener) {
      navigation.navigate('ListenerHome');
      return true;
    }

    navigation.navigate('MainDrawer');
    return true;
  }, [
    buildActiveCallRouteParams,
    callMode,
    isCallConnected,
    isListener,
    navigation,
    sessionId,
    setActiveCallFromParams,
  ]);

  useEffect(() => {
    const onHardwareBackPress = () => {
      logCallDebug('hardwareBackPressed', {
        sessionId,
        action: 'minimize_call_screen',
      });
      return minimizeCallScreen();
    };

    const backSubscription = BackHandler.addEventListener(
      'hardwareBackPress',
      onHardwareBackPress,
    );

    return () => {
      backSubscription.remove();
    };
  }, [minimizeCallScreen, sessionId]);

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
      clearActiveCall('incoming_rejected_demo', sessionId);
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
      clearActiveCall('incoming_rejected', sessionId);
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
      const demoCallType = normalizeCallType(callTypeRef.current);
      setRuntimePayload({
        session: {
          id: sessionId || `demo-call-${Date.now()}`,
          status: 'ACTIVE',
          startedAt: new Date().toISOString(),
          listenerId: incomingRequest?.requester?.id || host?.listenerId || null,
          callType: demoCallType,
        },
        agora: null,
        demoMode: true,
      });
      setStatusText(demoCallType === 'video' ? 'Connecting video...' : 'Connecting...');
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
        callType: callTypeRef.current,
      });

      const activeCallType = normalizeCallType(callTypeRef.current);
      callTypeRef.current = activeCallType;
      if (activeCallType === 'video') {
        setIsCameraEnabled(true);
        setHasLocalVideoFrame(false);
      }
      logCallDebug('localMediaInitStart', {
        sessionId,
        callType: activeCallType,
        source: 'acceptIncoming',
      });
      if (activeCallType === 'video') {
        logCallDebug('localCameraInitStarted', {
          sessionId,
          source: 'acceptIncoming',
        });
      }
      const permissionResult =
        activeCallType === 'video'
          ? await requestVideoCallPermissions()
          : await requestCallAudioPermissions();
      logCallDebug(
        activeCallType === 'video'
          ? 'cameraPermissionStatus'
          : 'microphonePermissionResult',
        {
        sessionId,
        callType: activeCallType,
        granted: permissionResult?.granted === true,
        permissions: permissionResult?.permissions || null,
        source: 'acceptIncoming',
        },
      );

      if (!permissionResult?.granted) {
        logCallDebug('localMediaInitFailure', {
          sessionId,
          callType: activeCallType,
          source: 'acceptIncoming_permission_denied',
        });
        startIncomingRingtone({
          sessionId,
          source: 'accept_permission_denied_resume',
        }).catch(() => {});
        Alert.alert(
          activeCallType === 'video'
            ? 'Camera and microphone permission needed'
            : 'Microphone permission needed',
          activeCallType === 'video'
            ? 'Enable camera and microphone permission to accept this video call.'
            : 'Enable microphone permission to accept this call.',
        );
        return;
      }
      logCallDebug('localMediaInitSuccess', {
        sessionId,
        callType: activeCallType,
        source: 'acceptIncoming_permissions_granted',
      });

      let socket = getRealtimeSocket();
      if (!socket) {
        socket = connectRealtimeSocket(authSession?.accessToken);
      }

      logCallDebug('callAcceptEmitStart', {
        sessionId,
        socketConnected: Boolean(socket?.connected),
        callType: activeCallType,
      });

      const nextPayload = await emitWithAck('call_accepted', { sessionId });
      logCallDebug('callAcceptEmitSuccess', {
        sessionId: nextPayload?.session?.id || sessionId || null,
        callType:
          nextPayload?.session?.callType ||
          nextPayload?.realtime?.callType ||
          callTypeRef.current,
      });
      latestAgoraRef.current = nextPayload?.agora || null;
      runtimePayloadRef.current = nextPayload;
      setRuntimePayload(nextPayload);
      const nextCallType = normalizeCallType(
        nextPayload?.session?.callType ||
          nextPayload?.realtime?.callType ||
          activeCallType,
      );
      callTypeRef.current = nextCallType;
      setIsCameraEnabled(nextCallType === 'video');
      if (nextCallType === 'video') {
        setHasLocalVideoFrame(false);
        setIsLocalPreviewBound(true);
        logCallDebug('localPreviewBound', {
          sessionId: nextPayload?.session?.id || sessionId || null,
          source: 'accept_payload_video',
        });
      }
      setStatusText(
        nextCallType === 'video'
          ? 'Connecting video...'
          : 'Connecting...',
      );
      logCallDebug('callAcceptSuccess', {
        sessionId: nextPayload?.session?.id || sessionId || null,
      });
      await joinAgoraIfNeeded();
    } catch (error) {
      startIncomingRingtone({
        sessionId,
        source: 'accept_failure_resume',
      }).catch(() => {});
      logCallDebug('callAcceptFailure', {
        sessionId,
        message: error?.response?.data?.message || error?.message || 'Unknown error',
      });
      if (!isUnauthorizedApiError(error)) Alert.alert('Unable to accept call', error?.response?.data?.message || error?.message || 'Unable to accept this call right now.');
      clearActiveCall('accept_failure', sessionId);
      navigation.goBack();
    } finally {
      resolvingIncomingRef.current = false;
      setIsResolvingIncoming(false);
    }
  };

  const onEndCall = async () => {
    if (isDemoSession) {
      setCallConnectedState(false, 'manual_end_demo');
      clearTimer({
        reset: true,
        reason: 'manual_end_demo',
      });
      await endDemoCallSession(sessionId, isListener ? 'LISTENER_ENDED' : 'USER_ENDED');
      clearActiveCall('manual_end_demo', sessionId);
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
      setCallConnectedState(false, 'manual_end_call');
      clearTimer({
        reset: true,
        reason: 'manual_end_call',
      });
      await cleanupAgoraSession('manual_end_call').catch(() => {});
      clearActiveCall('manual_end_call', sessionId);
      navigation.goBack();
    }
  };

  const callHeaderSecondaryText = isCallConnected ? fmt(elapsedSeconds) : statusText;

  return (
    <LinearGradient colors={['#08040F', '#110713', '#1A0A22']} style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <TouchableOpacity style={styles.backBtn} onPress={minimizeCallScreen} activeOpacity={0.85}>
          <Ionicons name="chevron-back" size={22} color={theme.colors.textPrimary} />
        </TouchableOpacity>
        <View pointerEvents="none" style={styles.topCallHeader}>
          <Text style={styles.topCallHeaderName} numberOfLines={1}>
            {displayName}
          </Text>
          <Text style={styles.topCallHeaderMeta} numberOfLines={1}>
            {callHeaderSecondaryText}
          </Text>
          {lowBalanceWarning ? (
            <View style={styles.topWarning}>
              <Ionicons name="alert-circle" size={15} color={theme.colors.warning} />
              <Text style={styles.topWarningText} numberOfLines={2}>
                {lowBalanceWarning}
              </Text>
            </View>
          ) : null}
        </View>

        <View style={styles.center}>
          {showVideoSurfaces ? (
            <View style={styles.videoSurfaceLayer}>
              {hasAgoraRtcSurfaceView &&
              hasRemoteVideoFrame &&
              Number.isFinite(Number(remoteVideoUid)) ? (
                <RtcSurfaceView
                  style={styles.remoteVideoSurface}
                  canvas={{
                    uid: Number(remoteVideoUid),
                    renderMode: RenderModeType.RenderModeHidden,
                  }}
                />
              ) : (
                <View style={styles.videoFallback}>
                  <Image source={avatar} style={styles.videoFallbackAvatar} />
                  <Text style={styles.videoFallbackText}>
                    {hasAgoraRtcSurfaceView
                      ? 'Waiting for remote video...'
                      : 'Video renderer unavailable'}
                  </Text>
                </View>
              )}
              {isCameraEnabled ? (
                <View style={styles.localPreviewContainer}>
                  {hasAgoraRtcSurfaceView ? (
                    <RtcSurfaceView
                      style={styles.localPreviewSurface}
                      zOrderMediaOverlay
                      canvas={{
                        uid: 0,
                        renderMode: RenderModeType.RenderModeHidden,
                        sourceType: VideoSourceType.VideoSourceCameraPrimary,
                      }}
                    />
                  ) : (
                    <View style={styles.localPreviewOverlay}>
                      <Ionicons name="videocam-off" size={20} color={theme.colors.textPrimary} />
                    </View>
                  )}
                </View>
              ) : (
                <View style={styles.localPreviewPlaceholder}>
                  <Ionicons name="videocam-off" size={20} color={theme.colors.textPrimary} />
                </View>
              )}
            </View>
          ) : (
            <>
              <View style={styles.glowRing} />
              <View style={styles.avatarRing}>
                <Image source={avatar} style={styles.avatar} />
              </View>
            </>
          )}
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
            {isVideoCall ? (
              <TouchableOpacity
                style={[styles.controlBtn, isCameraEnabled ? styles.controlBtnActive : null]}
                onPress={onToggleCamera}
                activeOpacity={0.88}
              >
                <Ionicons
                  name={isCameraEnabled ? 'videocam' : 'videocam-off'}
                  size={22}
                  color={isCameraEnabled ? activeControlIconColor : theme.colors.textPrimary}
                />
              </TouchableOpacity>
            ) : null}
            {isVideoCall ? (
              <TouchableOpacity
                style={styles.controlBtn}
                onPress={onSwitchCamera}
                activeOpacity={0.88}
                disabled={!isCameraEnabled}
              >
                <Ionicons
                  name="camera-reverse"
                  size={22}
                  color={isCameraEnabled ? theme.colors.textPrimary : 'rgba(255,255,255,0.35)'}
                />
              </TouchableOpacity>
            ) : null}
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
  container: { flex: 1 },
  safeArea: { flex: 1, paddingHorizontal: 18, paddingBottom: 28 },
  backBtn: {
    marginTop: 8,
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 1,
    borderColor: theme.colors.borderSoft,
    backgroundColor: 'rgba(255,255,255,0.05)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 12,
  },
  topCallHeader: {
    position: 'absolute',
    top: 12,
    left: 70,
    right: 70,
    alignItems: 'center',
    zIndex: 11,
  },
  topCallHeaderName: {
    color: theme.colors.textPrimary,
    fontSize: 21,
    fontWeight: '700',
    textAlign: 'center',
  },
  topCallHeaderMeta: {
    marginTop: 4,
    color: theme.colors.textSecondary,
    fontSize: 15,
    fontWeight: '500',
    textAlign: 'center',
  },
  topWarning: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,184,0,0.38)',
    backgroundColor: 'rgba(255,184,0,0.12)',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  topWarningText: {
    color: theme.colors.warning,
    fontSize: 12,
    flexShrink: 1,
    textAlign: 'center',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  videoSurfaceLayer: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 26,
    overflow: 'hidden',
  },
  remoteVideoSurface: {
    ...StyleSheet.absoluteFillObject,
  },
  videoFallback: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(5,7,18,0.86)',
  },
  videoFallbackAvatar: {
    width: 144,
    height: 144,
    borderRadius: 72,
    borderWidth: 2,
    borderColor: 'rgba(255,42,163,0.65)',
  },
  videoFallbackText: {
    marginTop: 12,
    color: 'rgba(255,255,255,0.76)',
    fontSize: 13,
    fontWeight: '600',
  },
  localPreviewContainer: {
    position: 'absolute',
    top: 14,
    right: 14,
    width: 112,
    height: 152,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.45)',
    backgroundColor: '#000000',
  },
  localPreviewSurface: {
    width: '100%',
    height: '100%',
  },
  localPreviewOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.42)',
  },
  localPreviewPlaceholder: {
    position: 'absolute',
    top: 14,
    right: 14,
    width: 112,
    height: 152,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.56)',
  },
  glowRing: {
    position: 'absolute',
    width: 190,
    height: 190,
    borderRadius: 95,
    backgroundColor: 'rgba(255,42,163,0.12)',
    shadowColor: theme.colors.magenta,
    shadowOpacity: 0.35,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 0 },
  },
  avatarRing: {
    width: 150,
    height: 150,
    borderRadius: 75,
    borderWidth: 1.5,
    borderColor: 'rgba(255,42,163,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.02)',
  },
  avatar: { width: 134, height: 134, borderRadius: 67 },
  incomingRow: {
    flexDirection: 'row',
    justifyContent: 'space-evenly',
    alignItems: 'center',
    marginBottom: 24,
  },
  answerBtn: {
    width: 78,
    height: 78,
    borderRadius: 39,
    alignItems: 'center',
    justifyContent: 'center',
  },
  acceptBtn: { backgroundColor: '#08C45A' },
  rejectBtn: { backgroundColor: '#FF4545' },
  controlsDock: {
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(255,42,163,0.18)',
    backgroundColor: 'rgba(32,17,37,0.96)',
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 20,
  },
  controlBtn: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  endBtn: { backgroundColor: '#FF4259' },
  controlBtnActive: { backgroundColor: '#FFFFFF' },
});

export default CallSessionScreen;
