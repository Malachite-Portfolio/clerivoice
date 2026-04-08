import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Application from 'expo-application';
import * as Device from 'expo-device';
import { Platform } from 'react-native';

const INSTALLATION_ID_STORAGE_KEY = 'clarivoice_installation_id_v1';

const createInstallationId = () =>
  `inst_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;

const getOrCreateInstallationId = async () => {
  const existingId = String(
    (await AsyncStorage.getItem(INSTALLATION_ID_STORAGE_KEY)) || '',
  ).trim();

  if (existingId) {
    return existingId;
  }

  const nextId = createInstallationId();
  await AsyncStorage.setItem(INSTALLATION_ID_STORAGE_KEY, nextId);
  return nextId;
};

const trimDeviceId = (value) => String(value || '').trim().slice(0, 200);

export const getAuthDeviceContext = async () => {
  const installationId = await getOrCreateInstallationId();
  let androidId = '';

  if (Platform.OS === 'android') {
    try {
      androidId = String((await Application.getAndroidId()) || '').trim();
    } catch (_error) {
      androidId = '';
    }
  }

  const installationScopedDeviceId = trimDeviceId(
    `install:${Application.applicationId || 'clarivoice'}:${installationId}`,
  );

  return {
    // Use install-scoped ID so fresh reinstall starts with a fresh auth device context.
    deviceId: installationScopedDeviceId,
    deviceInfo: {
      installationId,
      hardwareDeviceId: androidId || null,
      platform: Platform.OS,
      appId: Application.applicationId || null,
      appVersion: Application.nativeApplicationVersion || null,
      appBuildVersion: Application.nativeBuildVersion || null,
      deviceName: Device.deviceName || Device.modelName || null,
      osName: Device.osName || null,
      osVersion: Device.osVersion || null,
      manufacturer: Device.manufacturer || null,
      brand: Device.brand || null,
    },
  };
};
