import { NativeModules, Platform } from 'react-native';
import { AUTH_DEBUG_ENABLED } from '../constants/api';

const { CallAudioManager } = NativeModules;

const logCallAudioRoute = (label, payload) => {
  if (!AUTH_DEBUG_ENABLED) {
    return;
  }

  console.log(`[CallAudioRouteService] ${label}`, payload);
};

const isNativeRouteManagerAvailable =
  Platform.OS === 'android' &&
  CallAudioManager &&
  typeof CallAudioManager.startCommunicationAudio === 'function';

const runNativeRouteCall = async (methodName, speakerOn) => {
  if (!isNativeRouteManagerAvailable) {
    return null;
  }

  try {
    const result =
      typeof speakerOn === 'boolean'
        ? await CallAudioManager[methodName](speakerOn)
        : await CallAudioManager[methodName]();

    logCallAudioRoute(methodName, {
      speakerOn:
        typeof result?.speakerOn === 'boolean' ? result.speakerOn : speakerOn ?? null,
      microphoneMuted:
        typeof result?.microphoneMuted === 'boolean' ? result.microphoneMuted : null,
      mode: typeof result?.mode === 'number' ? result.mode : null,
      bluetoothScoOn:
        typeof result?.bluetoothScoOn === 'boolean' ? result.bluetoothScoOn : null,
    });

    return result;
  } catch (error) {
    logCallAudioRoute(`${methodName}Failed`, {
      message: error?.message || 'Unknown error',
      speakerOn: typeof speakerOn === 'boolean' ? speakerOn : null,
    });
    return null;
  }
};

export const startCommunicationAudioRoute = async (speakerOn = false) =>
  runNativeRouteCall('startCommunicationAudio', Boolean(speakerOn));

export const updateCommunicationAudioRoute = async (speakerOn = false) =>
  runNativeRouteCall('setSpeakerRoute', Boolean(speakerOn));

export const stopCommunicationAudioRoute = async () =>
  runNativeRouteCall('stopCommunicationAudio');

export const hasCommunicationAudioRouteManager = () => isNativeRouteManagerAvailable;
