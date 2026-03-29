"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { mockReferralRecords } from "@/constants/mock-data";
import { referralsService } from "@/services/referrals.service";
import type { ReferralSettings } from "@/types";

export function useReferrals(params: {
  page?: number;
  pageSize?: number;
  status?: string;
  search?: string;
}) {
  return useQuery({
    queryKey: ["admin-referrals", params],
    queryFn: async () => {
      try {
        return await referralsService.getReferrals(params);
      } catch {
        return {
          items: mockReferralRecords,
          page: params.page ?? 1,
          pageSize: params.pageSize ?? 10,
          totalCount: mockReferralRecords.length,
          totalPages: Math.ceil(mockReferralRecords.length / (params.pageSize ?? 10)),
        };
      }
    },
  });
}

export function useUpdateReferralSettings() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (settings: Partial<ReferralSettings>) =>
      referralsService.updateReferralSettings(settings),
    onSuccess: () => {
      toast.success("Referral settings updated");
      queryClient.invalidateQueries({ queryKey: ["admin-settings"] });
    },
    onError: () => toast.error("Unable to update referral settings"),
  });
}
