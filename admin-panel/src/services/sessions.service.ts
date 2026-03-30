import { API_ENDPOINTS } from "@/constants/api";
import { api } from "@/services/http";
import type { ApiResponse, LiveSession, PaginatedResponse } from "@/types";

export const sessionsService = {
  async getLiveSessions() {
    const response = await api.get<ApiResponse<LiveSession[]>>(
      API_ENDPOINTS.sessions.live,
    );
    return response.data.data;
  },

  async getCallSessions(params?: {
    page?: number;
    pageSize?: number;
    status?: string;
  }) {
    const response = await api.get<ApiResponse<PaginatedResponse<LiveSession>>>(
      API_ENDPOINTS.sessions.calls,
      { params },
    );
    return response.data.data;
  },

  async getChatSessions(params?: {
    page?: number;
    pageSize?: number;
    status?: string;
  }) {
    const response = await api.get<ApiResponse<PaginatedResponse<LiveSession>>>(
      API_ENDPOINTS.sessions.chats,
      { params },
    );
    return response.data.data;
  },

  async forceEndSession(sessionId: string, reason: string) {
    const response = await api.post<ApiResponse<{ success: true }>>(
      API_ENDPOINTS.sessions.forceEnd(sessionId),
      { reason },
    );
    return response.data.data;
  },
};
