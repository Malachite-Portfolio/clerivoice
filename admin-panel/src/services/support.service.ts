import { API_ENDPOINTS } from "@/constants/api";
import { api } from "@/services/http";
import type { ApiResponse, PaginatedResponse, SupportTicket } from "@/types";

export const supportService = {
  async getTickets(params?: {
    page?: number;
    pageSize?: number;
    status?: string;
    priority?: string;
    search?: string;
  }) {
    const response = await api.get<ApiResponse<PaginatedResponse<SupportTicket>>>(
      API_ENDPOINTS.support.tickets,
      { params },
    );
    return response.data.data;
  },

  async updateTicket(
    ticketId: string,
    payload: {
      status?: SupportTicket["status"];
      priority?: SupportTicket["priority"];
      assignedTo?: string;
      reply?: string;
    },
  ) {
    const response = await api.patch<ApiResponse<SupportTicket>>(
      API_ENDPOINTS.support.byId(ticketId),
      payload,
    );
    return response.data.data;
  },
};
