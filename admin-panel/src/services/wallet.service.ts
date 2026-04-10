import { API_ENDPOINTS } from "@/constants/api";
import { api } from "@/services/http";
import type {
  ApiResponse,
  PaginatedResponse,
  WalletOverview,
  WalletTransaction,
} from "@/types";

type BackendPagination = {
  page?: number;
  limit?: number;
  total?: number;
  totalPages?: number;
};

type BackendWalletLedgerItem = {
  id: string;
  userId: string;
  type?: string | null;
  amount?: number | string | null;
  status?: string | null;
  balanceBefore?: number | string | null;
  balanceAfter?: number | string | null;
  createdAt?: string;
  metadata?: Record<string, unknown> | null;
  user?: {
    id?: string;
    displayName?: string | null;
  } | null;
};

type BackendWalletLedgerPayload = {
  items?: BackendWalletLedgerItem[];
  pagination?: BackendPagination;
};

const toNumber = (value: unknown) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
};

const mapStatus = (status?: string | null): WalletTransaction["status"] => {
  const normalized = String(status || "").toUpperCase();
  if (normalized === "PENDING") return "pending";
  if (normalized === "FAILED") return "failed";
  if (normalized === "REFUNDED" || normalized === "REVERSED") return "refunded";
  return "success";
};

const mapType = (type?: string | null): WalletTransaction["type"] => {
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

const mapTransaction = (item: BackendWalletLedgerItem): WalletTransaction => ({
  id: item.id,
  userName: String(item.user?.displayName || "Unknown user"),
  userId: item.userId,
  type: mapType(item.type),
  amount: toNumber(item.amount),
  status: mapStatus(item.status),
  balanceBefore: toNumber(item.balanceBefore),
  balanceAfter: toNumber(item.balanceAfter),
  paymentMethod: String(item.metadata?.paymentMethod || item.metadata?.method || "-"),
  createdAt: String(item.createdAt || new Date().toISOString()),
});

const normalizePaginatedTransactions = (
  payload: BackendWalletLedgerPayload,
): PaginatedResponse<WalletTransaction> => {
  const items = (payload.items || []).map(mapTransaction);
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

const calculateOverview = (items: BackendWalletLedgerItem[]): WalletOverview => {
  let totalRechargeVolume = 0;
  let pendingPayments = 0;
  let successfulPayments = 0;
  let failedPayments = 0;
  let refunds = 0;
  let couponUsage = 0;

  for (const item of items) {
    const type = String(item.type || "").toUpperCase();
    const status = String(item.status || "").toUpperCase();
    const amount = toNumber(item.amount);

    if (type === "RECHARGE") {
      totalRechargeVolume += amount;
      if (status === "PENDING") pendingPayments += 1;
      else if (status === "FAILED") failedPayments += 1;
      else successfulPayments += 1;
      if (item.metadata?.couponCode) couponUsage += 1;
    }

    if (type === "REFUND") {
      refunds += 1;
    }
  }

  return {
    totalRechargeVolume,
    pendingPayments,
    successfulPayments,
    failedPayments,
    refunds,
    couponUsage,
  };
};

export const walletService = {
  async getOverview() {
    const response = await api.get<ApiResponse<BackendWalletLedgerPayload>>(
      API_ENDPOINTS.wallet.ledger,
      {
        params: {
          page: 1,
          limit: 200,
        },
      },
    );
    return calculateOverview(response.data.data.items || []);
  },

  async getTransactions(params?: {
    page?: number;
    pageSize?: number;
    type?: string;
    status?: string;
    search?: string;
  }) {
    const response = await api.get<ApiResponse<BackendWalletLedgerPayload>>(
      API_ENDPOINTS.wallet.ledger,
      {
        params: {
          page: params?.page,
          limit: params?.pageSize,
          userId: params?.search || undefined,
        },
      },
    );
    const normalized = normalizePaginatedTransactions(response.data.data);

    const filtered = normalized.items.filter((item) => {
      const typeMatch = params?.type ? item.type === params.type : true;
      const statusMatch = params?.status ? item.status === params.status : true;
      return typeMatch && statusMatch;
    });

    if (!params?.type && !params?.status) {
      return normalized;
    }

    return {
      ...normalized,
      items: filtered,
      totalCount: filtered.length,
      totalPages: Math.max(1, Math.ceil(filtered.length / Math.max(1, normalized.pageSize))),
    };
  },

  async manualAdjustment(payload: {
    userId: string;
    type: "credit" | "debit";
    amount: number;
    reason: string;
  }) {
    const response = await api.post<ApiResponse<{ success: true }>>(
      API_ENDPOINTS.wallet.manualAdjustment,
      {
        userId: payload.userId,
        action: payload.type === "credit" ? "CREDIT" : "DEBIT",
        amount: payload.amount,
        reason: payload.reason,
      },
    );
    return response.data.data;
  },
};

