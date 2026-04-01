import { API_ENDPOINTS } from '../constants/api';
import { apiClient } from './apiClient';
import { logAuthError, logAuthRequest, logAuthResponse } from './authRequestLogger';

export const validateStoredSession = async (storedUser = null) => {
  logAuthRequest('validateStoredSession.wallet', API_ENDPOINTS.wallet.summary, {});
  logAuthRequest('validateStoredSession.profile', API_ENDPOINTS.profile.me, {});

  try {
    const [walletResponse, profileResponse] = await Promise.all([
      apiClient.get(API_ENDPOINTS.wallet.summary),
      apiClient.get(API_ENDPOINTS.profile.me),
    ]);

    logAuthResponse('validateStoredSession.wallet', walletResponse, API_ENDPOINTS.wallet.summary);
    logAuthResponse('validateStoredSession.profile', profileResponse, API_ENDPOINTS.profile.me);

    const liveProfile = profileResponse.data.data || storedUser || {};

    return {
      ...(storedUser || {}),
      ...liveProfile,
      wallet: liveProfile.wallet || walletResponse.data.data || storedUser?.wallet || null,
    };
  } catch (error) {
    logAuthError('validateStoredSession', API_ENDPOINTS.wallet.summary, {}, error);
    throw error;
  }
};
