import { API_ENDPOINTS, AUTH_DEBUG_ENABLED } from '../constants/api';
import { apiClient } from './apiClient';

const logNotificationApi = (label, payload) => {
  if (!AUTH_DEBUG_ENABLED) {
    return;
  }

  console.log(`[NotificationApi] ${label}`, payload);
};

export const registerPushDevice = async (payload) => {
  logNotificationApi('registerPushDeviceStart', {
    appFlavor: payload?.appFlavor || null,
    platform: payload?.platform || null,
    hasToken: Boolean(payload?.expoPushToken),
  });

  const response = await apiClient.post(API_ENDPOINTS.notifications.registerDevice, payload);

  logNotificationApi('registerPushDeviceSuccess', {
    appFlavor: response.data?.data?.appFlavor || payload?.appFlavor || null,
  });

  return response.data.data;
};

export const unregisterPushDevice = async (expoPushToken) => {
  logNotificationApi('unregisterPushDeviceStart', {
    hasToken: Boolean(expoPushToken),
  });

  const response = await apiClient.delete(API_ENDPOINTS.notifications.unregisterDevice, {
    data: {
      expoPushToken,
    },
  });

  logNotificationApi('unregisterPushDeviceSuccess', {
    count: response.data?.data?.count ?? null,
  });

  return response.data.data;
};
