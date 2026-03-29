export const APP_NAME = "Clarivoice Admin";
export const APP_VERSION = "v2.0.0";

export const AUTH_STORAGE_KEY = "clarivoice_admin_auth";
export const AUTH_COOKIE_KEY = "clarivoice_admin_token";

const trimTrailingSlash = (value: string) => value.replace(/\/+$/, "");
const normalizeApiBaseUrl = (rawValue?: string) => {
  const value = rawValue?.trim();
  if (!value) {
    return "";
  }

  const trimmed = trimTrailingSlash(value);
  if (/\/api\/v\d+$/i.test(trimmed)) {
    return trimmed;
  }

  return `${trimmed}/api/v1`;
};

const buildSocketBaseUrl = (rawSocketUrl?: string, apiBaseUrl?: string) => {
  const socketUrl = rawSocketUrl?.trim();
  if (socketUrl) {
    return trimTrailingSlash(socketUrl);
  }

  if (!apiBaseUrl) {
    return "";
  }

  return apiBaseUrl.replace(/\/api\/v\d+$/i, "");
};

export const API_BASE_URL = normalizeApiBaseUrl(
  process.env.NEXT_PUBLIC_API_BASE_URL,
);

export const API_CONFIG_ERROR = API_BASE_URL
  ? ""
  : "Admin API is not configured. Set NEXT_PUBLIC_API_BASE_URL in Vercel project environment variables.";

export const SOCKET_BASE_URL = buildSocketBaseUrl(
  process.env.NEXT_PUBLIC_SOCKET_URL,
  API_BASE_URL,
);

export const SOCKET_CONFIG_WARNING = SOCKET_BASE_URL
  ? ""
  : "Socket base URL is not configured. Set NEXT_PUBLIC_SOCKET_URL for realtime admin sync.";

export const DEFAULT_PAGE_SIZE = 10;

export const ADMIN_ROLES = ["super_admin", "admin", "support_manager"] as const;

export const INSUFFICIENT_BALANCE_MESSAGE =
  "You do not have sufficient balance. Please recharge your wallet to continue.";
