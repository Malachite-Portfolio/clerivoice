import { API_ENDPOINTS } from "@/constants/api";
import { api } from "@/services/http";
import type {
  ApiResponse,
  Host,
  HostAction,
  HostCreatePayload,
  HostListQuery,
  HostPriceLog,
  HostSessionHistoryItem,
  PaginatedResponse,
} from "@/types";

type BackendPagination = {
  page?: number;
  limit?: number;
  total?: number;
  totalPages?: number;
};

type BackendListener = {
  id: string;
  userId: string;
  bio?: string | null;
  rating?: number | string | null;
  experienceYears?: number | null;
  languages?: string[] | null;
  category?: string | null;
  callRatePerMinute?: number | string | null;
  chatRatePerMinute?: number | string | null;
  availability?: string | null;
  isEnabled?: boolean | null;
  totalSessions?: number | null;
  createdAt?: string;
  updatedAt?: string;
  user?: {
    id: string;
    phone?: string | null;
    email?: string | null;
    displayName?: string | null;
    role?: string | null;
    status?: string | null;
    profileImageUrl?: string | null;
    createdAt?: string;
    updatedAt?: string;
  } | null;
};

type BackendPaginatedPayload<T> = {
  items?: T[];
  pagination?: BackendPagination;
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

type BackendPricingLog = {
  id: string;
  hostId?: string;
  changedBy?: string | null;
  oldCallRate?: number | string | null;
  newCallRate?: number | string | null;
  oldChatRate?: number | string | null;
  newChatRate?: number | string | null;
  changedAt?: string | null;
};

const PAGE_LIMIT = 50;
const MAX_PAGES = 10;

const toNumber = (value: unknown) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
};

const normalizeAccountStatus = (status?: string | null): Host["status"] => {
  const normalized = String(status || "").toUpperCase();
  if (normalized === "ACTIVE") return "active";
  if (normalized === "BLOCKED") return "blocked";
  if (normalized === "DELETED") return "inactive";
  return "inactive";
};

const normalizePresence = (availability?: string | null): Host["presence"] => {
  const normalized = String(availability || "").toUpperCase();
  if (normalized === "ONLINE") return "online";
  if (normalized === "BUSY") return "busy";
  return "offline";
};

const normalizeVerificationStatus = (listener: BackendListener): Host["verificationStatus"] => {
  if (listener.isEnabled === true) {
    return "verified";
  }
  return "pending";
};

const mapListenerToHost = (listener: BackendListener): Host => {
  const user = listener.user || null;
  const hostId = user?.id || listener.userId;

  return {
    id: hostId,
    hostId,
    fullName: String(user?.displayName || "Unnamed host"),
    displayName: String(user?.displayName || "Unnamed host"),
    phone: String(user?.phone || "-"),
    email: String(user?.email || "-"),
    gender: "other",
    age: 0,
    category: String(listener.category || "Uncategorized"),
    languages: listener.languages || [],
    experienceYears: listener.experienceYears || 0,
    rating: toNumber(listener.rating),
    reviewsCount: 0,
    quote: String(listener.bio || ""),
    bio: String(listener.bio || ""),
    skills: [],
    callRatePerMinute: toNumber(listener.callRatePerMinute),
    chatRatePerMinute: toNumber(listener.chatRatePerMinute),
    minChatBalance: 0,
    minCallBalance: 0,
    totalCalls: 0,
    totalChats: 0,
    totalMinutes: 0,
    completedSessions: listener.totalSessions || 0,
    cancellationRate: 0,
    revenueGenerated: 0,
    hostEarnings: 0,
    platformCommission: 0,
    status: normalizeAccountStatus(user?.status),
    verificationStatus: normalizeVerificationStatus(listener),
    visibility: listener.isEnabled === false ? "hidden" : "visible",
    presence: normalizePresence(listener.availability),
    featured: false,
    blockedNewSessions: listener.isEnabled === false,
    joinedAt: String(user?.createdAt || listener.createdAt || new Date().toISOString()),
    profileImageUrl: user?.profileImageUrl || undefined,
    coverImageUrl: undefined,
    availabilitySchedule: undefined,
    adminNotes: "",
  };
};

