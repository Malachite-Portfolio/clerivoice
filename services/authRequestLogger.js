import { API_BASE_URL, AUTH_DEBUG_ENABLED } from '../constants/api';

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
      }),
    );
  }

  return value;
};

const buildFinalUrl = (path) => `${API_BASE_URL}${path}`;

export const logAuthRequest = (label, path, payload) => {
  if (!AUTH_DEBUG_ENABLED) {
    return;
  }

  console.log(`[ExpoAuth] ${label} request`, {
    url: buildFinalUrl(path),
    payloadKeys: Object.keys(payload || {}),
    payload: sanitizeAuthDebugValue(payload),
  });
};

export const logAuthResponse = (label, response, fallbackPath = '') => {
  if (!AUTH_DEBUG_ENABLED) {
    return;
  }

  console.log(`[ExpoAuth] ${label} response`, {
    url: response?.config?.url
      ? `${response?.config?.baseURL || ''}${response.config.url}`
      : buildFinalUrl(fallbackPath),
    status: response?.status ?? null,
    body: sanitizeAuthDebugValue(response?.data),
  });
};

export const logAuthError = (label, path, payload, error) => {
  if (!AUTH_DEBUG_ENABLED) {
    return;
  }

  console.warn(`[ExpoAuth] ${label} error`, {
    url: buildFinalUrl(path),
    payloadKeys: Object.keys(payload || {}),
    payload: sanitizeAuthDebugValue(payload),
    status: error?.response?.status ?? null,
    body: sanitizeAuthDebugValue(error?.response?.data),
    message: error?.message || 'Unknown error',
  });
};
