import { apiClient } from './apiClient';
import { logAuthError, logAuthRequest, logAuthResponse } from './authRequestLogger';
import { getAuthDeviceContext } from './authDeviceContext';

export const LISTENER_AUTH_ENDPOINTS = {
  sendOtp: '/auth/send-listener-otp',
  verifyOtp: '/auth/verify-listener-otp',
};

const USER_AUTH_FALLBACK_ENDPOINTS = {
  sendOtp: '/auth/send-otp',
  verifyOtp: '/auth/verify-otp',
};

const shouldFallbackToUserOtpEndpoints = (error) => {
  const status = error?.response?.status ?? null;
  const code = String(error?.response?.data?.code || '').trim().toUpperCase();

  if (status === 404) {
    return true;
  }

  if (status === 403 && (!code || code === 'LISTENER_TEST_AUTH_DISABLED')) {
    return true;
  }

  return false;
};

const assertOtpSendAcknowledged = (response) => {
  const data = response?.data?.data;
  if (!response?.data?.success || data?.otpSent !== true) {
    const invalidResponseError = new Error('Listener OTP send was not acknowledged by backend.');
    invalidResponseError.response = response;
    throw invalidResponseError;
  }

  return data;
};

export const sendListenerOtp = async (phone) => {
  const requestBody = {
    phone,
    purpose: 'LOGIN',
  };

  logAuthRequest('sendListenerOtp', LISTENER_AUTH_ENDPOINTS.sendOtp, requestBody);

  try {
    const response = await apiClient.post(LISTENER_AUTH_ENDPOINTS.sendOtp, requestBody, {
      skipAuth: true,
    });
    logAuthResponse('sendListenerOtp', response, LISTENER_AUTH_ENDPOINTS.sendOtp);
    const data = assertOtpSendAcknowledged(response);

    return {
      status: response?.status ?? null,
      body: response?.data ?? null,
      data,
    };
  } catch (primaryError) {
    if (shouldFallbackToUserOtpEndpoints(primaryError)) {
      logAuthRequest('sendListenerOtpFallback', USER_AUTH_FALLBACK_ENDPOINTS.sendOtp, requestBody);
      try {
        const fallbackResponse = await apiClient.post(USER_AUTH_FALLBACK_ENDPOINTS.sendOtp, requestBody, {
          skipAuth: true,
        });
        logAuthResponse(
          'sendListenerOtpFallback',
          fallbackResponse,
          USER_AUTH_FALLBACK_ENDPOINTS.sendOtp,
        );

        const fallbackData = assertOtpSendAcknowledged(fallbackResponse);
        return {
          status: fallbackResponse?.status ?? null,
          body: fallbackResponse?.data ?? null,
          data: fallbackData,
        };
      } catch (fallbackError) {
        logAuthError(
          'sendListenerOtpFallback',
          USER_AUTH_FALLBACK_ENDPOINTS.sendOtp,
          requestBody,
          fallbackError,
        );
        throw fallbackError;
      }
    }

    const error = primaryError;
    logAuthError('sendListenerOtp', LISTENER_AUTH_ENDPOINTS.sendOtp, requestBody, error);
    throw error;
  }
};

export const verifyListenerOtp = async ({ phone, otp }) => {
  const deviceContext = await getAuthDeviceContext();
  const requestBody = {
    phone,
    otp,
    purpose: 'LOGIN',
    deviceId: deviceContext?.deviceId || undefined,
    deviceInfo: deviceContext?.deviceInfo || undefined,
  };

  logAuthRequest('verifyListenerOtp', LISTENER_AUTH_ENDPOINTS.verifyOtp, requestBody);

  try {
    const response = await apiClient.post(LISTENER_AUTH_ENDPOINTS.verifyOtp, requestBody, {
      skipAuth: true,
    });
    logAuthResponse('verifyListenerOtp', response, LISTENER_AUTH_ENDPOINTS.verifyOtp);
    return response.data.data;
  } catch (primaryError) {
    if (shouldFallbackToUserOtpEndpoints(primaryError)) {
      logAuthRequest('verifyListenerOtpFallback', USER_AUTH_FALLBACK_ENDPOINTS.verifyOtp, requestBody);
      try {
        const fallbackResponse = await apiClient.post(
          USER_AUTH_FALLBACK_ENDPOINTS.verifyOtp,
          requestBody,
          {
            skipAuth: true,
          },
        );
        logAuthResponse(
          'verifyListenerOtpFallback',
          fallbackResponse,
          USER_AUTH_FALLBACK_ENDPOINTS.verifyOtp,
        );
        return fallbackResponse.data.data;
      } catch (fallbackError) {
        logAuthError(
          'verifyListenerOtpFallback',
          USER_AUTH_FALLBACK_ENDPOINTS.verifyOtp,
          requestBody,
          fallbackError,
        );
        throw fallbackError;
      }
    }

    const error = primaryError;
    logAuthError('verifyListenerOtp', LISTENER_AUTH_ENDPOINTS.verifyOtp, requestBody, error);
    throw error;
  }
};
