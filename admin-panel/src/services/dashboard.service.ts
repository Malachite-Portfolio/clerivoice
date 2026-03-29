import { api } from "@/services/http";
import type {
  ApiResponse,
  DashboardSummary,
  LiveSession,
  RevenuePoint,
  TopEarningHost,
  WalletTransaction,
} from "@/types";

export const dashboardService = {
  async summary() {
    const response = await api.get<ApiResponse<DashboardSummary>>(
      "/admin/dashboard/summary",
    );
    return response.data.data;
  },

  async revenueSeries() {
    const response = await api.get<ApiResponse<RevenuePoint[]>>(
      "/admin/dashboard/revenue-series",
    );
    return response.data.data;
  },

  async topEarningHosts() {
    const response = await api.get<ApiResponse<TopEarningHost[]>>(
      "/admin/dashboard/top-hosts",
    );
    return response.data.data;
  },

  async recentSessions() {
    const response = await api.get<ApiResponse<LiveSession[]>>(
      "/admin/dashboard/recent-sessions",
    );
    return response.data.data;
  },

  async recentRecharges() {
    const response = await api.get<ApiResponse<WalletTransaction[]>>(
      "/admin/dashboard/recent-recharges",
    );
    return response.data.data;
  },
};
