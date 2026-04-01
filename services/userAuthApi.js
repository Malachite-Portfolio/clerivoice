import { apiClient } from './apiClient';
import { logAuthError, logAuthRequest, logAuthResponse } from './authRequestLogger';

export const USER_AUTH_ENDPOINTS = {
  sendOtp: '/auth/send-otp',
  verifyOtp: '/auth/verify-otp',
};

export const sendOtp = async (phone) => {
  const requestBody = {
    phone,
    purpose: 'LOGIN',
  };

  logAuthRequest('sendOtp', USER_AUTH_ENDPOINTS.sendOtp, requestBody);

  try {
    const response = await apiClient.post(USER_AUTH_ENDPOINTS.sendOtp, requestBody);
    logAuthResponse('sendOtp', response, USER_AUTH_ENDPOINTS.sendOtp);

    const data = response?.data?.data;
    if (!response?.data?.success || data?.otpSent !== true) {
      const invalidResponseError = new Error('OTP send was not acknowledged by backend.');
      invalidResponseError.response = response;
      throw invalidResponseError;
    }

    return {
      status: response?.status ?? null,
      body: response?.data ?? null,
      data,
    };
  } catch (error) {
    logAuthError('sendOtp', USER_AUTH_ENDPOINTS.sendOtp, requestBody, error);
    throw error;
  }
};

export const verifyOtp = async ({ phone, otp, displayName }) => {
  const requestBody = {
    phone,
    otp,
    purpose: 'LOGIN',
    displayName,
  };

  logAuthRequest('verifyOtp', USER_AUTH_ENDPOINTS.verifyOtp, requestBody);

  try {
    const response = await apiClient.post(USER_AUTH_ENDPOINTS.verifyOtp, requestBody);
    logAuthResponse('verifyOtp', response, USER_AUTH_ENDPOINTS.verifyOtp);
    return response.data.data;
  } catch (error) {
    logAuthError('verifyOtp', USER_AUTH_ENDPOINTS.verifyOtp, requestBody, error);
    throw error;
  }
};
