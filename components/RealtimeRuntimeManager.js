import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Linking, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { AUTH_DEBUG_ENABLED } from '../constants/api';
import { useAuth } from '../context/AuthContext';
import { useAppVariant } from '../context/AppVariantContext';
import { useCallSession } from '../context/CallSessionContext';
import {
  connectRealtimeSocket,
  getRealtimeSocket,
} from '../services/realtimeSocket';
import { queryKeys } from '../services/queryClient';
import { registerPushDevice, unregisterPushDevice } from '../services/notificationApi';
import {
  consumeInitialNotificationResponseAsync,
  registerForPushNotificationsAsync,
  registerNotificationListeners,
  shouldUseInAppChatBanner,
  updateNotificationRuntimeState,
} from '../services/notificationService';
import {
  startIncomingRingtone,
  stopIncomingRingtone,
} from '../services/incomingRingtoneService';
import {
  getCurrentRouteSnapshot,
  navigateToRoute,
} from '../navigation/navigationRef';
import { getCallSession, getCallSessions } from '../services/sessionApi';

const ACTIVE_CALL_STATUSES = new Set(['REQUESTED', 'RINGING', 'ACTIVE']);

const normalizeCallType = (value) =>
  String(value || '').trim().toLowerCase() === 'video' ? 'video' : 'audio';

const getRouteSessionId = (route) => {
  if (!route) {
    return null;
  }

  if (route.name === 'ChatSession') {
    return route.params?.chatPayload?.session?.id || null;
  }

  if (route.name === 'CallSession') {
    return (
      route.params?.callPayload?.session?.id ||
      route.params?.incomingRequest?.sessionId ||
      null
    );
  }

  return null;
};

const isActiveCallStatus = (status) =>
  ACTIVE_CALL_STATUSES.has(String(status || '').trim().toUpperCase());

const getCounterpartyFromSession = (session, isListenerApp) =>
  isListenerApp ? session?.user || null : session?.listener || null;

const buildIncomingCallParams = ({ session, callType }) => {
  const requester = session?.user || {};

  return {
    incomingRequest: {
      sessionId: session?.id || null,
      callType: normalizeCallType(callType),
      requester: {
        id: requester?.id || null,
        displayName: requester?.displayName || 'Incoming call',
        profileImageUrl: requester?.profileImageUrl || null,
      },
      ratePerMinute: Number(session?.ratePerMinute || 0),
      requestedAt: session?.requestedAt || session?.createdAt || new Date().toISOString(),
    },
    host: {
      name: requester?.displayName || 'Incoming call',
      avatar: requester?.profileImageUrl || null,
      userId: requester?.id || null,
      sessionId: session?.id || null,
    },
  };
};

const buildCallPayloadParams = ({ session, realtime, callType, isListenerApp }) => {
  const counterparty = getCounterpartyFromSession(session, isListenerApp);

  return {
    callPayload: {
      session: {
        ...session,
        callType: normalizeCallType(callType),
      },
      realtime: realtime || null,
      agora: null,
    },
    host: {
      name: counterparty?.displayName || (isListenerApp ? 'User' : 'Support Host'),
      avatar: counterparty?.profileImageUrl || null,
      userId: !isListenerApp ? counterparty?.id || null : session?.userId || null,
      listenerId: isListenerApp ? session?.listenerId || null : counterparty?.id || null,
      sessionId: session?.id || null,
    },
  };
};

const buildCallParamsFromSessionSnapshot = ({ snapshot, isListenerApp }) => {
  const session = snapshot?.session || null;
  if (!session?.id) {
    return null;
  }

  const callType = normalizeCallType(
    session?.callType || snapshot?.realtime?.callType,
  );
  const normalizedStatus = String(session?.status || '').trim().toUpperCase();
  const isIncomingRinging =
    isListenerApp &&
    normalizedStatus === 'RINGING' &&
    snapshot?.realtime?.isAccepted !== true;

  if (isIncomingRinging) {
    return buildIncomingCallParams({
      session,
      callType,
    });
  }

  return buildCallPayloadParams({
    session,
    realtime: snapshot?.realtime || null,
    callType,
    isListenerApp,
  });
};

