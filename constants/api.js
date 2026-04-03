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

const appFlavorFromEnv =
  process.env.EXPO_PUBLIC_APP_FLAVOR || process.env.EXPO_PUBLIC_APP_MODE || 'user';
const authDebugValue = String(process.env.EXPO_PUBLIC_AUTH_DEBUG || '').trim().toLowerCase();
const authClearOnStartupValue = String(process.env.EXPO_PUBLIC_AUTH_CLEAR_ON_STARTUP_ONCE || '')
  .trim()
  .toLowerCase();
const expoPushProjectIdValue = String(process.env.EXPO_PUBLIC_EXPO_PROJECT_ID || '')
  .trim();

export const API_BASE_URL = normalizeApiBaseUrl(process.env.EXPO_PUBLIC_API_BASE_URL);

export const SOCKET_BASE_URL = buildSocketBaseUrl(
  process.env.EXPO_PUBLIC_SOCKET_URL,
  API_BASE_URL
);

export const APP_FLAVOR =
  appFlavorFromEnv.trim().toLowerCase() === 'listener' ? 'listener' : 'user';
export const APP_MODE = APP_FLAVOR;
export const IS_LISTENER_APP = APP_FLAVOR === 'listener';
export const IS_USER_APP = APP_FLAVOR === 'user';

export const AGORA_CHAT_APP_KEY = process.env.EXPO_PUBLIC_AGORA_CHAT_APP_KEY || '';
export const AUTH_DEBUG_ENABLED =
  authDebugValue === 'true' || (typeof __DEV__ !== 'undefined' ? __DEV__ : false);
export const AUTH_CLEAR_ON_STARTUP_ONCE_ENABLED = authClearOnStartupValue === 'true';
export const EXPO_PUSH_PROJECT_ID = expoPushProjectIdValue;

export const API_ENDPOINTS = {
  profile: {
    me: '/me',
    uploadAvatar: '/me/avatar/upload',
  },
  listeners: {
    list: '/listeners',
    dashboard: '/listeners/me/dashboard',
    myAvailability: '/listeners/me/availability',
    availability: (listenerId) => `/listeners/${listenerId}/availability`,
  },
  call: {
    request: '/call/request',
    accept: '/call/accept',
    reject: '/call/reject',
    sessions: '/call/sessions',
    session: (sessionId) => `/call/sessions/${sessionId}`,
    end: (sessionId) => `/call/${sessionId}/end`,
    token: (sessionId) => `/call/${sessionId}/token`,
  },
  chat: {
    request: '/chat/request',
    sessions: '/chat/sessions',
    end: (sessionId) => `/chat/${sessionId}/end`,
    token: (sessionId) => `/chat/${sessionId}/token`,
    messages: (sessionId) => `/chat/${sessionId}/messages`,
  },
  wallet: {
    summary: '/wallet/summary',
    history: '/wallet/history',
    plans: '/wallet/plans',
    createOrder: '/wallet/create-order',
    verifyPayment: '/wallet/verify-payment',
    applyCoupon: '/wallet/apply-coupon',
  },
  referral: {
    me: '/referral/me',
    history: '/referral/history',
    faq: '/referral/faq',
    applyCode: '/referral/apply-code',
  },
  agora: {
    rtcToken: '/agora/rtc-token',
    chatToken: '/agora/chat-token',
  },
  notifications: {
    registerDevice: '/notifications/device',
    unregisterDevice: '/notifications/device',
  },
};

export const LIVE_CONFIG_ERROR =
  !API_BASE_URL || !SOCKET_BASE_URL
    ? 'Live backend URL is not configured. Set EXPO_PUBLIC_API_BASE_URL and EXPO_PUBLIC_SOCKET_URL.'
    : '';
