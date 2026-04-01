import { API_ENDPOINTS } from '../constants/api';
import { apiClient } from './apiClient';
import { logAuthError, logAuthRequest, logAuthResponse } from './authRequestLogger';

export const validateStoredSession = async (storedUser = null) => {
  logAuthRequest('validateStoredSession.listenerAvailability', API_ENDPOINTS.listeners.myAvailability, {});
  logAuthRequest('validateStoredSession.profile', API_ENDPOINTS.profile.me, {});

  try {
    const [availabilityResponse, profileResponse] = await Promise.all([
      apiClient.get(API_ENDPOINTS.listeners.myAvailability),
      apiClient.get(API_ENDPOINTS.profile.me),
    ]);

    logAuthResponse(
      'validateStoredSession.listenerAvailability',
      availabilityResponse,
      API_ENDPOINTS.listeners.myAvailability,
    );
    logAuthResponse('validateStoredSession.profile', profileResponse, API_ENDPOINTS.profile.me);

    const liveProfile = profileResponse.data.data || storedUser || {};

    return {
      ...(storedUser || {}),
      ...liveProfile,
      listenerAvailability:
        availabilityResponse.data.data || liveProfile.listenerAvailability || storedUser?.listenerAvailability || null,
    };
  } catch (error) {
    logAuthError('validateStoredSession', API_ENDPOINTS.listeners.myAvailability, {}, error);
    throw error;
  }
};
