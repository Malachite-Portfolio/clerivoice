import { API_ENDPOINTS } from "@/constants/api";
import { api } from "@/services/http";
import type { ApiResponse, LiveSession, PaginatedResponse } from "@/types";

type BackendPagination = {
  page?: number;
  limit?: number;
  total?: number;
  totalPages?: number;
};

type BackendSession = {
  id: string;
  status?: string | null;
  createdAt?: string | null;
  requestedAt?: string | null;
  startedAt?: string | null;
  endedAt?: string | null;
  durationSeconds?: number | null;
  billedMinutes?: number | null;
  totalAmount?: number | string | null;
  user?: {
    id?: string;
    displayName?: string | null;
  } | null;
  listener?: {
    id?: string;
    displayName?: string | null;
  } | null;
};

type BackendSessionsPayload = {
  items?: BackendSession[];
  pagination?: BackendPagination;
};

const ACTIVE_SESSION_STATUSES = new Set(["ACTIVE", "RINGING", "REQUESTED"]);

const toNumber = (value: unknown) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
};

const normalizeSessionStatus = (status?: string | null): LiveSession["status"] => {
  const normalized = String(status || "").toUpperCase();
  if (normalized === "ACTIVE") return "active";
  if (normalized === "RINGING" || normalized === "REQUESTED") return "ringing";
  if (normalized === "CANCELLED" || normalized === "MISSED" || normalized === "REJECTED") {
    return "cancelled";
  }
  return "ended";
};

const mapSession = (
  session: BackendSession,
  type: "call" | "chat",
): LiveSession => ({
  id: session.id,
  type,
  userName: String(session.user?.displayName || "Unknown user"),
  hostName: String(session.listener?.displayName || "Unknown host"),
  startTime: String(session.startedAt || session.requestedAt || session.createdAt || ""),
  runningDurationSeconds:
    toNumber(session.durationSeconds) || Math.max(0, toNumber(session.billedMinutes) * 60),
  currentBilling: toNumber(session.totalAmount),
  status: normalizeSessionStatus(session.status),
});

const fetchSessionPage = async (
  endpoint: string,
  params?: { page?: number; pageSize?: number; status?: string },
) => {
  const response = await api.get<ApiResponse<BackendSessionsPayload>>(endpoint, {
    params: {
      page: params?.page,
      limit: params?.pageSize,
    },
  });
  return response.data.data;
};

const normalizePaginated = (
  payload: BackendSessionsPayload,
  type: "call" | "chat",
): PaginatedResponse<LiveSession> => {
  const items = (payload.items || []).map((item) => mapSession(item, type));
  const pagination = payload.pagination || {};
  const page = Number(pagination.page || 1);
  const pageSize = Number(pagination.limit || items.length || 10);
  const totalCount = Number(pagination.total || items.length);
  const totalPages = Number(
    pagination.totalPages || Math.max(1, Math.ceil(totalCount / Math.max(1, pageSize))),
  );

  return {
    items,
    page,
    pageSize,
    totalCount,
    totalPages,
  };
};

export const sessionsService = {
  async getLiveSessions() {
    const [callData, chatData] = await Promise.all([
      fetchSessionPage(API_ENDPOINTS.sessions.calls, { page: 1, pageSize: 200 }),
      fetchSessionPage(API_ENDPOINTS.sessions.chats, { page: 1, pageSize: 200 }),
    ]);

    return [...(callData.items || []).map((item) => mapSession(item, "call")), ...(chatData.items || []).map((item) => mapSession(item, "chat"))]
      .filter((item) => ACTIVE_SESSION_STATUSES.has(item.status.toUpperCase()))
      .sort(
        (left, right) => new Date(right.startTime).getTime() - new Date(left.startTime).getTime(),
      );
  },

  async getCallSessions(params?: {
    page?: number;
    pageSize?: number;
    status?: string;
  }) {
    const data = await fetchSessionPage(API_ENDPOINTS.sessions.calls, params);
    const normalized = normalizePaginated(data, "call");
    if (!params?.status) {
      return normalized;
    }
    return {
      ...normalized,
      items: normalized.items.filter((item) => item.status === params.status),
    };
  },

  async getChatSessions(params?: {
    page?: number;
    pageSize?: number;
    status?: string;
  }) {
    const data = await fetchSessionPage(API_ENDPOINTS.sessions.chats, params);
    const normalized = normalizePaginated(data, "chat");
    if (!params?.status) {
      return normalized;
    }
    return {
      ...normalized,
      items: normalized.items.filter((item) => item.status === params.status),
    };
  },

  async forceEndSession(sessionId: string, reason: string) {
    const response = await api.post<
      ApiResponse<{
        sessionId: string;
        sessionType: "call" | "chat";
        status: string;
        endReason?: string | null;
        endedAt?: string | null;
        endedByAdminId?: string | null;
      }>
    >(API_ENDPOINTS.sessions.forceEnd(sessionId), {
      reason,
      sessionType: "auto",
    });

    return response.data.data;
  },
};
