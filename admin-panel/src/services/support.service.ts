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
      "/admin/support/tickets",
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
      `/admin/support/tickets/${ticketId}`,
      payload,
    );
    return response.data.data;
  },
};
