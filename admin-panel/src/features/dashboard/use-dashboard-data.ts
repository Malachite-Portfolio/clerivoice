"use client";

import { useQuery } from "@tanstack/react-query";
import {
  mockDashboardSummary,
  mockLiveSessions,
  mockRevenueSeries,
  mockTopHosts,
  mockWalletTransactions,
} from "@/constants/mock-data";
import { dashboardService } from "@/services/dashboard.service";

export function useDashboardData() {
  const summary = useQuery({
    queryKey: ["dashboard-summary"],
    queryFn: async () => {
      try {
        return await dashboardService.summary();
      } catch {
        return mockDashboardSummary;
      }
    },
  });

  const revenueSeries = useQuery({
    queryKey: ["dashboard-revenue-series"],
    queryFn: async () => {
      try {
        return await dashboardService.revenueSeries();
      } catch {
        return mockRevenueSeries;
      }
    },
  });

  const topHosts = useQuery({
    queryKey: ["dashboard-top-hosts"],
    queryFn: async () => {
      try {
        return await dashboardService.topEarningHosts();
      } catch {
        return mockTopHosts;
      }
    },
  });

  const recentSessions = useQuery({
    queryKey: ["dashboard-recent-sessions"],
    queryFn: async () => {
      try {
        return await dashboardService.recentSessions();
      } catch {
        return mockLiveSessions;
      }
    },
  });

  const recentRecharges = useQuery({
    queryKey: ["dashboard-recent-recharges"],
    queryFn: async () => {
      try {
        return await dashboardService.recentRecharges();
      } catch {
        return mockWalletTransactions;
      }
    },
  });

  return {
    summary,
    revenueSeries,
    topHosts,
    recentSessions,
    recentRecharges,
  };
}
