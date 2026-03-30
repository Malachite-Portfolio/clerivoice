import { API_ENDPOINTS } from "@/constants/api";
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
      API_ENDPOINTS.users.base,
      { params },
    );
    return response.data.data;
  },

  async getUserById(userId: string) {
    const response = await api.get<ApiResponse<User>>(API_ENDPOINTS.users.byId(userId));
    return response.data.data;
  },

  async creditWallet(userId: string, amount: number, reason: string) {
    const response = await api.post<ApiResponse<{ success: true }>>(
      API_ENDPOINTS.users.creditWallet(userId),
      { amount, reason },
    );
    return response.data.data;
  },

  async debitWallet(userId: string, amount: number, reason: string) {
    const response = await api.post<ApiResponse<{ success: true }>>(
      API_ENDPOINTS.users.debitWallet(userId),
      { amount, reason },
    );
    return response.data.data;
  },

  async suspendUser(userId: string, reason: string) {
    const response = await api.post<ApiResponse<{ success: true }>>(
      API_ENDPOINTS.users.suspend(userId),
      { reason },
    );
    return response.data.data;
  },
};
