import React, { useCallback, useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { AUTH_DEBUG_ENABLED } from '../constants/api';
import { useAuth } from '../context/AuthContext';
import { useAppVariant } from '../context/AppVariantContext';
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

const logRealtimeRuntime = (label, payload) => {
  if (!AUTH_DEBUG_ENABLED) {
    return;
  }

  console.log(`[RealtimeRuntimeManager] ${label}`, payload);
};

const RealtimeRuntimeManager = () => {
  const { isHydrated, session } = useAuth();
  const { isListenerApp } = useAppVariant();
  const queryClient = useQueryClient();
  const pushTokenRef = useRef(null);
  const pendingIntentRef = useRef(null);

  const appFlavor = isListenerApp ? 'listener' : 'user';

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

  const openIncomingCallScreen = useCallback((request) => {
    const currentRoute = getCurrentRouteSnapshot();
    const currentSessionId = getRouteSessionId(currentRoute);

    if (currentRoute?.name === 'CallSession' && currentSessionId === request?.sessionId) {
      return false;
    }

    logRealtimeRuntime('incomingCallScreenShown', {
      sessionId: request?.sessionId || null,
      currentRouteName: currentRoute?.name || null,
    });

    return navigateToRoute('CallSession', {
      incomingRequest: request,
      host: {
        name: request?.requester?.displayName || 'Incoming call',
        avatar: request?.requester?.profileImageUrl || null,
        userId: request?.requester?.id || null,
        sessionId: request?.sessionId || null,
      },
    });
  }, []);

  const handleNavigationIntent = useCallback(
    (intent) => {
      if (!intent) {
        return false;
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

      if (currentRoute?.name === intent.routeName && currentSessionId && currentSessionId === targetSessionId) {
        return false;
      }

      return navigateToRoute(intent.routeName, intent.params);
    },
    [session?.accessToken],
  );

  useEffect(() => {
    updateNotificationRuntimeState({ appState: AppState.currentState || 'active' });

    const subscription = AppState.addEventListener('change', (appState) => {
      updateNotificationRuntimeState({ appState });
      logRealtimeRuntime('appStateChanged', {
        appState,
      });
    });

    return () => {
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    const unsubscribe = registerNotificationListeners({
      onNotificationReceived: (notification) => {
        const data = notification?.request?.content?.data || {};

        logRealtimeRuntime('notificationReceived', {
          type: data?.type || null,
          sessionId: data?.sessionId || null,
        });
      },
      onNotificationResponse: handleNavigationIntent,
    });

    return unsubscribe;
  }, [handleNavigationIntent]);

  useEffect(() => {
    if (!isHydrated) {
      return undefined;
    }

    if (!session?.accessToken) {
      pendingIntentRef.current = null;
      return undefined;
    }

    if (pendingIntentRef.current) {
      handleNavigationIntent(pendingIntentRef.current);
      pendingIntentRef.current = null;
    }

    consumeInitialNotificationResponseAsync(handleNavigationIntent).catch((error) => {
      logRealtimeRuntime('initialNotificationHandleFailed', {
        message: error?.message || 'Unknown error',
      });
    });

    return undefined;
  }, [handleNavigationIntent, isHydrated, session?.accessToken]);

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

      if (isListenerApp && AppState.currentState === 'active') {
        startIncomingRingtone({
          sessionId: payload?.sessionId,
          source: 'realtime_event',
        }).catch(() => {});
        openIncomingCallScreen(payload);
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
    };

    const onCallRejected = (payload) => {
      invalidateRealtimeQueries();
      stopIncomingCallRingtone(payload, 'call_rejected');
    };

    const onCallEnded = (payload) => {
      if (payload?.sessionType && payload.sessionType !== 'call') {
        invalidateRealtimeQueries();
        return;
      }

      invalidateRealtimeQueries();

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
    invalidateRealtimeQueries,
    isListenerApp,
    openIncomingCallScreen,
    session?.accessToken,
    session?.isDemoUser,
    stopIncomingCallRingtone,
  ]);

  return null;
};

export default RealtimeRuntimeManager;
