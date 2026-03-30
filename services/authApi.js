import { API_BASE_URL, API_ENDPOINTS } from '../constants/api';
import { apiClient } from './apiClient';

const AUTH_DEBUG_ENABLED = typeof __DEV__ !== 'undefined' ? __DEV__ : false;

const sanitizeAuthDebugValue = (value) => {
  if (Array.isArray(value)) {
    return value.map(sanitizeAuthDebugValue);
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, nestedValue]) => {
        if (['accessToken', 'refreshToken', 'token', 'password', 'otp'].includes(key)) {
          return [key, '[REDACTED]'];
        }

        return [key, sanitizeAuthDebugValue(nestedValue)];
      })
    );
  }

  return value;
};

const logAuthRequest = (label, path, payload) => {
  if (!AUTH_DEBUG_ENABLED) {
    return;
  }

  console.log(`[ExpoAuth] ${label} request`, {
    url: `${API_BASE_URL}${path}`,
    payloadKeys: Object.keys(payload || {}),
  });
};

const logAuthResponse = (label, response) => {
  if (!AUTH_DEBUG_ENABLED) {
    return;
  }

  console.log(`[ExpoAuth] ${label} response`, {
    status: response.status,
    body: sanitizeAuthDebugValue(response.data),
  });
};

const logAuthError = (label, path, payload, error) => {
  if (!AUTH_DEBUG_ENABLED) {
    return;
  }

  console.warn(`[ExpoAuth] ${label} error`, {
    url: `${API_BASE_URL}${path}`,
    payloadKeys: Object.keys(payload || {}),
    status: error?.response?.status ?? null,
    body: sanitizeAuthDebugValue(error?.response?.data),
    message: error?.message || 'Unknown error',
  });
};

export const sendOtp = async (phone) => {
  const requestBody = {
    phone,
    purpose: 'LOGIN',
  };

  logAuthRequest('sendOtp', API_ENDPOINTS.auth.sendOtp, requestBody);

  try {
    const response = await apiClient.post(API_ENDPOINTS.auth.sendOtp, requestBody);
    logAuthResponse('sendOtp', response);
    return response.data.data;
  } catch (error) {
    logAuthError('sendOtp', API_ENDPOINTS.auth.sendOtp, requestBody, error);
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

  logAuthRequest('verifyOtp', API_ENDPOINTS.auth.verifyOtp, requestBody);

  try {
    const response = await apiClient.post(API_ENDPOINTS.auth.verifyOtp, requestBody);
    logAuthResponse('verifyOtp', response);
    return response.data.data;
  } catch (error) {
    logAuthError('verifyOtp', API_ENDPOINTS.auth.verifyOtp, requestBody, error);
    throw error;
  }
};

export const loginListener = async ({ phoneOrEmail, password }) => {
  const requestBody = {
    phoneOrEmail,
    password,
  };

  logAuthRequest('loginListener', API_ENDPOINTS.auth.listenerLogin, requestBody);

  try {
    const response = await apiClient.post(API_ENDPOINTS.auth.listenerLogin, requestBody);
    logAuthResponse('loginListener', response);
    return response.data.data;
  } catch (error) {
    logAuthError('loginListener', API_ENDPOINTS.auth.listenerLogin, requestBody, error);
    throw error;
  }
};

// Backward-compatible alias for existing imports.
export const loginUser = verifyOtp;
