"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { mockLiveSessions } from "@/constants/mock-data";
import { sessionsService } from "@/services/sessions.service";

export function useLiveSessions() {
  return useQuery({
    queryKey: ["admin-live-sessions"],
    queryFn: async () => {
      try {
        return await sessionsService.getLiveSessions();
      } catch {
        return mockLiveSessions;
      }
    },
    refetchInterval: 15_000,
  });
}

export function useForceEndSession() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: { sessionId: string; reason: string }) =>
      sessionsService.forceEndSession(input.sessionId, input.reason),
    onSuccess: () => {
      toast.success("Session ended successfully");
      queryClient.invalidateQueries({ queryKey: ["admin-live-sessions"] });
    },
    onError: () => toast.error("Failed to end session"),
  });
}
