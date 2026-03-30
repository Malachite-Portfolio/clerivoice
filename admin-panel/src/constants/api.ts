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

export const API_BASE_URL = normalizeApiBaseUrl(
  process.env.NEXT_PUBLIC_API_BASE_URL,
);

export const API_CONFIG_ERROR = API_BASE_URL
  ? ""
  : "Admin API is not configured. Set NEXT_PUBLIC_API_BASE_URL in environment variables.";

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
    summary: "/admin/dashboard/summary",
    revenueSeries: "/admin/dashboard/revenue-series",
    topHosts: "/admin/dashboard/top-hosts",
    recentSessions: "/admin/dashboard/recent-sessions",
    recentRecharges: "/admin/dashboard/recent-recharges",
  },
  hosts: {
    base: "/admin/hosts",
    bulkAction: "/admin/hosts/bulk-action",
    byId: (hostId: string) => `/admin/hosts/${hostId}`,
    action: (hostId: string, action: string) => `/admin/hosts/${hostId}/${action}`,
    sessions: (hostId: string) => `/admin/hosts/${hostId}/sessions`,
    pricingHistory: (hostId: string) => `/admin/hosts/${hostId}/pricing-history`,
  },
  referrals: {
    list: "/admin/referrals",
    settings: "/admin/referral-settings",
  },
  sessions: {
    live: "/admin/sessions/live",
    calls: "/admin/sessions/calls",
    chats: "/admin/sessions/chats",
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
    overview: "/admin/wallet/overview",
    transactions: "/admin/wallet/transactions",
    manualAdjustment: "/admin/wallet/manual-adjustment",
  },
} as const;