const buildIncomingCallRouteParamsFromSocketPayload = (request = {}) => ({
  incomingRequest: {
    sessionId: request?.sessionId || null,
    callType: normalizeCallType(request?.callType),
    requester: {
      id: request?.requester?.id || null,
      displayName: request?.requester?.displayName || 'Incoming call',
      profileImageUrl: request?.requester?.profileImageUrl || null,
    },
    ratePerMinute: Number(request?.ratePerMinute || 0),
    requestedAt: request?.requestedAt || new Date().toISOString(),
  },
  host: {
    name: request?.requester?.displayName || 'Incoming call',
    avatar: request?.requester?.profileImageUrl || null,
    userId: request?.requester?.id || null,
    sessionId: request?.sessionId || null,
  },
});

const buildDeepLinkNavigationIntent = (url) => {
  if (!url) {
    return null;
  }

  if (typeof URL === 'undefined') {
    return null;
  }

  try {
    const parsed = new URL(url);
    const pathname = String(parsed.pathname || '').toLowerCase();
    const hostname = String(parsed.hostname || '').toLowerCase();
    const routeHint = `${hostname}${pathname}`;
    const sessionId =
      parsed.searchParams.get('sessionId') ||
      parsed.searchParams.get('callSessionId') ||
      parsed.searchParams.get('chatSessionId') ||
      null;
    const callType = normalizeCallType(parsed.searchParams.get('callType'));
    const mode = String(parsed.searchParams.get('mode') || '').trim().toLowerCase();

    if (routeHint.includes('call') && sessionId) {
      if (mode === 'incoming') {
        return {
          routeName: 'CallSession',
          params: {
            incomingRequest: {
              sessionId,
              callType,
              requester: {
                id: parsed.searchParams.get('requesterId') || null,
                displayName: parsed.searchParams.get('requesterName') || 'Incoming call',
                profileImageUrl: parsed.searchParams.get('requesterAvatar') || null,
              },
              ratePerMinute: Number(parsed.searchParams.get('ratePerMinute') || 0),
              requestedAt: parsed.searchParams.get('requestedAt') || new Date().toISOString(),
            },
            host: {
              name: parsed.searchParams.get('requesterName') || 'Incoming call',
              avatar: parsed.searchParams.get('requesterAvatar') || null,
              userId: parsed.searchParams.get('requesterId') || null,
              sessionId,
            },
          },
        };
      }

      return {
        routeName: 'CallSession',
        params: {
          callPayload: {
            session: {
              id: sessionId,
              status: String(parsed.searchParams.get('status') || 'RINGING')
                .trim()
                .toUpperCase(),
              callType,
              userId: parsed.searchParams.get('userId') || null,
              listenerId: parsed.searchParams.get('listenerId') || null,
              requestedAt: parsed.searchParams.get('requestedAt') || null,
              startedAt: parsed.searchParams.get('startedAt') || null,
              answeredAt: parsed.searchParams.get('answeredAt') || null,
            },
            agora: null,
          },
          host: {
            name: parsed.searchParams.get('hostName') || 'Call',
            avatar: parsed.searchParams.get('hostAvatar') || null,
            userId: parsed.searchParams.get('userId') || null,
            listenerId: parsed.searchParams.get('listenerId') || null,
            sessionId,
          },
        },
      };
    }

    if (routeHint.includes('chat') && sessionId) {
      return {
        routeName: 'ChatSession',
        params: {
          chatPayload: {
            session: {
              id: sessionId,
              status: String(parsed.searchParams.get('status') || 'ACTIVE')
                .trim()
                .toUpperCase(),
              userId: parsed.searchParams.get('userId') || null,
              listenerId: parsed.searchParams.get('listenerId') || null,
            },
            agora: null,
          },
          host: {
            name: parsed.searchParams.get('hostName') || 'Conversation',
            avatar: parsed.searchParams.get('hostAvatar') || null,
            userId: parsed.searchParams.get('userId') || null,
            listenerId: parsed.searchParams.get('listenerId') || null,
          },
        },
      };
    }
  } catch (_error) {
    return null;
  }

  return null;
};

