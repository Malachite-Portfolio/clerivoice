import { api } from "@/services/http";
import type {
  ApiResponse,
  PaginatedResponse,
  WalletOverview,
  WalletTransaction,
} from "@/types";

export const walletService = {
  async getOverview() {
    const response = await api.get<ApiResponse<WalletOverview>>(
      "/admin/wallet/overview",
    );
    return response.data.data;
  },

  async getTransactions(params?: {
    page?: number;
    pageSize?: number;
    type?: string;
    status?: string;
    search?: string;
  }) {
    const response = await api.get<ApiResponse<PaginatedResponse<WalletTransaction>>>(
      "/admin/wallet/transactions",
      { params },
    );
    return response.data.data;
  },

  async manualAdjustment(payload: {
    userId: string;
    type: "credit" | "debit";
    amount: number;
    reason: string;
  }) {
    const response = await api.post<ApiResponse<{ success: true }>>(
      "/admin/wallet/manual-adjustment",
      payload,
    );
    return response.data.data;
  },
};
