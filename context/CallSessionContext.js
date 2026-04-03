import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AUTH_DEBUG_ENABLED } from '../constants/api';
import { useAppVariant } from './AppVariantContext';

const CallSessionContext = createContext(null);
const ACTIVE_CALL_STORAGE_KEY_PREFIX = 'clarivoice_active_call_state';

const normalizeCallType = (value) =>
  String(value || '').trim().toLowerCase() === 'video' ? 'video' : 'audio';

const resolveSessionIdFromParams = (params = {}) =>
  params?.callPayload?.session?.id || params?.incomingRequest?.sessionId || null;

const resolveCallTypeFromParams = (params = {}) =>
  normalizeCallType(
    params?.callPayload?.session?.callType ||
      params?.callPayload?.realtime?.callType ||
      params?.incomingRequest?.callType,
  );

const resolveCallModeFromParams = (params = {}) =>
  params?.incomingRequest ? 'incoming' : 'ongoing';

const resolveParticipantFromParams = (params = {}) => {
  const incomingRequester = params?.incomingRequest?.requester || null;
  const host = params?.host || null;

  const participantId =
    incomingRequester?.id ||
    host?.userId ||
    host?.listenerId ||
    null;
  const participantName =
    incomingRequester?.displayName ||
    host?.name ||
    null;
  const participantAvatar =
    incomingRequester?.profileImageUrl ||
    host?.avatar ||
    null;

  return {
    id: participantId,
    name: participantName,
    avatar: participantAvatar,
  };
};

const resolveSessionStatusFromParams = (params = {}) =>
  String(
    params?.callPayload?.session?.status ||
      (params?.incomingRequest ? 'RINGING' : ''),
  )
    .trim()
    .toUpperCase() || null;

const resolveConnectionState = (status) => {
  const normalizedStatus = String(status || '').trim().toUpperCase();

  if (normalizedStatus === 'ACTIVE') {
    return 'connected';
  }

  if (normalizedStatus === 'REQUESTED' || normalizedStatus === 'RINGING') {
    return 'ringing';
  }

  if (['ENDED', 'REJECTED', 'MISSED', 'CANCELLED'].includes(normalizedStatus)) {
    return 'ended';
  }

  return 'unknown';
};

const buildParamsFromPersistedCallState = (persistedState = {}) => {
  const sessionId = String(persistedState?.sessionId || '').trim();
  if (!sessionId) {
    return null;
  }

  const callType = normalizeCallType(persistedState?.callType);
  const participant = persistedState?.participant || {};
  const sessionStatus =
    String(persistedState?.sessionStatus || '').trim().toUpperCase() || 'RINGING';

  if (persistedState?.mode === 'incoming') {
    return {
      incomingRequest: {
        sessionId,
        callType,
        requester: {
          id: participant?.id || null,
          displayName: participant?.name || 'Incoming call',
          profileImageUrl: participant?.avatar || null,
        },
        ratePerMinute: Number(persistedState?.ratePerMinute || 0),
        requestedAt:
          persistedState?.startedAt ||
          persistedState?.connectedAt ||
          new Date().toISOString(),
      },
      host: {
        name: participant?.name || 'Incoming call',
        avatar: participant?.avatar || null,
        userId: participant?.id || null,
        sessionId,
      },
    };
  }

  return {
    callPayload: {
      session: {
        id: sessionId,
        status: sessionStatus,
        callType,
        startedAt: persistedState?.startedAt || null,
        answeredAt: persistedState?.connectedAt || null,
      },
      agora: null,
      realtime: null,
    },
    host: {
      name: participant?.name || 'Call',
      avatar: participant?.avatar || null,
      userId: participant?.id || null,
      listenerId: participant?.id || null,
      sessionId,
    },
  };
};

const normalizeCallState = (params, reason = 'unknown') => {
  const sessionId = resolveSessionIdFromParams(params);
  if (!sessionId) {
    return null;
  }

  const session = params?.callPayload?.session || null;
  const sessionStatus = resolveSessionStatusFromParams(params);
  const participant = resolveParticipantFromParams(params);

  return {
    sessionId,
    callId: sessionId,
    callType: resolveCallTypeFromParams(params),
    mode: resolveCallModeFromParams(params),
    sessionStatus,
    connectionState: resolveConnectionState(sessionStatus),
    channelName:
      session?.channelName ||
      params?.callPayload?.agora?.channelName ||
      params?.callPayload?.agora?.channel ||
      null,
    startedAt:
      session?.startedAt ||
      params?.incomingRequest?.requestedAt ||
      null,
    connectedAt:
      session?.answeredAt ||
      session?.startedAt ||
      null,
    participant,
    params,
    reason,
    updatedAt: new Date().toISOString(),
  };
};

const normalizePersistedCallState = (persistedState, reason = 'storage_restore') => {
  if (!persistedState || typeof persistedState !== 'object') {
    return null;
  }

  if (persistedState?.params) {
    return normalizeCallState(persistedState.params, reason);
  }

  const fallbackParams = buildParamsFromPersistedCallState(persistedState);
  if (!fallbackParams) {
    return null;
  }

  return normalizeCallState(fallbackParams, reason);
};

const logCallSessionContext = (label, payload) => {
  if (!AUTH_DEBUG_ENABLED) {
    return;
  }

  console.log(`[CallSessionContext] ${label}`, payload);
};

