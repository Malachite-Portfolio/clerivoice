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
      "/admin/hosts",
      {
        params: query,
      },
    );
    return response.data.data;
  },

  async createHost(payload: HostCreatePayload) {
    const response = await api.post<ApiResponse<Host>>("/admin/hosts", payload);
    return response.data.data;
  },

  async getHostById(hostId: string) {
    const response = await api.get<ApiResponse<Host>>(`/admin/hosts/${hostId}`);
    return response.data.data;
  },

  async updateHost(hostId: string, payload: Partial<HostCreatePayload>) {
    const response = await api.patch<ApiResponse<Host>>(
      `/admin/hosts/${hostId}`,
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
      `/admin/hosts/${hostId}/${endpointByAction[action]}`,
      payload ?? {},
    );
    return response.data.data;
  },

  async bulkAction(hostIds: string[], action: HostAction) {
    const response = await api.post<ApiResponse<{ updatedCount: number }>>(
      "/admin/hosts/bulk-action",
      {
        hostIds,
        action,
      },
    );
    return response.data.data;
  },

  async getHostSessionHistory(hostId: string) {
    const response = await api.get<ApiResponse<HostSessionHistoryItem[]>>(
      `/admin/hosts/${hostId}/sessions`,
    );
    return response.data.data;
  },

  async getHostPricingLogs(hostId: string) {
    const response = await api.get<ApiResponse<HostPriceLog[]>>(
      `/admin/hosts/${hostId}/pricing-history`,
    );
    return response.data.data;
  },
};
