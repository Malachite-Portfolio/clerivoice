import { PermissionsAndroid, Platform } from 'react-native';
import { AUTH_DEBUG_ENABLED } from '../constants/api';

const logAudioPermission = (label, payload) => {
  if (!AUTH_DEBUG_ENABLED) {
    return;
  }

  console.log(`[AudioPermissions] ${label}`, payload);
};

export const requestCallAudioPermissions = async () => {
  if (Platform.OS !== 'android') {
    logAudioPermission('permissionResult', {
      platform: Platform.OS,
      granted: true,
      permissions: [],
    });
    return {
      granted: true,
      permissions: {},
    };
  }

  logAudioPermission('permissionRequestStart', {
    required: ['RECORD_AUDIO'],
    optional: Platform.Version >= 31 ? ['BLUETOOTH_CONNECT'] : [],
  });

  const results = {};

  const recordAudioPermission = PermissionsAndroid.PERMISSIONS.RECORD_AUDIO;
  results[recordAudioPermission] = await PermissionsAndroid.request(recordAudioPermission);
  const granted = results[recordAudioPermission] === PermissionsAndroid.RESULTS.GRANTED;

  if (Platform.Version >= 31 && PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT) {
    // Optional: only needed for interacting with bluetooth audio devices on Android 12+.
    const btPermission = PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT;
    results[btPermission] = await PermissionsAndroid.request(btPermission);
  }

  logAudioPermission('permissionResult', {
    granted,
    permissions: results,
  });

  return {
    granted,
    permissions: results,
  };
};
