"use client";

import { useQuery } from "@tanstack/react-query";
import { dashboardService } from "@/services/dashboard.service";

export function useDashboardData() {
  const summary = useQuery({
    queryKey: ["dashboard-summary"],
    queryFn: () => dashboardService.summary(),
    staleTime: 30_000,
    retry: 1,
  });

  const revenueSeries = useQuery({
    queryKey: ["dashboard-revenue-series"],
    queryFn: () => dashboardService.revenueSeries(),
    staleTime: 30_000,
    retry: 1,
  });

  const topHosts = useQuery({
    queryKey: ["dashboard-top-hosts"],
    queryFn: () => dashboardService.topEarningHosts(),
    staleTime: 30_000,
    retry: 1,
  });

  const recentSessions = useQuery({
    queryKey: ["dashboard-recent-sessions"],
    queryFn: () => dashboardService.recentSessions(),
    staleTime: 30_000,
    retry: 1,
  });

  const recentRecharges = useQuery({
    queryKey: ["dashboard-recent-recharges"],
    queryFn: () => dashboardService.recentRecharges(),
    staleTime: 30_000,
    retry: 1,
  });

  return {
    summary,
    revenueSeries,
    topHosts,
    recentSessions,
    recentRecharges,
  };
}
