const trimTrailingSlash = (value = '') => value.replace(/\/+$/, '');

const normalizeApiBaseUrl = (rawValue) => {
  const value = rawValue?.trim();
  if (!value) {
    return '';
  }

  const trimmed = trimTrailingSlash(value);
  if (/\/api\/v\d+$/i.test(trimmed)) {
    return trimmed;
  }

  if (/\/api$/i.test(trimmed)) {
    return `${trimmed}/v1`;
  }

  return `${trimmed}/api/v1`;
};

const buildSocketBaseUrl = (rawSocketUrl, apiBaseUrl) => {
  const socketUrl = rawSocketUrl?.trim();
  if (socketUrl) {
    return trimTrailingSlash(socketUrl);
  }

  if (!apiBaseUrl) {
    return '';
  }

  return apiBaseUrl.replace(/\/api(?:\/v\d+)?$/i, '');
};

const appModeFromEnv = process.env.EXPO_PUBLIC_APP_MODE || 'user';

export const API_BASE_URL = normalizeApiBaseUrl(process.env.EXPO_PUBLIC_API_BASE_URL);

export const SOCKET_BASE_URL = buildSocketBaseUrl(
  process.env.EXPO_PUBLIC_SOCKET_URL,
  API_BASE_URL
);

export const APP_MODE = appModeFromEnv.trim().toLowerCase() === 'listener' ? 'listener' : 'user';

export const AGORA_CHAT_APP_KEY = process.env.EXPO_PUBLIC_AGORA_CHAT_APP_KEY || '';

export const AUTH_STORAGE_KEY = 'clarivoice_mobile_session';

export const API_ENDPOINTS = {
  auth: {
    sendOtp: '/auth/send-otp',
    verifyOtp: '/auth/verify-otp',
    listenerLogin: '/auth/login-listener',
  },
  listeners: {
    list: '/listeners',
    myAvailability: '/listeners/me/availability',
    availability: (listenerId) => `/listeners/${listenerId}/availability`,
  },
  call: {
    request: '/call/request',
    accept: '/call/accept',
    reject: '/call/reject',
    sessions: '/call/sessions',
    end: (sessionId) => `/call/${sessionId}/end`,
    token: (sessionId) => `/call/${sessionId}/token`,
  },
  chat: {
    request: '/chat/request',
    accept: '/chat/accept',
    reject: '/chat/reject',
    sessions: '/chat/sessions',
    end: (sessionId) => `/chat/${sessionId}/end`,
    token: (sessionId) => `/chat/${sessionId}/token`,
    messages: (sessionId) => `/chat/${sessionId}/messages`,
  },
  wallet: {
    summary: '/wallet/summary',
  },
  agora: {
    rtcToken: '/agora/rtc-token',
    chatToken: '/agora/chat-token',
  },
};

export const LIVE_CONFIG_ERROR =
  !API_BASE_URL || !SOCKET_BASE_URL
    ? 'Live backend URL is not configured. Set EXPO_PUBLIC_API_BASE_URL and EXPO_PUBLIC_SOCKET_URL.'
    : '';
