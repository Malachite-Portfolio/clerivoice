"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { sessionsService } from "@/services/sessions.service";

export function useLiveSessions() {
  return useQuery({
    queryKey: ["admin-live-sessions"],
    queryFn: () => sessionsService.getLiveSessions(),
    refetchInterval: 15_000,
    retry: 1,
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
    onError: (error: unknown) => {
      const message =
        (error as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        (error instanceof Error ? error.message : "") ||
        "Failed to end session";
      toast.error(message);
    },
  });
}
