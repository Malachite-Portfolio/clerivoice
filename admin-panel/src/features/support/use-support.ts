"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { mockSupportTickets } from "@/constants/mock-data";
import { supportService } from "@/services/support.service";

export function useSupportTickets(params: {
  page?: number;
  pageSize?: number;
  status?: string;
  priority?: string;
  search?: string;
}) {
  return useQuery({
    queryKey: ["admin-support-tickets", params],
    queryFn: async () => {
      try {
        return await supportService.getTickets(params);
      } catch {
        return {
          items: mockSupportTickets,
          page: params.page ?? 1,
          pageSize: params.pageSize ?? 10,
          totalCount: mockSupportTickets.length,
          totalPages: Math.ceil(mockSupportTickets.length / (params.pageSize ?? 10)),
        };
      }
    },
  });
}

export function useUpdateTicket() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: {
      ticketId: string;
      payload: {
        status?: "open" | "in_progress" | "resolved" | "closed";
        priority?: "low" | "medium" | "high" | "critical";
        assignedTo?: string;
        reply?: string;
      };
    }) => supportService.updateTicket(input.ticketId, input.payload),
    onSuccess: () => {
      toast.success("Ticket updated successfully");
      queryClient.invalidateQueries({ queryKey: ["admin-support-tickets"] });
    },
    onError: () => toast.error("Failed to update ticket"),
  });
}
