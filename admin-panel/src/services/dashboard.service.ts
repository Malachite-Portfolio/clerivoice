import { API_ENDPOINTS } from "@/constants/api";
import { api } from "@/services/http";
import type {
  ApiResponse,
  DashboardSummary,
  LiveSession,
  RevenuePoint,
  TopEarningHost,
  WalletTransaction,
} from "@/types";

type ApiPagination = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

type PaginatedPayload<T> = {
  items: T[];
  pagination: ApiPagination;
};

type AdminUserRecord = {
  id: string;
  displayName?: string | null;
  phone?: string | null;
  role?: string | null;
  status?: string | null;
};

type AdminListenerRecord = {
  id: string;
  userId: string;
  availability?: string | null;
  isEnabled?: boolean | null;
  user?: AdminUserRecord | null;
};

type AdminSessionRecord = {
  id: string;
  status?: string | null;
  createdAt?: string | null;
  requestedAt?: string | null;
  startedAt?: string | null;
  endedAt?: string | null;
  durationSeconds?: number | null;
  billedMinutes?: number | null;
  totalAmount?: number | string | null;
  user?: { id?: string; displayName?: string | null } | null;
  listener?: { id?: string; displayName?: string | null } | null;
};

type WalletLedgerRecord = {
  id: string;
  userId: string;
  type: string;
  status?: string | null;
  amount: number | string;
  createdAt: string;
  user?: { id?: string; displayName?: string | null } | null;
  metadata?: Record<string, unknown> | null;
};

const DAY_MS = 24 * 60 * 60 * 1000;
const LIVE_STATUSES = new Set(["ACTIVE", "RINGING", "REQUESTED"]);
const RECENT_LIMIT = 20;
const LIST_LIMIT = 500;
const MAX_PAGE_FETCH = 20;

const getNumber = (value: unknown) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
};