const mapListenerPageToHosts = (
  payload: BackendPaginatedPayload<BackendListener>,
): PaginatedResponse<Host> => {
  const items = (payload.items || []).map(mapListenerToHost);
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

const fetchListenerPage = async (page: number, limit: number) => {
  const response = await api.get<ApiResponse<BackendPaginatedPayload<BackendListener>>>(
    API_ENDPOINTS.hosts.base,
    { params: { page, limit } },
  );
  return response.data.data;
};

const findListenerById = async (hostId: string) => {
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const payload = await fetchListenerPage(page, PAGE_LIMIT);
    const items = payload.items || [];
    const match = items.find((item) => item.user?.id === hostId || item.userId === hostId);
    if (match) {
      return match;
    }
    if (!items.length || page >= Number(payload.pagination?.totalPages || 1)) {
      break;
    }
  }

  return null;
};

const mapActionToRequest = (
  hostId: string,
  action: HostAction,
): { method: "post" | "patch"; url: string; payload: Record<string, unknown> } => {
  switch (action) {
    case "approve":
      return {
        method: "patch",
        url: API_ENDPOINTS.hosts.status(hostId),
        payload: { userStatus: "ACTIVE", isEnabled: true, availability: "ONLINE" },
      };
    case "reject":
      return {
        method: "patch",
        url: API_ENDPOINTS.hosts.status(hostId),
        payload: { userStatus: "BLOCKED", isEnabled: false, availability: "OFFLINE" },
      };
    case "suspend":
      return {
        method: "patch",
        url: API_ENDPOINTS.hosts.status(hostId),
        payload: { userStatus: "BLOCKED", isEnabled: false, availability: "OFFLINE" },
      };
    case "reactivate":
      return {
        method: "patch",
        url: API_ENDPOINTS.hosts.status(hostId),
        payload: { userStatus: "ACTIVE", isEnabled: true },
      };
    case "hide":
      return {
        method: "patch",
        url: API_ENDPOINTS.hosts.visibility(hostId),
        payload: { visible: false },
      };
    case "show":
      return {
        method: "patch",
        url: API_ENDPOINTS.hosts.visibility(hostId),
        payload: { visible: true },
      };
    case "forceOffline":
      return {
        method: "patch",
        url: API_ENDPOINTS.hosts.status(hostId),
        payload: { availability: "OFFLINE" },
      };
    case "blockSessions":
      return {
        method: "patch",
        url: API_ENDPOINTS.hosts.status(hostId),
        payload: { isEnabled: false, availability: "OFFLINE" },
      };
    case "allowSessions":
      return {
        method: "patch",
        url: API_ENDPOINTS.hosts.status(hostId),
        payload: { isEnabled: true },
      };
    case "resetPassword":
    case "feature":
    case "unfeature":
      throw new Error(`Action '${action}' is not supported by current backend endpoints.`);
    default:
      throw new Error(`Unknown host action '${action}'.`);
  }
};

const fetchSessionPages = async (url: string, type: "call" | "chat") => {
  const sessions: BackendSession[] = [];
  let page = 1;
  let totalPages = 1;

  while (page <= totalPages && page <= MAX_PAGES) {
    const response = await api.get<ApiResponse<BackendPaginatedPayload<BackendSession>>>(url, {
      params: { page, limit: PAGE_LIMIT },
    });
    const payload = response.data.data;
    sessions.push(...(payload.items || []));
    totalPages = Number(payload.pagination?.totalPages || 1);
    if (!(payload.items || []).length) {
      break;
    }
    page += 1;
  }

  return sessions.map((session) => ({ session, type }));
};