const logRealtimeRuntime = (label, payload) => {
  if (!AUTH_DEBUG_ENABLED) {
    return;
  }

  console.log(`[RealtimeRuntimeManager] ${label}`, payload);
};

const RealtimeRuntimeManager = () => {
  const { isHydrated, session } = useAuth();
  const { isListenerApp } = useAppVariant();
  const { activeCall, setActiveCallFromParams, clearActiveCall } = useCallSession();
  const queryClient = useQueryClient();
  const pushTokenRef = useRef(null);
  const pendingIntentRef = useRef(null);
  const bannerTimerRef = useRef(null);
  const appStateRef = useRef(AppState.currentState || 'active');
  const callRestoreInFlightRef = useRef(false);
  const lastCallRestoreAtRef = useRef(0);
  const [foregroundBanner, setForegroundBanner] = useState(null);

  const appFlavor = isListenerApp ? 'listener' : 'user';

  const dismissForegroundBanner = useCallback(() => {
    if (bannerTimerRef.current) {
      clearTimeout(bannerTimerRef.current);
      bannerTimerRef.current = null;
    }

    setForegroundBanner(null);
  }, []);

  const stopIncomingCallRingtone = useCallback(
    (payload, reason = 'unknown') => {
      if (!isListenerApp) {
        return;
      }

      const sessionId = payload?.sessionId || null;
      const normalizedReason = String(reason || '').trim().toLowerCase();

      if (normalizedReason === 'caller_cancelled') {
        logRealtimeRuntime('callerCancelled', {
          sessionId,
          endReason: payload?.endReason || null,
          reasonCode: payload?.reasonCode || null,
        });
      }

      if (normalizedReason === 'missed_call_timeout') {
        logRealtimeRuntime('missedCallTimeout', {
          sessionId,
          endReason: payload?.endReason || null,
          reasonCode: payload?.reasonCode || null,
        });
      }

      stopIncomingRingtone({
        sessionId,
        reason: normalizedReason,
      }).catch(() => {});
    },
    [isListenerApp],
  );

  const invalidateRealtimeQueries = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: queryKeys.sessions.all }).catch(() => {});
    queryClient.invalidateQueries({ queryKey: queryKeys.wallet.summary }).catch(() => {});

    if (isListenerApp) {
      queryClient.invalidateQueries({ queryKey: queryKeys.listener.dashboard }).catch(() => {});
      queryClient.invalidateQueries({ queryKey: queryKeys.listener.calls }).catch(() => {});
      queryClient
        .invalidateQueries({
          queryKey: queryKeys.listener.earnings({ type: 'ADMIN_CREDIT' }),
        })
        .catch(() => {});
    }
  }, [isListenerApp, queryClient]);

  const openIncomingCallScreen = useCallback(
    (request, source = 'incoming_call_event') => {
      const params = buildIncomingCallRouteParamsFromSocketPayload(request);
      setActiveCallFromParams(params, source);
      const currentRoute = getCurrentRouteSnapshot();
      const currentSessionId = getRouteSessionId(currentRoute);

      if (currentRoute?.name === 'CallSession' && currentSessionId === request?.sessionId) {
        return false;
      }

      logRealtimeRuntime('incomingCallScreenShown', {
        sessionId: request?.sessionId || null,
        source,
        currentRouteName: currentRoute?.name || null,
      });

      return navigateToRoute('CallSession', params);
    },
    [setActiveCallFromParams],
  );

  const restoreActiveCallSession = useCallback(
    async (reason = 'unknown', preferredSessionId = null) => {
      if (!session?.accessToken || session?.isDemoUser) {
        return false;
      }

      const now = Date.now();
      if (callRestoreInFlightRef.current) {
        logRealtimeRuntime('activeCallRestoreSkipped', {
          reason,
          skipReason: 'already_in_flight',
        });
        return false;
      }
      if (now - lastCallRestoreAtRef.current < 700) {
        logRealtimeRuntime('activeCallRestoreSkipped', {
          reason,
          skipReason: 'throttled',
        });
        return false;
      }

      const currentRoute = getCurrentRouteSnapshot();
      const currentSessionId = getRouteSessionId(currentRoute);
      if (currentRoute?.name === 'CallSession' && currentSessionId) {
        setActiveCallFromParams(currentRoute.params || {}, `${reason}_already_on_call_screen`);
        return false;
      }

      callRestoreInFlightRef.current = true;
      lastCallRestoreAtRef.current = now;

      try {
        const candidateSessionIds = [];
        if (preferredSessionId) {
          candidateSessionIds.push(preferredSessionId);
        }
        if (activeCall?.sessionId && !candidateSessionIds.includes(activeCall.sessionId)) {
          candidateSessionIds.push(activeCall.sessionId);
        }

        for (const sessionId of candidateSessionIds) {
          try {
            const snapshot = await getCallSession(sessionId);
            if (!isActiveCallStatus(snapshot?.session?.status)) {
              clearActiveCall(`${reason}_inactive_candidate`, sessionId);
              continue;
            }

            const params = buildCallParamsFromSessionSnapshot({
              snapshot,
              isListenerApp,
            });
            if (!params) {
              continue;
            }

            setActiveCallFromParams(params, `${reason}_candidate_restored`);
            const activeRoute = getCurrentRouteSnapshot();
            const activeRouteSessionId = getRouteSessionId(activeRoute);
            if (
              activeRoute?.name === 'CallSession' &&
              activeRouteSessionId === snapshot?.session?.id
            ) {
              return true;
            }

            logRealtimeRuntime('activeCallRestored', {
              reason,
              sessionId: snapshot?.session?.id || null,
              status: snapshot?.session?.status || null,
              source: 'candidate_session',
            });
            navigateToRoute('CallSession', params);
            return true;
          } catch (_error) {
            clearActiveCall(`${reason}_candidate_lookup_failed`, sessionId);
          }
        }

        const sessionList = await getCallSessions({
          page: 1,
          limit: 20,
          status: ['REQUESTED', 'RINGING', 'ACTIVE'],
        });
        const activeCandidates = (sessionList?.items || []).filter((item) =>
          isActiveCallStatus(item?.status),
        );

        if (!activeCandidates.length) {
          if (activeCall?.sessionId) {
            clearActiveCall(`${reason}_no_backend_active_call`, activeCall.sessionId);
          }
          logRealtimeRuntime('activeCallRestoreNone', {
            reason,
          });
          return false;
        }

        for (const candidate of activeCandidates) {
          try {
            const snapshot = await getCallSession(candidate.id);
            if (!isActiveCallStatus(snapshot?.session?.status)) {
              continue;
            }

            const params = buildCallParamsFromSessionSnapshot({
              snapshot,
              isListenerApp,
            });
            if (!params) {
              continue;
            }

            setActiveCallFromParams(params, `${reason}_backend_restored`);
            const activeRoute = getCurrentRouteSnapshot();
            const activeRouteSessionId = getRouteSessionId(activeRoute);
            if (
              activeRoute?.name === 'CallSession' &&
              activeRouteSessionId === snapshot?.session?.id
            ) {
              return true;
            }

            logRealtimeRuntime('activeCallRestored', {
              reason,
              sessionId: snapshot?.session?.id || null,
              status: snapshot?.session?.status || null,
              source: 'backend_list',
            });
            navigateToRoute('CallSession', params);
            return true;
          } catch (_error) {
            // Keep trying the next candidate.
          }
        }

        return false;
      } catch (error) {
        logRealtimeRuntime('activeCallRestoreFailed', {
          reason,
          message: error?.response?.data?.message || error?.message || 'Unknown error',
        });
        return false;
      } finally {
        callRestoreInFlightRef.current = false;
      }
    },
    [
      activeCall?.sessionId,
      clearActiveCall,
      isListenerApp,
      session?.accessToken,
      session?.isDemoUser,
      setActiveCallFromParams,
    ],
  );

  const handleNavigationIntent = useCallback(
    (intent) => {
      if (!intent) {
        return false;
      }

      if (intent?.routeName === 'CallSession' && intent?.params) {
        setActiveCallFromParams(intent.params, 'navigation_intent');
      }

      if (!session?.accessToken) {
        pendingIntentRef.current = intent;
        return false;
      }

      const currentRoute = getCurrentRouteSnapshot();
      const currentSessionId = getRouteSessionId(currentRoute);
      const targetSessionId =
        intent.params?.chatPayload?.session?.id ||
        intent.params?.callPayload?.session?.id ||
        intent.params?.incomingRequest?.sessionId ||
        null;

      if (
        currentRoute?.name === intent.routeName &&
        currentSessionId &&
        currentSessionId === targetSessionId
      ) {
        return false;
      }

      logRealtimeRuntime('navigationIntentHandled', {
        routeName: intent.routeName,
        targetSessionId,
      });
      return navigateToRoute(intent.routeName, intent.params);
    },
    [session?.accessToken, setActiveCallFromParams],
  );

  const showForegroundChatBanner = useCallback((notification) => {
    if (!shouldUseInAppChatBanner(notification)) {
      return false;
    }

    const content = notification?.request?.content || {};
    const data = content?.data || {};
    const nextBanner = {
      id: notification?.request?.identifier || `${data?.sessionId || 'chat'}:${Date.now()}`,
      title: content?.title || data?.senderName || 'New message',
      body: content?.body || data?.preview || 'You have a new message.',
      sessionId: data?.sessionId || null,
    };

    logRealtimeRuntime('inAppChatBannerShown', {
      sessionId: nextBanner.sessionId,
      title: nextBanner.title,
    });

    if (bannerTimerRef.current) {
      clearTimeout(bannerTimerRef.current);
    }

    setForegroundBanner(nextBanner);
    bannerTimerRef.current = setTimeout(() => {
      setForegroundBanner(null);
      bannerTimerRef.current = null;
    }, 3600);

    return true;
  }, []);

  useEffect(() => {
    updateNotificationRuntimeState({ appState: AppState.currentState || 'active' });
    appStateRef.current = AppState.currentState || 'active';

    const subscription = AppState.addEventListener('change', (appState) => {
      const previousState = appStateRef.current;
      appStateRef.current = appState;
      updateNotificationRuntimeState({ appState });
      logRealtimeRuntime('appStateChanged', {
        previousState,
        appState,
      });

      if (
        isListenerApp &&
        !session?.isDemoUser &&
        String(session?.user?.role || '').trim().toUpperCase() === 'LISTENER'
      ) {
        const socket = getRealtimeSocket();
        if (socket) {
          if (appState === 'active') {
            socket.emit('listener_online');
            logRealtimeRuntime('listenerPresenceEmit', {
              status: 'ONLINE',
              reason: 'app_foreground',
            });
          } else if (!activeCall?.sessionId) {
            socket.emit('listener_offline');
            logRealtimeRuntime('listenerPresenceEmit', {
              status: 'OFFLINE',
              reason: 'app_background_no_active_call',
            });
          }
        }
      }

      if (appState === 'active' && previousState !== 'active') {
        restoreActiveCallSession('app_resume').catch(() => {});
      }
    });

    return () => {
      subscription.remove();
    };
  }, [
    activeCall?.sessionId,
    isListenerApp,
    restoreActiveCallSession,
    session?.isDemoUser,
    session?.user?.role,
  ]);

  useEffect(() => {
    const onUrlEvent = ({ url }) => {
      const intent = buildDeepLinkNavigationIntent(url);
      if (!intent) {
        return;
      }
      logRealtimeRuntime('deepLinkHandled', {
        url,
        routeName: intent.routeName,
      });
      handleNavigationIntent(intent);
    };

    const linkingSubscription = Linking.addEventListener('url', onUrlEvent);

    Linking.getInitialURL()
      .then((url) => {
        if (!url) {
          return;
        }
        const intent = buildDeepLinkNavigationIntent(url);
        if (!intent) {
          return;
        }
        logRealtimeRuntime('initialDeepLinkHandled', {
          url,
          routeName: intent.routeName,
        });
        handleNavigationIntent(intent);
      })
      .catch((error) => {
        logRealtimeRuntime('initialDeepLinkFailed', {
          message: error?.message || 'Unknown error',
        });
      });

    return () => {
      linkingSubscription.remove();
    };
  }, [handleNavigationIntent]);

  useEffect(() => {
    let unsubscribe = () => {};

    try {
      unsubscribe = registerNotificationListeners({
        onNotificationReceived: (notification) => {
          const data = notification?.request?.content?.data || {};

          logRealtimeRuntime('notificationReceived', {
            type: data?.type || null,
            sessionId: data?.sessionId || null,
          });

          showForegroundChatBanner(notification);
        },
        onNotificationResponse: handleNavigationIntent,
      });
    } catch (error) {
      logRealtimeRuntime('notificationListenerSetupFailed', {
        message: error?.message || 'Unknown error',
      });
    }

    return () => {
      unsubscribe();
      dismissForegroundBanner();
    };
  }, [dismissForegroundBanner, handleNavigationIntent, showForegroundChatBanner]);

  useEffect(() => {
    if (!isHydrated) {
      return undefined;
    }

    if (!session?.accessToken) {
      pendingIntentRef.current = null;
      clearActiveCall('session_unavailable');
      return undefined;
    }

    let cancelled = false;

    const bootstrapNavigationIntents = async () => {
      if (pendingIntentRef.current) {
        handleNavigationIntent(pendingIntentRef.current);
        pendingIntentRef.current = null;
      }

      try {
        await consumeInitialNotificationResponseAsync(handleNavigationIntent);
      } catch (error) {
        logRealtimeRuntime('initialNotificationHandleFailed', {
          message: error?.message || 'Unknown error',
        });
      }

      if (cancelled) {
        return;
      }

      await restoreActiveCallSession('app_launch');
    };

    bootstrapNavigationIntents().catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [
    clearActiveCall,
    handleNavigationIntent,
    isHydrated,
    restoreActiveCallSession,
    session?.accessToken,
  ]);

  useEffect(() => {
    if (!session?.accessToken || session?.isDemoUser) {
      return undefined;
    }

    let isCancelled = false;

    const registerDeviceForPush = async () => {
      try {
        const registration = await registerForPushNotificationsAsync({ appFlavor });
        if (isCancelled || !registration?.expoPushToken) {
          return;
        }

        pushTokenRef.current = registration.expoPushToken;
        await registerPushDevice(registration);
      } catch (error) {
        logRealtimeRuntime('pushRegistrationFailed', {
          message: error?.message || 'Unknown error',
        });
      }
    };

    registerDeviceForPush();

    return () => {
      isCancelled = true;

      if (pushTokenRef.current) {
        unregisterPushDevice(pushTokenRef.current).catch(() => {});
        pushTokenRef.current = null;
      }
    };
  }, [appFlavor, session?.accessToken, session?.isDemoUser]);

  useEffect(() => {
    if (!session?.accessToken || session?.isDemoUser) {
      return undefined;
    }

    const socket = getRealtimeSocket() || connectRealtimeSocket(session.accessToken);

    const onIncomingCall = (payload) => {
      logRealtimeRuntime('incomingCallEventReceived', {
        sessionId: payload?.sessionId || null,
        requesterId: payload?.requester?.id || null,
        appState: AppState.currentState || null,
      });

      invalidateRealtimeQueries();
      setActiveCallFromParams(
        buildIncomingCallRouteParamsFromSocketPayload(payload),
        'socket_call_request',
      );

      if (isListenerApp && AppState.currentState === 'active') {
        startIncomingRingtone({
          sessionId: payload?.sessionId,
          source: 'realtime_event',
        }).catch(() => {});
        openIncomingCallScreen(payload, 'socket_call_request');
      }
    };

    const onChatMessage = (payload) => {
      logRealtimeRuntime('chatMessageEventReceived', {
        sessionId: payload?.sessionId || null,
        messageId: payload?.id || null,
      });

      invalidateRealtimeQueries();
    };

    const onWalletUpdated = () => {
      invalidateRealtimeQueries();
    };

    const onCallStarted = (payload) => {
      invalidateRealtimeQueries();
      stopIncomingCallRingtone(payload, 'call_started');
      restoreActiveCallSession('socket_call_started', payload?.sessionId || null).catch(() => {});
    };

    const onCallRejected = (payload) => {
      invalidateRealtimeQueries();
      stopIncomingCallRingtone(payload, 'call_rejected');
      clearActiveCall('socket_call_rejected', payload?.sessionId || null);
    };

    const onCallEnded = (payload) => {
      if (payload?.sessionType && payload.sessionType !== 'call') {
        invalidateRealtimeQueries();
        return;
      }

      invalidateRealtimeQueries();
      clearActiveCall('socket_call_ended', payload?.sessionId || null);

      const normalizedEndReason = String(payload?.endReason || '').trim().toUpperCase();
      const normalizedReasonCode = String(payload?.reasonCode || '').trim().toUpperCase();

      if (
        ['USER_ENDED', 'CANCELLED'].includes(normalizedEndReason) ||
        ['ENDED_BY_USER', 'CANCELLED_BY_USER'].includes(normalizedReasonCode)
      ) {
        stopIncomingCallRingtone(payload, 'caller_cancelled');
        return;
      }

      if (
        ['MISSED', 'TIMEOUT'].includes(normalizedEndReason) ||
        ['MISSED', 'TIMEOUT'].includes(normalizedReasonCode)
      ) {
        stopIncomingCallRingtone(payload, 'missed_call_timeout');
        return;
      }

      stopIncomingCallRingtone(payload, 'call_ended');
    };

    socket.on('call_request', onIncomingCall);
    socket.on('chat_message', onChatMessage);
    socket.on('chat_started', invalidateRealtimeQueries);
    socket.on('chat_ended', invalidateRealtimeQueries);
    socket.on('call_started', onCallStarted);
    socket.on('call_rejected', onCallRejected);
    socket.on('call_ended', onCallEnded);
    socket.on('session_ended', onCallEnded);
    socket.on('wallet_updated', onWalletUpdated);

    return () => {
      socket.off('call_request', onIncomingCall);
      socket.off('chat_message', onChatMessage);
      socket.off('chat_started', invalidateRealtimeQueries);
      socket.off('chat_ended', invalidateRealtimeQueries);
      socket.off('call_started', onCallStarted);
      socket.off('call_rejected', onCallRejected);
      socket.off('call_ended', onCallEnded);
      socket.off('session_ended', onCallEnded);
      socket.off('wallet_updated', onWalletUpdated);

      stopIncomingCallRingtone({ sessionId: null }, 'runtime_cleanup');
    };
  }, [
    clearActiveCall,
    invalidateRealtimeQueries,
    isListenerApp,
    openIncomingCallScreen,
    restoreActiveCallSession,
    session?.accessToken,
    session?.isDemoUser,
    setActiveCallFromParams,
    stopIncomingCallRingtone,
  ]);

  useEffect(
    () => () => {
      if (bannerTimerRef.current) {
        clearTimeout(bannerTimerRef.current);
        bannerTimerRef.current = null;
      }
    },
    [],
  );

  if (!foregroundBanner) {
    return null;
  }

  return (
    <View pointerEvents="box-none" style={styles.bannerLayer}>
      <TouchableOpacity
        activeOpacity={0.92}
        onPress={dismissForegroundBanner}
        style={styles.bannerCard}
      >
        <Text style={styles.bannerTitle} numberOfLines={1}>
          {foregroundBanner.title}
        </Text>
        <Text style={styles.bannerBody} numberOfLines={2}>
          {foregroundBanner.body}
        </Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  bannerLayer: {
    position: 'absolute',
    top: 18,
    left: 14,
    right: 14,
    zIndex: 999,
    elevation: 12,
  },
  bannerCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255, 42, 163, 0.38)',
    backgroundColor: 'rgba(9, 10, 20, 0.96)',
    paddingHorizontal: 14,
    paddingVertical: 12,
    shadowColor: '#000000',
    shadowOpacity: 0.24,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
  },
  bannerTitle: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  bannerBody: {
    color: 'rgba(255,255,255,0.74)',
    fontSize: 12,
    lineHeight: 18,
    marginTop: 4,
  },
});

export default RealtimeRuntimeManager;