const toLocalDayKey = (dateInput: Date | string) => {
  const date = new Date(dateInput);
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const buildRecentDayKeys = (days: number) => {
  const today = new Date();
  const keys: string[] = [];

  for (let index = days - 1; index >= 0; index -= 1) {
    const date = new Date(today.getTime() - index * DAY_MS);
    keys.push(toLocalDayKey(date));
  }

  return keys;
};

const getSessionTimestamp = (session: AdminSessionRecord) =>
  session.startedAt || session.requestedAt || session.createdAt || new Date().toISOString();

const isLiveStatus = (status?: string | null) => LIVE_STATUSES.has(String(status || "").toUpperCase());

const mapStatusToLiveSession = (status?: string | null): LiveSession["status"] => {
  const normalized = String(status || "").toUpperCase();
  if (normalized === "ACTIVE") return "active";
  if (normalized === "RINGING" || normalized === "REQUESTED") return "ringing";
  if (normalized === "CANCELLED" || normalized === "REJECTED" || normalized === "MISSED") {
    return "cancelled";
  }
  if (normalized === "ENDED") return "ended";
  return "ended";
};

const mapWalletStatus = (status?: string | null): WalletTransaction["status"] => {
  const normalized = String(status || "").toUpperCase();
  if (normalized === "PENDING") return "pending";
  if (normalized === "FAILED") return "failed";
  if (normalized === "REFUNDED" || normalized === "REVERSED") return "refunded";
  return "success";
};

const mapWalletType = (type?: string | null): WalletTransaction["type"] => {
  const normalized = String(type || "").toUpperCase();
  if (normalized === "RECHARGE") return "recharge";
  if (normalized === "CALL_DEBIT") return "call_debit";
  if (normalized === "CHAT_DEBIT") return "chat_debit";
  if (normalized === "REFERRAL_BONUS") return "referral_bonus";
  if (normalized === "REFUND") return "refund";
  if (normalized === "ADMIN_CREDIT") return "admin_credit";
  if (normalized === "ADMIN_DEBIT") return "admin_debit";
  return "promo_credit";
};

const mapSessionToLiveSession = (
  session: AdminSessionRecord,
  type: LiveSession["type"],
): LiveSession => {
  const startedAt = getSessionTimestamp(session);
  const durationSeconds =
    getNumber(session.durationSeconds) ||
    Math.max(getNumber(session.billedMinutes) * 60, 0);

  return {
    id: session.id,
    type,
    userName: String(session.user?.displayName || "Unknown user"),
    hostName: String(session.listener?.displayName || "Unknown host"),
    startTime: startedAt,
    runningDurationSeconds: durationSeconds,
    currentBilling: getNumber(session.totalAmount),
    status: mapStatusToLiveSession(session.status),
  };
};

const getPageData = async <T>(
  path: string,
  page: number,
  limit: number,
): Promise<PaginatedPayload<T>> => {
  const response = await api.get<ApiResponse<PaginatedPayload<T>>>(path, {
    params: { page, limit },
  });
  return response.data.data;
};

const fetchRecordsSince = async <T extends { createdAt?: string | null }>(
  path: string,
  since: Date,
) => {
  const records: T[] = [];
  const sinceTs = since.getTime();
  let page = 1;
  let totalPages = 1;

  while (page <= totalPages && page <= MAX_PAGE_FETCH) {
    const data = await getPageData<T>(path, page, LIST_LIMIT);
    totalPages = data.pagination?.totalPages || 1;
    const pageItems = data.items || [];

    if (!pageItems.length) {
      break;
    }

    for (const item of pageItems) {
      const timestamp = new Date(item.createdAt || 0).getTime();
      if (timestamp >= sinceTs) {
        records.push(item);
      }
    }

    const oldestTimestamp = new Date(pageItems[pageItems.length - 1]?.createdAt || 0).getTime();
    if (Number.isFinite(oldestTimestamp) && oldestTimestamp < sinceTs) {
      break;
    }

    page += 1;
  }

  return records;
};

const fetchAllListeners = async () => {
  const firstPage = await getPageData<AdminListenerRecord>(
    API_ENDPOINTS.dashboard.listeners,
    1,
    LIST_LIMIT,
  );
  const listeners = [...(firstPage.items || [])];
  const totalPages = Math.min(firstPage.pagination?.totalPages || 1, MAX_PAGE_FETCH);

  for (let page = 2; page <= totalPages; page += 1) {
    const nextPage = await getPageData<AdminListenerRecord>(
      API_ENDPOINTS.dashboard.listeners,
      page,
      LIST_LIMIT,
    );
    listeners.push(...(nextPage.items || []));
  }

  return {
    listeners,
    totalHosts: getNumber(firstPage.pagination?.total),
  };
};

const fetchRecentSessions = async () => {
  const [callPage, chatPage] = await Promise.all([
    getPageData<AdminSessionRecord>(API_ENDPOINTS.dashboard.callSessions, 1, RECENT_LIMIT),
    getPageData<AdminSessionRecord>(API_ENDPOINTS.dashboard.chatSessions, 1, RECENT_LIMIT),
  ]);

  const mapped = [
    ...(callPage.items || []).map((session) => mapSessionToLiveSession(session, "call")),
    ...(chatPage.items || []).map((session) => mapSessionToLiveSession(session, "chat")),
  ];

  mapped.sort(
    (left, right) => new Date(right.startTime).getTime() - new Date(left.startTime).getTime(),
  );

  return mapped.slice(0, 10);
};

const fetchTodayWalletLedger = async () => {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  return fetchRecordsSince<WalletLedgerRecord>(API_ENDPOINTS.dashboard.walletLedger, startOfDay);
};

export const dashboardService = {
  async summary() {
    const [usersPage, listenersMeta, todayLedger, callPage, chatPage] = await Promise.all([
      getPageData<AdminUserRecord>(API_ENDPOINTS.dashboard.users, 1, 1),
      fetchAllListeners(),
      fetchTodayWalletLedger(),
      getPageData<AdminSessionRecord>(API_ENDPOINTS.dashboard.callSessions, 1, LIST_LIMIT),
      getPageData<AdminSessionRecord>(API_ENDPOINTS.dashboard.chatSessions, 1, LIST_LIMIT),
    ]);

    const activeHosts = listenersMeta.listeners.filter((listener) => {
      const enabled = listener.isEnabled !== false;
      const available = String(listener.availability || "").toUpperCase() === "ONLINE";
      const activeUser = String(listener.user?.status || "").toUpperCase() === "ACTIVE";
      return enabled && available && activeUser;
    }).length;

    const pendingHostApprovals = null;

    const rechargeToday = todayLedger
      .filter((item) => String(item.type).toUpperCase() === "RECHARGE")
      .reduce((sum, item) => sum + getNumber(item.amount), 0);

    const revenueToday = todayLedger
      .filter((item) => {
        const type = String(item.type).toUpperCase();
        return type === "CALL_DEBIT" || type === "CHAT_DEBIT";
      })
      .reduce((sum, item) => sum + getNumber(item.amount), 0);

    const liveCallsNow = (callPage.items || []).filter((item) => isLiveStatus(item.status)).length;
    const liveChatsNow = (chatPage.items || []).filter((item) => isLiveStatus(item.status)).length;

    return {
      totalUsers: getNumber(usersPage.pagination?.total),
      totalHosts: listenersMeta.totalHosts,
      activeHosts,
      liveCallsNow,
      liveChatsNow,
      rechargeToday,
      revenueToday,
      pendingHostApprovals,
    } satisfies DashboardSummary;
  },

  async revenueSeries() {
    const keys = buildRecentDayKeys(7);
    const keySet = new Set(keys);
    const seriesMap = new Map<
      string,
      { revenue: number; recharge: number; callMinutes: number; chatSessions: number }
    >();

    keys.forEach((key) => {
      seriesMap.set(key, { revenue: 0, recharge: 0, callMinutes: 0, chatSessions: 0 });
    });

    const rangeStart = new Date();
    rangeStart.setHours(0, 0, 0, 0);
    rangeStart.setDate(rangeStart.getDate() - 6);

    const [walletLedger, callSessions, chatSessions] = await Promise.all([
      fetchRecordsSince<WalletLedgerRecord>(API_ENDPOINTS.dashboard.walletLedger, rangeStart),
      fetchRecordsSince<AdminSessionRecord>(API_ENDPOINTS.dashboard.callSessions, rangeStart),
      fetchRecordsSince<AdminSessionRecord>(API_ENDPOINTS.dashboard.chatSessions, rangeStart),
    ]);

    walletLedger.forEach((item) => {
      const dayKey = toLocalDayKey(item.createdAt);
      if (!keySet.has(dayKey)) {
        return;
      }

      const bucket = seriesMap.get(dayKey);
      if (!bucket) {
        return;
      }

      const amount = getNumber(item.amount);
      const normalizedType = String(item.type).toUpperCase();

      if (normalizedType === "RECHARGE") {
        bucket.recharge += amount;
      }

      if (normalizedType === "CALL_DEBIT" || normalizedType === "CHAT_DEBIT") {
        bucket.revenue += amount;
      }
    });

    callSessions.forEach((session) => {
      const dayKey = toLocalDayKey(getSessionTimestamp(session));
      if (!keySet.has(dayKey)) {
        return;
      }

      const bucket = seriesMap.get(dayKey);
      if (!bucket) {
        return;
      }

      const minutes = Math.max(
        Math.ceil(getNumber(session.durationSeconds) / 60) || getNumber(session.billedMinutes),
        0,
      );
      bucket.callMinutes += minutes;
    });

    chatSessions.forEach((session) => {
      const dayKey = toLocalDayKey(getSessionTimestamp(session));
      if (!keySet.has(dayKey)) {
        return;
      }

      const bucket = seriesMap.get(dayKey);
      if (!bucket) {
        return;
      }

      bucket.chatSessions += 1;
    });

    return keys.map((key) => {
      const date = new Date(`${key}T00:00:00`);
      const bucket = seriesMap.get(key) || {
        revenue: 0,
        recharge: 0,
        callMinutes: 0,
        chatSessions: 0,
      };

      return {
        label: date.toLocaleDateString("en-IN", { weekday: "short" }),
        revenue: bucket.revenue,
        recharge: bucket.recharge,
        callMinutes: bucket.callMinutes,
        chatSessions: bucket.chatSessions,
      } satisfies RevenuePoint;
    });
  },

  async topEarningHosts() {
    const rangeStart = new Date();
    rangeStart.setDate(rangeStart.getDate() - 30);

    const [callSessions, chatSessions] = await Promise.all([
      fetchRecordsSince<AdminSessionRecord>(API_ENDPOINTS.dashboard.callSessions, rangeStart),
      fetchRecordsSince<AdminSessionRecord>(API_ENDPOINTS.dashboard.chatSessions, rangeStart),
    ]);

    const earnings = new Map<string, { hostName: string; amount: number }>();

    for (const session of [...callSessions, ...chatSessions]) {
      const hostId = String(session.listener?.id || "");
      if (!hostId) {
        continue;
      }

      const hostName = String(session.listener?.displayName || "Unknown Host");
      const amount = getNumber(session.totalAmount);
      const existing = earnings.get(hostId);

      if (existing) {
        existing.amount += amount;
      } else {
        earnings.set(hostId, { hostName, amount });
      }
    }

    return [...earnings.values()]
      .sort((left, right) => right.amount - left.amount)
      .slice(0, 5)
      .map((item) => ({
        hostName: item.hostName,
        amount: item.amount,
      } satisfies TopEarningHost));
  },

  async recentSessions() {
    return fetchRecentSessions();
  },

  async recentRecharges() {
    const page = await getPageData<WalletLedgerRecord>(
      API_ENDPOINTS.dashboard.walletLedger,
      1,
      RECENT_LIMIT,
    );

    return (page.items || [])
      .filter((item) => String(item.type).toUpperCase() === "RECHARGE")
      .slice(0, 10)
      .map(
        (item) =>
          ({
            id: item.id,
            userName: String(item.user?.displayName || "Unknown user"),
            userId: item.userId,
            type: mapWalletType(item.type),
            amount: getNumber(item.amount),
            status: mapWalletStatus(item.status),
            balanceBefore: 0,
            balanceAfter: 0,
            paymentMethod: String(item.metadata?.paymentMethod || item.metadata?.method || "-"),
            createdAt: item.createdAt,
          }) satisfies WalletTransaction,
      );
  },
};