export const CallSessionProvider = ({ children }) => {
  const { isListenerApp } = useAppVariant();
  const [activeCall, setActiveCallState] = useState(null);
  const [isCallStateHydrated, setIsCallStateHydrated] = useState(false);
  const storageKey = useMemo(
    () => `${ACTIVE_CALL_STORAGE_KEY_PREFIX}_${isListenerApp ? 'listener' : 'user'}`,
    [isListenerApp],
  );

  const persistActiveCallState = useCallback(
    async (nextState, reason = 'unknown') => {
      try {
        if (!nextState) {
          await AsyncStorage.removeItem(storageKey);
          logCallSessionContext('activeCallPersisted', {
            action: 'remove',
            reason,
            storageKey,
          });
          return;
        }

        await AsyncStorage.setItem(storageKey, JSON.stringify(nextState));
        logCallSessionContext('activeCallPersisted', {
          action: 'set',
          sessionId: nextState.sessionId,
          callType: nextState.callType,
          mode: nextState.mode,
          reason,
          storageKey,
        });
      } catch (error) {
        logCallSessionContext('activeCallPersistFailed', {
          reason,
          storageKey,
          message: error?.message || 'Unknown error',
        });
      }
    },
    [storageKey],
  );

  useEffect(() => {
    let isCancelled = false;

    const hydrateActiveCallState = async () => {
      try {
        const rawValue = await AsyncStorage.getItem(storageKey);
        if (!rawValue) {
          logCallSessionContext('activeCallRestoreSkipped', {
            reason: 'storage_empty',
            storageKey,
          });
          return;
        }

        const parsedValue = JSON.parse(rawValue);
        const normalized = normalizePersistedCallState(parsedValue, 'storage_restore');

        if (!normalized) {
          await AsyncStorage.removeItem(storageKey);
          logCallSessionContext('activeCallRestoreSkipped', {
            reason: 'storage_invalid',
            storageKey,
          });
          return;
        }

        if (isCancelled) {
          return;
        }

        setActiveCallState(normalized);
        logCallSessionContext('activeCallRestored', {
          source: 'storage',
          sessionId: normalized.sessionId,
          callType: normalized.callType,
          mode: normalized.mode,
          storageKey,
        });
      } catch (error) {
        logCallSessionContext('activeCallRestoreFailed', {
          source: 'storage',
          storageKey,
          message: error?.message || 'Unknown error',
        });
      } finally {
        if (!isCancelled) {
          setIsCallStateHydrated(true);
        }
      }
    };

    hydrateActiveCallState();

    return () => {
      isCancelled = true;
    };
  }, [storageKey]);

  const setActiveCallFromParams = useCallback((params, reason = 'unknown') => {
    const normalized = normalizeCallState(params, reason);
    if (!normalized) {
      logCallSessionContext('activeCallSetSkipped', {
        reason: 'missing_session_id',
        source: reason,
      });
      return null;
    }

    setActiveCallState((prev) => {
      if (
        prev?.sessionId === normalized.sessionId &&
        prev?.mode === normalized.mode &&
        prev?.callType === normalized.callType &&
        prev?.sessionStatus === normalized.sessionStatus &&
        prev?.connectionState === normalized.connectionState
      ) {
        const next = {
          ...prev,
          params: normalized.params || prev.params,
          sessionStatus: normalized.sessionStatus || prev.sessionStatus,
          connectionState: normalized.connectionState || prev.connectionState,
          channelName: normalized.channelName || prev.channelName || null,
          startedAt: normalized.startedAt || prev.startedAt || null,
          connectedAt: normalized.connectedAt || prev.connectedAt || null,
          participant: normalized.participant || prev.participant || null,
          reason: normalized.reason,
          updatedAt: normalized.updatedAt,
        };
        persistActiveCallState(next, 'active_call_refreshed').catch(() => {});
        logCallSessionContext('activeCallRefreshed', {
          sessionId: next.sessionId,
          mode: next.mode,
          callType: next.callType,
          reason: next.reason,
        });
        return next;
      }

      persistActiveCallState(normalized, 'active_call_set').catch(() => {});
      logCallSessionContext('activeCallSet', {
        sessionId: normalized.sessionId,
        mode: normalized.mode,
        callType: normalized.callType,
        reason: normalized.reason,
      });
      return normalized;
    });

    return normalized;
  }, [persistActiveCallState]);

  const clearActiveCall = useCallback((reason = 'unknown', targetSessionId = null) => {
    setActiveCallState((prev) => {
      if (!prev) {
        return null;
      }

      if (targetSessionId && prev.sessionId !== targetSessionId) {
        return prev;
      }

      persistActiveCallState(null, 'active_call_cleared').catch(() => {});
      logCallSessionContext('activeCallCleared', {
        sessionId: prev.sessionId,
        reason,
      });
      return null;
    });
  }, [persistActiveCallState]);

  const value = useMemo(
    () => ({
      activeCall,
      isCallStateHydrated,
      setActiveCallFromParams,
      clearActiveCall,
      isActiveCallSession(sessionId) {
        if (!sessionId || !activeCall?.sessionId) {
          return false;
        }

        return activeCall.sessionId === sessionId;
      },
    }),
    [activeCall, clearActiveCall, isCallStateHydrated, setActiveCallFromParams],
  );

  return <CallSessionContext.Provider value={value}>{children}</CallSessionContext.Provider>;
};

export const useCallSession = () => {
  const context = useContext(CallSessionContext);
  if (!context) {
    throw new Error('useCallSession must be used within a CallSessionProvider');
  }
  return context;
};
