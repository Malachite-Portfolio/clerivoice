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

  if (/\/api$/i.test(trimmed)) {
    return `${trimmed}/v1`;
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

  return apiBaseUrl.replace(/\/api(?:\/v\d+)?$/i, "");
};

const RAW_API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? process.env.NEXT_PUBLIC_API_URL;

export const API_BASE_URL = normalizeApiBaseUrl(RAW_API_BASE_URL);

export const API_CONFIG_ERROR = API_BASE_URL
  ? ""
  : "Admin API is not configured. Set NEXT_PUBLIC_API_BASE_URL (or NEXT_PUBLIC_API_URL) in environment variables.";

export const SOCKET_BASE_URL = buildSocketBaseUrl(
  process.env.NEXT_PUBLIC_SOCKET_URL,
  API_BASE_URL,
);

export const SOCKET_CONFIG_WARNING = SOCKET_BASE_URL
  ? ""
  : "Socket base URL is not configured. Set NEXT_PUBLIC_SOCKET_URL for realtime admin sync.";

export const API_ENDPOINTS = {
  auth: {
    login: "/admin/auth/login",
    refresh: "/admin/auth/refresh",
    logout: "/admin/auth/logout",
    me: "/admin/me",
  },
  app: {
    sidebar: "/admin/app/sidebar",
  },
  dashboard: {
    users: "/admin/users",
    listeners: "/admin/listeners",
    walletLedger: "/admin/wallet/ledger",
    callSessions: "/admin/sessions/call",
    chatSessions: "/admin/sessions/chat",
  },
  hosts: {
    base: "/admin/listeners",
    create: "/admin/listeners",
    rates: (hostId: string) => `/admin/listeners/${hostId}/rates`,
    pricingHistory: (hostId: string) => `/admin/listeners/${hostId}/pricing-history`,
    status: (hostId: string) => `/admin/listeners/${hostId}/status`,
    visibility: (hostId: string) => `/admin/listeners/${hostId}/visibility`,
    remove: (hostId: string) => `/admin/listeners/${hostId}/remove`,
  },
  referrals: {
    list: "/admin/referrals",
    settings: "/admin/referral-rule",
  },
  sessions: {
    calls: "/admin/sessions/call",
    chats: "/admin/sessions/chat",
    forceEnd: (sessionId: string) => `/admin/sessions/${sessionId}/end`,
  },
  settings: {
    base: "/admin/settings",
  },
  support: {
    tickets: "/admin/support/tickets",
    byId: (ticketId: string) => `/admin/support/tickets/${ticketId}`,
  },
  users: {
    base: "/admin/users",
    byId: (userId: string) => `/admin/users/${userId}`,
    creditWallet: (userId: string) => `/admin/users/${userId}/credit-wallet`,
    debitWallet: (userId: string) => `/admin/users/${userId}/debit-wallet`,
    suspend: (userId: string) => `/admin/users/${userId}/suspend`,
  },
  wallet: {
    ledger: "/admin/wallet/ledger",
    manualAdjustment: "/admin/wallet/adjust",
  },
  withdrawals: {
    list: "/admin/withdrawals",
    byId: (withdrawalId: string) => `/admin/withdrawals/${withdrawalId}`,
    updateStatus: (withdrawalId: string) =>
      `/admin/withdrawal/${withdrawalId}/status`,
    updateNote: (withdrawalId: string) =>
      `/admin/withdrawal/${withdrawalId}/note`,
    updateReference: (withdrawalId: string) =>
      `/admin/withdrawal/${withdrawalId}/reference`,
  },
} as const;
