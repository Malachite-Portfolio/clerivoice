import { api } from "@/services/http";
import type { ApiResponse, PaginatedResponse, User } from "@/types";

export const usersService = {
  async getUsers(params?: {
    page?: number;
    pageSize?: number;
    search?: string;
    status?: string;
  }) {
    const response = await api.get<ApiResponse<PaginatedResponse<User>>>(
      "/admin/users",
      { params },
    );
    return response.data.data;
  },

  async getUserById(userId: string) {
    const response = await api.get<ApiResponse<User>>(`/admin/users/${userId}`);
    return response.data.data;
  },

  async creditWallet(userId: string, amount: number, reason: string) {
    const response = await api.post<ApiResponse<{ success: true }>>(
      `/admin/users/${userId}/credit-wallet`,
      { amount, reason },
    );
    return response.data.data;
  },

  async debitWallet(userId: string, amount: number, reason: string) {
    const response = await api.post<ApiResponse<{ success: true }>>(
      `/admin/users/${userId}/debit-wallet`,
      { amount, reason },
    );
    return response.data.data;
  },

  async suspendUser(userId: string, reason: string) {
    const response = await api.post<ApiResponse<{ success: true }>>(
      `/admin/users/${userId}/suspend`,
      { reason },
    );
    return response.data.data;
  },
};
