import axios from 'axios';
import { API_BASE_URL, AUTH_DEBUG_ENABLED, LIVE_CONFIG_ERROR } from '../constants/api';

let accessToken = null;
let unauthorizedHandler = null;

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

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (isUnauthorizedApiError(error) && typeof unauthorizedHandler === 'function') {
      if (AUTH_DEBUG_ENABLED) {
        console.warn('[ExpoAuth] unauthorized API response detected', {
          url: error?.config?.url || null,
          method: error?.config?.method || null,
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

export const setApiUnauthorizedHandler = (handler) => {
  unauthorizedHandler = typeof handler === 'function' ? handler : null;
};
