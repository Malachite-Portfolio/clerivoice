"use client";

import { useEffect, useState } from "react";
import { AdminLayout } from "@/components/layout/admin-layout";
import { RoleGate } from "@/components/layout/role-gate";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useSettings, useUpdateSettings } from "@/features/settings/use-settings";

export default function SettingsPage() {
  const settingsQuery = useSettings();
  const updateSettings = useUpdateSettings();
  const [form, setForm] = useState({
    minimumBalanceCall: "",
    minimumBalanceChat: "",
    lowBalanceWarningThresholdMinutes: "",
    rechargePlans: "",
    inviterReward: "",
    invitedReward: "",
    qualifyingRechargeAmount: "",
    faqContent: "",
  });

  useEffect(() => {
    if (!settingsQuery.data) {
      return;
    }
    const settings = settingsQuery.data;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setForm({
      minimumBalanceCall: String(settings.minimumBalanceCall),
      minimumBalanceChat: String(settings.minimumBalanceChat),
      lowBalanceWarningThresholdMinutes: String(
        settings.lowBalanceWarningThresholdMinutes,
      ),
      rechargePlans: settings.rechargePlans.join(","),
      inviterReward: String(settings.referral.inviterReward),
      invitedReward: String(settings.referral.invitedReward),
      qualifyingRechargeAmount: String(settings.referral.qualifyingRechargeAmount),
      faqContent: settings.referral.faqContent
        .map((item) => `${item.question}|${item.answer}`)
        .join("\n"),
    });
  }, [settingsQuery.data]);

  return (
    <AdminLayout
      title="Platform Settings"
      subtitle="Configure recharge plans, referral rewards, billing limits, and feature toggles."
    >
      <RoleGate roles={["super_admin", "admin"]}>
      {settingsQuery.isError ? (
        <Card className="mb-4 space-y-2 border-app-danger/40">
          <CardTitle className="text-base text-app-danger">Failed to load settings</CardTitle>
          <p className="text-sm text-app-text-secondary">
            {(
              settingsQuery.error as { response?: { data?: { message?: string } } }
            )?.response?.data?.message || "Unable to load settings from backend."}
          </p>
          <div>
            <Button size="sm" variant="secondary" onClick={() => void settingsQuery.refetch()}>
              Retry
            </Button>
          </div>
        </Card>
      ) : null}

      <Card className="space-y-4">
        <div>
          <CardTitle>Billing Controls</CardTitle>
          <CardDescription>
            Core wallet and balance thresholds used by chat/call eligibility logic.
          </CardDescription>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <Input
            value={form.minimumBalanceCall}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, minimumBalanceCall: event.target.value }))
            }
            placeholder="Minimum call balance"
          />
          <Input
            value={form.minimumBalanceChat}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, minimumBalanceChat: event.target.value }))
            }
            placeholder="Minimum chat balance"
          />
          <Input
            value={form.lowBalanceWarningThresholdMinutes}
            onChange={(event) =>
              setForm((prev) => ({
                ...prev,
                lowBalanceWarningThresholdMinutes: event.target.value,
              }))
            }
            placeholder="Low balance warning (mins)"
          />
          <Input
            value={form.rechargePlans}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, rechargePlans: event.target.value }))
            }
            placeholder="Recharge plans comma-separated"
          />
        </div>
      </Card>

      <Card className="space-y-4">
        <div>
          <CardTitle>Referral Configuration</CardTitle>
          <CardDescription>Manage inviter/friend rewards and qualifying rules.</CardDescription>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <Input
            value={form.inviterReward}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, inviterReward: event.target.value }))
            }
            placeholder="Inviter reward"
          />
          <Input
            value={form.invitedReward}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, invitedReward: event.target.value }))
            }
            placeholder="Friend reward"
          />
          <Input
            value={form.qualifyingRechargeAmount}
            onChange={(event) =>
              setForm((prev) => ({
                ...prev,
                qualifyingRechargeAmount: event.target.value,
              }))
            }
            placeholder="Qualifying recharge amount"
          />
        </div>

        <div>
          <label className="mb-2 block text-sm text-app-text-secondary">
            FAQ Content (question|answer per line)
          </label>
          <Textarea
            value={form.faqContent}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, faqContent: event.target.value }))
            }
          />
        </div>

        <div className="flex justify-end">
          <Button
            disabled={updateSettings.isPending}
            onClick={() =>
              updateSettings.mutate({
                minimumBalanceCall: Number(form.minimumBalanceCall),
                minimumBalanceChat: Number(form.minimumBalanceChat),
                lowBalanceWarningThresholdMinutes: Number(
                  form.lowBalanceWarningThresholdMinutes,
                ),
                rechargePlans: form.rechargePlans
                  .split(",")
                  .map((item) => Number(item.trim()))
                  .filter(Boolean),
                referral: {
                  inviterReward: Number(form.inviterReward),
                  invitedReward: Number(form.invitedReward),
                  qualifyingRechargeAmount: Number(form.qualifyingRechargeAmount),
                  faqContent: form.faqContent
                    .split("\n")
                    .map((line) => line.split("|"))
                    .filter((parts) => parts.length >= 2)
                    .map((parts) => ({
                      question: parts[0].trim(),
                      answer: parts.slice(1).join("|").trim(),
                    })),
                },
              })
            }
          >
            Save Settings
          </Button>
        </div>
      </Card>
      </RoleGate>
    </AdminLayout>
  );
}
