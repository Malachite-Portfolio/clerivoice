import { API_ENDPOINTS } from '../constants/api';
import { isUnauthorizedApiError, apiClient } from './apiClient';
import { logAuthError, logAuthRequest, logAuthResponse } from './authRequestLogger';

export const validateStoredSession = async (storedUser = null) => {
  logAuthRequest('validateStoredSession.listenerAvailability', API_ENDPOINTS.listeners.myAvailability, {});
  logAuthRequest('validateStoredSession.profile', API_ENDPOINTS.profile.me, {});

  const [availabilityResult, profileResult] = await Promise.allSettled([
    apiClient.get(API_ENDPOINTS.listeners.myAvailability),
    apiClient.get(API_ENDPOINTS.profile.me),
  ]);

  const availabilityError =
    availabilityResult.status === 'rejected' ? availabilityResult.reason : null;
  const profileError = profileResult.status === 'rejected' ? profileResult.reason : null;

  if (availabilityError && isUnauthorizedApiError(availabilityError)) {
    logAuthError(
      'validateStoredSession.listenerAvailability',
      API_ENDPOINTS.listeners.myAvailability,
      {},
      availabilityError,
    );
    throw availabilityError;
  }

  if (profileError && isUnauthorizedApiError(profileError)) {
    logAuthError('validateStoredSession.profile', API_ENDPOINTS.profile.me, {}, profileError);
    throw profileError;
  }

  if (availabilityError && profileError) {
    logAuthError(
      'validateStoredSession.listenerAvailability',
      API_ENDPOINTS.listeners.myAvailability,
      {},
      availabilityError,
    );
    logAuthError('validateStoredSession.profile', API_ENDPOINTS.profile.me, {}, profileError);
    throw availabilityError;
  }

  const availabilityResponse =
    availabilityResult.status === 'fulfilled' ? availabilityResult.value : null;
  const profileResponse = profileResult.status === 'fulfilled' ? profileResult.value : null;

  if (availabilityResponse) {
    logAuthResponse(
      'validateStoredSession.listenerAvailability',
      availabilityResponse,
      API_ENDPOINTS.listeners.myAvailability,
    );
  }

  if (profileResponse) {
    logAuthResponse('validateStoredSession.profile', profileResponse, API_ENDPOINTS.profile.me);
  }

  const liveProfile = profileResponse?.data?.data || storedUser || {};

  return {
    ...(storedUser || {}),
    ...liveProfile,
    listenerAvailability:
      availabilityResponse?.data?.data ||
      liveProfile.listenerAvailability ||
      storedUser?.listenerAvailability ||
      null,
  };
};
