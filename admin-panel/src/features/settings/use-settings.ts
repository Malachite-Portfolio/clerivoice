"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { settingsService } from "@/services/settings.service";
import type { AppSettings } from "@/types";

const fallbackSettings: AppSettings = {
  minimumBalanceCall: 30,
  minimumBalanceChat: 20,
  lowBalanceWarningThresholdMinutes: 2,
  rechargePlans: [159, 249, 449],
  featureToggles: {
    referralEnabled: true,
    couponEnabled: true,
    hostFeaturedEnabled: true,
  },
  referral: {
    inviterReward: 55,
    invitedReward: 50,
    qualifyingRechargeAmount: 500,
    faqContent: [
      {
        question: "When will referral rewards be credited?",
        answer:
          "Referral rewards are credited when the invited user completes their first verified recharge above qualifying amount.",
      },
    ],
  },
};

export function useSettings() {
  return useQuery({
    queryKey: ["admin-settings"],
    queryFn: async () => {
      try {
        return await settingsService.getSettings();
      } catch {
        return fallbackSettings;
      }
    },
  });
}

export function useUpdateSettings() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: Partial<AppSettings>) => settingsService.updateSettings(input),
    onSuccess: () => {
      toast.success("Settings updated");
      queryClient.invalidateQueries({ queryKey: ["admin-settings"] });
    },
    onError: () => toast.error("Failed to update settings"),
  });
}
