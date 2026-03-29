"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { mockHosts } from "@/constants/mock-data";
import { hostsService } from "@/services/hosts.service";
import type { HostAction, HostCreatePayload, HostListQuery } from "@/types";

export function useHosts(query: HostListQuery) {
  return useQuery({
    queryKey: ["admin-hosts", query],
    queryFn: async () => {
      try {
        return await hostsService.getHosts(query);
      } catch {
        return {
          items: mockHosts,
          page: query.page ?? 1,
          pageSize: query.pageSize ?? 10,
          totalCount: mockHosts.length,
          totalPages: Math.ceil(mockHosts.length / (query.pageSize ?? 10)),
        };
      }
    },
  });
}

export function useHost(hostId: string) {
  return useQuery({
    queryKey: ["admin-host", hostId],
    queryFn: async () => {
      try {
        return await hostsService.getHostById(hostId);
      } catch {
        return mockHosts.find((host) => host.id === hostId) ?? mockHosts[0];
      }
    },
    enabled: Boolean(hostId),
  });
}

export function useCreateHost() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: HostCreatePayload) => hostsService.createHost(payload),
    onSuccess: () => {
      toast.success("Host created successfully");
      queryClient.invalidateQueries({ queryKey: ["admin-hosts"] });
    },
    onError: () => toast.error("Unable to create host"),
  });
}

export function useHostAction(hostId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: { action: HostAction; payload?: unknown }) =>
      hostsService.updateHostAction(hostId, input.action, input.payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-host", hostId] });
      queryClient.invalidateQueries({ queryKey: ["admin-hosts"] });
    },
  });
}

export function useHostUpdate(hostId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: Partial<HostCreatePayload>) =>
      hostsService.updateHost(hostId, payload),
    onSuccess: () => {
      toast.success("Host updated successfully");
      queryClient.invalidateQueries({ queryKey: ["admin-host", hostId] });
      queryClient.invalidateQueries({ queryKey: ["admin-hosts"] });
    },
    onError: () => toast.error("Unable to update host"),
  });
}
