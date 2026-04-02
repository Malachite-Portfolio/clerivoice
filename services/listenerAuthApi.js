import { apiClient } from './apiClient';
import { logAuthError, logAuthRequest, logAuthResponse } from './authRequestLogger';

export const LISTENER_AUTH_ENDPOINTS = {
  sendOtp: '/auth/send-listener-otp',
  verifyOtp: '/auth/verify-listener-otp',
};

export const sendListenerOtp = async (phone) => {
  const requestBody = {
    phone,
    purpose: 'LOGIN',
  };

  logAuthRequest('sendListenerOtp', LISTENER_AUTH_ENDPOINTS.sendOtp, requestBody);

  try {
    const response = await apiClient.post(LISTENER_AUTH_ENDPOINTS.sendOtp, requestBody);
    logAuthResponse('sendListenerOtp', response, LISTENER_AUTH_ENDPOINTS.sendOtp);

    const data = response?.data?.data;
    if (!response?.data?.success || data?.otpSent !== true) {
      const invalidResponseError = new Error('Listener OTP send was not acknowledged by backend.');
      invalidResponseError.response = response;
      throw invalidResponseError;
    }

    return {
      status: response?.status ?? null,
      body: response?.data ?? null,
      data,
    };
  } catch (error) {
    logAuthError('sendListenerOtp', LISTENER_AUTH_ENDPOINTS.sendOtp, requestBody, error);
    throw error;
  }
};

export const verifyListenerOtp = async ({ phone, otp }) => {
  const requestBody = {
    phone,
    otp,
    purpose: 'LOGIN',
  };

  logAuthRequest('verifyListenerOtp', LISTENER_AUTH_ENDPOINTS.verifyOtp, requestBody);

  try {
    const response = await apiClient.post(LISTENER_AUTH_ENDPOINTS.verifyOtp, requestBody);
    logAuthResponse('verifyListenerOtp', response, LISTENER_AUTH_ENDPOINTS.verifyOtp);
    return response.data.data;
  } catch (error) {
    logAuthError('verifyListenerOtp', LISTENER_AUTH_ENDPOINTS.verifyOtp, requestBody, error);
    throw error;
  }
};
