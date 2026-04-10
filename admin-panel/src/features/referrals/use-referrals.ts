"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
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
    queryFn: () => referralsService.getReferrals(params),
    retry: 1,
  });
}

export function useReferralSettings() {
  return useQuery({
    queryKey: ["admin-referral-settings"],
    queryFn: () => referralsService.getReferralSettings(),
    retry: 1,
  });
}

export function useUpdateReferralSettings() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (settings: Partial<ReferralSettings>) =>
      referralsService.updateReferralSettings(settings),
    onSuccess: () => {
      toast.success("Referral settings updated");
      queryClient.invalidateQueries({ queryKey: ["admin-referral-settings"] });
    },
    onError: () => toast.error("Unable to update referral settings"),
  });
}
