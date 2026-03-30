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

export const hostsService = {
  async getHosts(query: HostListQuery = {}) {
    const response = await api.get<ApiResponse<PaginatedResponse<Host>>>(
      API_ENDPOINTS.hosts.base,
      {
        params: query,
      },
    );
    return response.data.data;
  },

  async createHost(payload: HostCreatePayload) {
    const response = await api.post<ApiResponse<Host>>(API_ENDPOINTS.hosts.base, payload);
    return response.data.data;
  },

  async getHostById(hostId: string) {
    const response = await api.get<ApiResponse<Host>>(API_ENDPOINTS.hosts.byId(hostId));
    return response.data.data;
  },

  async updateHost(hostId: string, payload: Partial<HostCreatePayload>) {
    const response = await api.patch<ApiResponse<Host>>(
      API_ENDPOINTS.hosts.byId(hostId),
      payload,
    );
    return response.data.data;
  },

  async updateHostAction(hostId: string, action: HostAction, payload?: unknown) {
    const endpointByAction: Record<HostAction, string> = {
      approve: "approve",
      reject: "reject",
      suspend: "suspend",
      reactivate: "reactivate",
      hide: "hide",
      show: "show",
      forceOffline: "force-offline",
      resetPassword: "reset-password",
      feature: "feature",
      unfeature: "unfeature",
      blockSessions: "block-sessions",
      allowSessions: "allow-sessions",
    };

    const response = await api.post<ApiResponse<Host>>(
      API_ENDPOINTS.hosts.action(hostId, endpointByAction[action]),
      payload ?? {},
    );
    return response.data.data;
  },

  async bulkAction(hostIds: string[], action: HostAction) {
    const response = await api.post<ApiResponse<{ updatedCount: number }>>(
      API_ENDPOINTS.hosts.bulkAction,
      {
        hostIds,
        action,
      },
    );
    return response.data.data;
  },

  async getHostSessionHistory(hostId: string) {
    const response = await api.get<ApiResponse<HostSessionHistoryItem[]>>(
      API_ENDPOINTS.hosts.sessions(hostId),
    );
    return response.data.data;
  },

  async getHostPricingLogs(hostId: string) {
    const response = await api.get<ApiResponse<HostPriceLog[]>>(
      API_ENDPOINTS.hosts.pricingHistory(hostId),
    );
    return response.data.data;
  },
};
