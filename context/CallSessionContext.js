import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { AUTH_DEBUG_ENABLED } from '../constants/api';

const CallSessionContext = createContext(null);

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

const normalizeCallState = (params, reason = 'unknown') => {
  const sessionId = resolveSessionIdFromParams(params);
  if (!sessionId) {
    return null;
  }

  return {
    sessionId,
    callType: resolveCallTypeFromParams(params),
    mode: resolveCallModeFromParams(params),
    params,
    reason,
    updatedAt: new Date().toISOString(),
  };
};

const logCallSessionContext = (label, payload) => {
  if (!AUTH_DEBUG_ENABLED) {
    return;
  }

  console.log(`[CallSessionContext] ${label}`, payload);
};

export const CallSessionProvider = ({ children }) => {
  const [activeCall, setActiveCallState] = useState(null);

  const setActiveCallFromParams = useCallback((params, reason = 'unknown') => {
    const normalized = normalizeCallState(params, reason);
    if (!normalized) {
      return null;
    }

    setActiveCallState((prev) => {
      if (
        prev?.sessionId === normalized.sessionId &&
        prev?.mode === normalized.mode &&
        prev?.callType === normalized.callType
      ) {
        const next = {
          ...prev,
          params: normalized.params || prev.params,
          reason: normalized.reason,
          updatedAt: normalized.updatedAt,
        };
        logCallSessionContext('activeCallRefreshed', {
          sessionId: next.sessionId,
          mode: next.mode,
          callType: next.callType,
          reason: next.reason,
        });
        return next;
      }

      logCallSessionContext('activeCallSet', {
        sessionId: normalized.sessionId,
        mode: normalized.mode,
        callType: normalized.callType,
        reason: normalized.reason,
      });
      return normalized;
    });

    return normalized;
  }, []);

  const clearActiveCall = useCallback((reason = 'unknown', targetSessionId = null) => {
    setActiveCallState((prev) => {
      if (!prev) {
        return null;
      }

      if (targetSessionId && prev.sessionId !== targetSessionId) {
        return prev;
      }

      logCallSessionContext('activeCallCleared', {
        sessionId: prev.sessionId,
        reason,
      });
      return null;
    });
  }, []);

  const value = useMemo(
    () => ({
      activeCall,
      setActiveCallFromParams,
      clearActiveCall,
      isActiveCallSession(sessionId) {
        if (!sessionId || !activeCall?.sessionId) {
          return false;
        }

        return activeCall.sessionId === sessionId;
      },
    }),
    [activeCall, clearActiveCall, setActiveCallFromParams],
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

