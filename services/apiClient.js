import axios from 'axios';
import { API_BASE_URL, AUTH_DEBUG_ENABLED, LIVE_CONFIG_ERROR } from '../constants/api';

let accessToken = null;
let refreshToken = null;
let unauthorizedHandler = null;
let tokenRefreshHandler = null;

export const apiClient = axios.create({
  baseURL: API_BASE_URL || undefined,
  timeout: 15000,
});

apiClient.interceptors.request.use((config) => {
  if (!API_BASE_URL) {
    return Promise.reject(new Error(LIVE_CONFIG_ERROR));
  }

  config.headers = config.headers || {};

  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`;
  }
  return config;
});

export const isUnauthorizedApiError = (error) => {
  const status = error?.response?.status ?? null;
  const code = String(error?.response?.data?.code || '').trim().toUpperCase();
  const message = String(error?.response?.data?.message || error?.message || '').trim().toLowerCase();
  const hadAuthorizationHeader = Boolean(error?.config?.headers?.Authorization);

  if (code === 'INVALID_TOKEN' || code === 'UNAUTHORIZED' || message === 'invalid token') {
    return true;
  }

  return status === 401 && hadAuthorizationHeader;
};

const isRefreshRequest = (config = {}) =>
  String(config?.url || '')
    .trim()
    .toLowerCase()
    .includes('/auth/refresh');

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const unauthorized = isUnauthorizedApiError(error);
    const requestConfig = error?.config || {};
    const canRetryWithRefresh =
      unauthorized &&
      !requestConfig?.__clarivoiceRetry &&
      !isRefreshRequest(requestConfig) &&
      typeof tokenRefreshHandler === 'function';

    if (canRetryWithRefresh) {
      requestConfig.__clarivoiceRetry = true;

      try {
        if (AUTH_DEBUG_ENABLED) {
          console.warn('[ExpoAuth] attempting access token refresh after 401', {
            url: requestConfig?.url || null,
            method: requestConfig?.method || null,
            hasRefreshToken: Boolean(refreshToken),
          });
        }

        const refreshedAccessToken = await tokenRefreshHandler({
          error,
          requestConfig,
          refreshToken,
        });

        if (refreshedAccessToken) {
          setApiAccessToken(refreshedAccessToken);
          requestConfig.headers = requestConfig.headers || {};
          requestConfig.headers.Authorization = `Bearer ${refreshedAccessToken}`;

          if (AUTH_DEBUG_ENABLED) {
            console.warn('[ExpoAuth] retrying request after token refresh', {
              url: requestConfig?.url || null,
              method: requestConfig?.method || null,
            });
          }

          return apiClient(requestConfig);
        }
      } catch (refreshError) {
        if (AUTH_DEBUG_ENABLED) {
          console.warn('[ExpoAuth] access token refresh failed', {
            message: refreshError?.response?.data?.message || refreshError?.message || 'Unknown error',
            status: refreshError?.response?.status ?? null,
          });
        }
      }
    }

    if (unauthorized && typeof unauthorizedHandler === 'function') {
      if (AUTH_DEBUG_ENABLED) {
        console.warn('[ExpoAuth] unauthorized API response detected', {
          url: requestConfig?.url || null,
          method: requestConfig?.method || null,
          status: error?.response?.status ?? null,
          code: error?.response?.data?.code || null,
        });
      }

      await unauthorizedHandler(error);
    }

    return Promise.reject(error);
  },
);

export const setApiAccessToken = (token) => {
  accessToken = token || null;
};

export const setApiRefreshToken = (token) => {
  refreshToken = token || null;
};

export const setApiUnauthorizedHandler = (handler) => {
  unauthorizedHandler = typeof handler === 'function' ? handler : null;
};

export const setApiTokenRefreshHandler = (handler) => {
  tokenRefreshHandler = typeof handler === 'function' ? handler : null;
};
