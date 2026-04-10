import { API_ENDPOINTS } from "@/constants/api";
import { api } from "@/services/http";
import type { ApiResponse, PaginatedResponse, SupportTicket } from "@/types";

type BackendPagination = {
  page?: number;
  limit?: number;
  total?: number;
  totalPages?: number;
};

type BackendSupportPayload = {
  items?: SupportTicket[];
  pagination?: BackendPagination;
};

const normalizeTicketList = (
  payload: BackendSupportPayload,
): PaginatedResponse<SupportTicket> => {
  const items = payload.items || [];
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

export const supportService = {
  async getTickets(params?: {
    page?: number;
    pageSize?: number;
    status?: string;
    priority?: string;
    search?: string;
  }) {
    const response = await api.get<ApiResponse<BackendSupportPayload>>(
      API_ENDPOINTS.support.tickets,
      {
        params: {
          page: params?.page,
          limit: params?.pageSize,
          status: params?.status,
          priority: params?.priority,
          search: params?.search,
        },
      },
    );
    return normalizeTicketList(response.data.data);
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

