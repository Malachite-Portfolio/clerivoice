import { API_ENDPOINTS } from '../constants/api';
import { isUnauthorizedApiError, apiClient } from './apiClient';
import { logAuthError, logAuthRequest, logAuthResponse } from './authRequestLogger';

export const validateStoredSession = async (storedUser = null) => {
  logAuthRequest('validateStoredSession.wallet', API_ENDPOINTS.wallet.summary, {});
  logAuthRequest('validateStoredSession.profile', API_ENDPOINTS.profile.me, {});

  const [walletResult, profileResult] = await Promise.allSettled([
    apiClient.get(API_ENDPOINTS.wallet.summary),
    apiClient.get(API_ENDPOINTS.profile.me),
  ]);

  const walletError = walletResult.status === 'rejected' ? walletResult.reason : null;
  const profileError = profileResult.status === 'rejected' ? profileResult.reason : null;

  if (walletError && isUnauthorizedApiError(walletError)) {
    logAuthError('validateStoredSession.wallet', API_ENDPOINTS.wallet.summary, {}, walletError);
    throw walletError;
  }

  if (profileError && isUnauthorizedApiError(profileError)) {
    logAuthError('validateStoredSession.profile', API_ENDPOINTS.profile.me, {}, profileError);
    throw profileError;
  }

  if (walletError && profileError) {
    logAuthError('validateStoredSession.wallet', API_ENDPOINTS.wallet.summary, {}, walletError);
    logAuthError('validateStoredSession.profile', API_ENDPOINTS.profile.me, {}, profileError);
    throw walletError;
  }

  const walletResponse = walletResult.status === 'fulfilled' ? walletResult.value : null;
  const profileResponse = profileResult.status === 'fulfilled' ? profileResult.value : null;

  if (walletResponse) {
    logAuthResponse('validateStoredSession.wallet', walletResponse, API_ENDPOINTS.wallet.summary);
  }

  if (profileResponse) {
    logAuthResponse('validateStoredSession.profile', profileResponse, API_ENDPOINTS.profile.me);
  }

  const liveProfile = profileResponse?.data?.data || storedUser || {};

  return {
    ...(storedUser || {}),
    ...liveProfile,
    wallet:
      liveProfile.wallet ||
      walletResponse?.data?.data ||
      storedUser?.wallet ||
      null,
  };
};