export const hostsService = {
  async getHosts(query: HostListQuery = {}) {
    const response = await api.get<ApiResponse<BackendPaginatedPayload<BackendListener>>>(
      API_ENDPOINTS.hosts.base,
      {
        params: {
          page: query.page,
          limit: query.pageSize,
        },
      },
    );
    return mapListenerPageToHosts(response.data.data);
  },

  async createHost(payload: HostCreatePayload) {
    const normalizedEmail = String(payload.email || "").trim() || undefined;

    const response = await api.post<ApiResponse<BackendListener>>(API_ENDPOINTS.hosts.create, {
      fullName: payload.fullName,
      displayName: payload.displayName || payload.fullName,
      phone: payload.phone,
      email: normalizedEmail,
      password: payload.password,
      bio: payload.bio || payload.quote || undefined,
      category: payload.category || undefined,
      languages: Array.isArray(payload.languages)
        ? payload.languages.map((item) => item.trim()).filter(Boolean)
        : [],
      experienceYears: payload.experienceYears ?? 0,
      callRatePerMinute: payload.callRatePerMinute,
      chatRatePerMinute: payload.chatRatePerMinute,
      active: payload.active,
      visibleInApp: payload.visibleInApp,
      availability: payload.active ? "ONLINE" : "OFFLINE",
    });

    return mapListenerToHost(response.data.data);
  },

  async getHostById(hostId: string) {
    const listener = await findListenerById(hostId);
    if (!listener) {
      throw new Error("Host not found.");
    }
    return mapListenerToHost(listener);
  },

  async updateHost(hostId: string, payload: Partial<HostCreatePayload>) {
    const response = await api.patch<ApiResponse<BackendListener>>(
      API_ENDPOINTS.hosts.rates(hostId),
      {
        callRatePerMinute: payload.callRatePerMinute,
        chatRatePerMinute: payload.chatRatePerMinute,
      },
    );
    return mapListenerToHost(response.data.data);
  },

  async updateHostAction(hostId: string, action: HostAction) {
    const request = mapActionToRequest(hostId, action);
    const response =
      request.method === "post"
        ? await api.post<ApiResponse<BackendListener>>(request.url, request.payload)
        : await api.patch<ApiResponse<BackendListener>>(request.url, request.payload);
    return mapListenerToHost(response.data.data);
  },

  async bulkAction(hostIds: string[], action: HostAction) {
    let updatedCount = 0;

    for (const hostId of hostIds) {
      await hostsService.updateHostAction(hostId, action);
      updatedCount += 1;
    }

    return { updatedCount };
  },

  async getHostSessionHistory(hostId: string) {
    const [callSessions, chatSessions] = await Promise.all([
      fetchSessionPages(API_ENDPOINTS.sessions.calls, "call"),
      fetchSessionPages(API_ENDPOINTS.sessions.chats, "chat"),
    ]);

    const mapped: HostSessionHistoryItem[] = [...callSessions, ...chatSessions]
      .filter((item) => item.session.listener?.id === hostId)
      .map((item) => ({
        id: item.session.id,
        type: item.type,
        userName: String(item.session.user?.displayName || "Unknown user"),
        startedAt: String(
          item.session.startedAt || item.session.requestedAt || item.session.createdAt || "",
        ),
        endedAt: String(
          item.session.endedAt || item.session.startedAt || item.session.requestedAt || "",
        ),
        durationMinutes: Math.max(
          toNumber(item.session.billedMinutes),
          Math.ceil(toNumber(item.session.durationSeconds) / 60),
        ),
        billedAmount: toNumber(item.session.totalAmount),
        status: "ended",
      }));

    mapped.sort(
      (left, right) =>
        new Date(right.startedAt).getTime() - new Date(left.startedAt).getTime(),
    );

    return mapped;
  },

  async getHostPricingLogs(hostId: string): Promise<HostPriceLog[]> {
    const response = await api.get<
      ApiResponse<BackendPaginatedPayload<BackendPricingLog>>
    >(API_ENDPOINTS.hosts.pricingHistory(hostId), {
      params: {
        page: 1,
        limit: 200,
      },
    });

    return (response.data.data.items || []).map((item) => ({
      id: item.id,
      hostId: item.hostId || hostId,
      changedBy: String(item.changedBy || "Admin"),
      oldCallRate: toNumber(item.oldCallRate),
      newCallRate: toNumber(item.newCallRate),
      oldChatRate: toNumber(item.oldChatRate),
      newChatRate: toNumber(item.newChatRate),
      changedAt: String(item.changedAt || new Date().toISOString()),
    }));
  },
};
