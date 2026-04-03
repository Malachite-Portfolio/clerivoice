import { NativeModules, Platform } from 'react-native';
import { AUTH_DEBUG_ENABLED } from '../constants/api';

const { OngoingCallService } = NativeModules;

const logOngoingCallService = (label, payload) => {
  if (!AUTH_DEBUG_ENABLED) {
    return;
  }

  console.log(`[OngoingCallService] ${label}`, payload);
};

const isNativeOngoingCallServiceAvailable =
  Platform.OS === 'android' &&
  OngoingCallService &&
  typeof OngoingCallService.startOngoingCallService === 'function';

const runNativeOngoingCallServiceCall = async (methodName, payload = {}) => {
  if (!isNativeOngoingCallServiceAvailable) {
    return null;
  }

  try {
    const result =
      typeof OngoingCallService[methodName] === 'function'
        ? await OngoingCallService[methodName](
            payload?.title || null,
            payload?.subtitle || null,
            String(payload?.callType || '').trim().toLowerCase() === 'video',
          )
        : null;

    logOngoingCallService(methodName, {
      running: Boolean(result?.running),
      title: result?.title || payload?.title || null,
      subtitle: result?.subtitle || payload?.subtitle || null,
      reason: payload?.reason || null,
      sessionId: payload?.sessionId || null,
    });

    return result;
  } catch (error) {
    logOngoingCallService(`${methodName}Failed`, {
      message: error?.message || 'Unknown error',
      title: payload?.title || null,
      subtitle: payload?.subtitle || null,
      reason: payload?.reason || null,
      sessionId: payload?.sessionId || null,
    });
    return null;
  }
};

export const startOngoingCallForegroundService = async ({
  title = 'Clarivoice call in progress',
  subtitle = 'Voice call is active',
  sessionId = null,
  callType = 'audio',
} = {}) =>
  runNativeOngoingCallServiceCall('startOngoingCallService', {
    title,
    subtitle,
    sessionId,
    callType,
  });

export const stopOngoingCallForegroundService = async ({
  reason = 'unknown',
  sessionId = null,
} = {}) =>
  runNativeOngoingCallServiceCall('stopOngoingCallService', {
    title: null,
    subtitle: null,
    reason,
    sessionId,
  });

export const hasOngoingCallForegroundService = () =>
  isNativeOngoingCallServiceAvailable;
