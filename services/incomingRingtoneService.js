import { NativeModules, Platform } from 'react-native';
import { AUTH_DEBUG_ENABLED } from '../constants/api';

const { IncomingRingtoneManager } = NativeModules;

let activeIncomingRingtoneSessionId = null;

const logIncomingRingtone = (label, payload) => {
  if (!AUTH_DEBUG_ENABLED) {
    return;
  }

  console.log(`[IncomingRingtoneService] ${label}`, payload);
};

const isNativeIncomingRingtoneAvailable =
  Platform.OS === 'android' &&
  IncomingRingtoneManager &&
  typeof IncomingRingtoneManager.startIncomingRingtone === 'function';

export const startIncomingRingtone = async ({
  sessionId,
  source = 'unknown',
} = {}) => {
  const normalizedSessionId = String(sessionId || '').trim();

  if (!normalizedSessionId) {
    logIncomingRingtone('ringtoneStartSkipped', {
      reason: 'missing_session',
      source,
    });
    return null;
  }

  if (!isNativeIncomingRingtoneAvailable) {
    logIncomingRingtone('ringtoneStartSkipped', {
      reason: 'native_unavailable',
      sessionId: normalizedSessionId,
      source,
    });
    return null;
  }

  try {
    const result = await IncomingRingtoneManager.startIncomingRingtone(normalizedSessionId);
    activeIncomingRingtoneSessionId = result?.sessionId || normalizedSessionId;
    logIncomingRingtone('ringtoneStart', {
      sessionId: activeIncomingRingtoneSessionId,
      source,
      status: result?.status || null,
      isPlaying: result?.isPlaying === true,
    });
    return result;
  } catch (error) {
    logIncomingRingtone('ringtoneStartFailed', {
      sessionId: normalizedSessionId,
      source,
      message: error?.message || 'Unknown error',
    });
    return null;
  }
};

export const stopIncomingRingtone = async ({
  sessionId = null,
  reason = 'unknown',
  force = false,
} = {}) => {
  if (!isNativeIncomingRingtoneAvailable) {
    return null;
  }

  const normalizedSessionId = String(sessionId || '').trim() || null;
  const targetSessionId = normalizedSessionId || activeIncomingRingtoneSessionId;

  if (!force && normalizedSessionId && activeIncomingRingtoneSessionId && normalizedSessionId !== activeIncomingRingtoneSessionId) {
    logIncomingRingtone('ringtoneStopSkipped', {
      activeSessionId: activeIncomingRingtoneSessionId,
      requestedSessionId: normalizedSessionId,
      reason,
    });
    return null;
  }

  try {
    const result = await IncomingRingtoneManager.stopIncomingRingtone(targetSessionId);

    if (result?.sessionId) {
      activeIncomingRingtoneSessionId = result.sessionId;
    }

    if (result?.isPlaying !== true) {
      activeIncomingRingtoneSessionId = null;
    }

    logIncomingRingtone('ringtoneStop', {
      sessionId: targetSessionId,
      reason,
      status: result?.status || null,
      isPlaying: result?.isPlaying === true,
    });
    return result;
  } catch (error) {
    logIncomingRingtone('ringtoneStopFailed', {
      sessionId: targetSessionId,
      reason,
      message: error?.message || 'Unknown error',
    });
    return null;
  }
};

export const getIncomingRingtoneState = async () => {
  if (!isNativeIncomingRingtoneAvailable) {
    return {
      isPlaying: false,
      sessionId: null,
      status: 'native_unavailable',
    };
  }

  try {
    return await IncomingRingtoneManager.getIncomingRingtoneState();
  } catch (error) {
    logIncomingRingtone('ringtoneStateFailed', {
      message: error?.message || 'Unknown error',
    });
    return {
      isPlaying: false,
      sessionId: null,
      status: 'state_failed',
    };
  }
};

export const hasIncomingRingtoneSupport = () => isNativeIncomingRingtoneAvailable;
