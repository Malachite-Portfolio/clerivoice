import { API_ENDPOINTS } from "@/constants/api";
import { api } from "@/services/http";
import type { ApiResponse, PaginatedResponse, User } from "@/types";

type BackendPagination = {
  page?: number;
  limit?: number;
  total?: number;
  totalPages?: number;
};

type BackendUser = {
  id: string;
  displayName?: string | null;
  phone?: string | null;
  email?: string | null;
  referralCode?: string | { code?: string | null } | null;
  totalRecharge?: number | string | null;
  totalSpent?: number | string | null;
  status?: string | null;
  createdAt?: string;
  wallet?: {
    balance?: number | string | null;
  } | null;
};

type BackendUsersPayload = {
  items?: BackendUser[];
  pagination?: BackendPagination;
};

const toNumber = (value: unknown) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
};

const toOptionalNumber = (value: unknown) => {
  if (value === undefined || value === null) {
    return null;
  }
  return toNumber(value);
};

const normalizeStatus = (status?: string | null): User["status"] => {
  const normalized = String(status || "").toUpperCase();
  if (normalized === "ACTIVE") return "active";
  if (normalized === "BLOCKED") return "blocked";
  if (normalized === "DELETED") return "inactive";
  return "inactive";
};

const mapUser = (item: BackendUser): User => ({
  id: item.id,
  name: String(item.displayName || "Unnamed user"),
  phone: String(item.phone || "-"),
  email: item.email || undefined,
  referralCode:
    typeof item.referralCode === "string"
      ? item.referralCode
      : item.referralCode?.code || null,
  walletBalance: toNumber(item.wallet?.balance),
  totalRecharge: toOptionalNumber(item.totalRecharge),
  totalSpent: toOptionalNumber(item.totalSpent),
  status: normalizeStatus(item.status),
  joinedAt: String(item.createdAt || new Date().toISOString()),
});

const normalizePaginatedUsers = (
  payload: BackendUsersPayload,
): PaginatedResponse<User> => {
  const items = (payload.items || []).map(mapUser);
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

const manualWalletAdjust = async (
  userId: string,
  action: "CREDIT" | "DEBIT",
  amount: number,
  reason: string,
) => {
  const response = await api.post<ApiResponse<{ success: true }>>(
    API_ENDPOINTS.wallet.manualAdjustment,
    { userId, action, amount, reason },
  );
  return response.data.data;
};

export const usersService = {
  async getUsers(params?: {
    page?: number;
    pageSize?: number;
    search?: string;
    status?: string;
  }) {
    const response = await api.get<ApiResponse<BackendUsersPayload>>(
      API_ENDPOINTS.users.base,
      {
        params: {
          page: params?.page,
          limit: params?.pageSize,
          search: params?.search,
          status: params?.status,
        },
      },
    );
    return normalizePaginatedUsers(response.data.data);
  },

  async getUserById(userId: string) {
    const users = await usersService.getUsers({ page: 1, pageSize: 200 });
    const found = users.items.find((item) => item.id === userId);
    if (!found) {
      throw new Error("User detail endpoint is not available in backend.");
    }
    return found;
  },

  async creditWallet(userId: string, amount: number, reason: string) {
    return manualWalletAdjust(userId, "CREDIT", amount, reason);
  },

  async debitWallet(userId: string, amount: number, reason: string) {
    return manualWalletAdjust(userId, "DEBIT", amount, reason);
  },

  async suspendUser(_userId: string, _reason: string) {
    throw new Error("Suspend user endpoint is not available in backend.");
  },
};
