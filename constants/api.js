const apiBaseUrlFromEnv = process.env.EXPO_PUBLIC_API_BASE_URL || '';
const socketBaseUrlFromEnv = process.env.EXPO_PUBLIC_SOCKET_URL || '';
const appModeFromEnv = process.env.EXPO_PUBLIC_APP_MODE || 'user';

export const API_BASE_URL = apiBaseUrlFromEnv.trim();

export const SOCKET_BASE_URL = socketBaseUrlFromEnv.trim();

export const APP_MODE = appModeFromEnv.trim().toLowerCase() === 'listener' ? 'listener' : 'user';

export const AGORA_CHAT_APP_KEY = process.env.EXPO_PUBLIC_AGORA_CHAT_APP_KEY || '';

export const AUTH_STORAGE_KEY = 'clarivoice_mobile_session';

export const LIVE_CONFIG_ERROR =
  !API_BASE_URL || !SOCKET_BASE_URL
    ? 'Live backend URL is not configured. Set EXPO_PUBLIC_API_BASE_URL and EXPO_PUBLIC_SOCKET_URL.'
    : '';
