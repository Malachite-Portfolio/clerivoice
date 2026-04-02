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

export const requestVideoCallPermissions = async () => {
  if (Platform.OS !== 'android') {
    logAudioPermission('videoPermissionResult', {
      platform: Platform.OS,
      granted: true,
      permissions: [],
    });
    return {
      granted: true,
      permissions: {},
    };
  }

  const requiredPermissions = [
    PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
    PermissionsAndroid.PERMISSIONS.CAMERA,
  ].filter(Boolean);

  const optionalPermissions = [];
  if (Platform.Version >= 31 && PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT) {
    optionalPermissions.push(PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT);
  }

  logAudioPermission('videoPermissionRequestStart', {
    required: requiredPermissions,
    optional: optionalPermissions,
  });

  const results = {};
  for (const permission of requiredPermissions) {
    results[permission] = await PermissionsAndroid.request(permission);
  }
  for (const permission of optionalPermissions) {
    results[permission] = await PermissionsAndroid.request(permission);
  }

  const granted = requiredPermissions.every(
    (permission) =>
      results[permission] === PermissionsAndroid.RESULTS.GRANTED,
  );

  logAudioPermission('videoPermissionResult', {
    granted,
    permissions: results,
  });

  return {
    granted,
    permissions: results,
  };
};
