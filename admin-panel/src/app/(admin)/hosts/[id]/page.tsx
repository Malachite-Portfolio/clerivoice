"use client";

import { useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Eye, EyeOff, ShieldAlert, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { AdminLayout } from "@/components/layout/admin-layout";
import { RoleGate } from "@/components/layout/role-gate";
import { EarningsCard } from "@/components/hosts/earnings-card";
import { PricingCard } from "@/components/hosts/pricing-card";
import { ProfileCard } from "@/components/hosts/profile-card";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { ConfirmationModal } from "@/components/ui/confirmation-modal";
import { DataTable, type DataColumn } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { PageLoader } from "@/components/ui/loader";
import { StatusBadge } from "@/components/ui/status-badge";
import { Tabs } from "@/components/ui/tabs";
import { useHost, useHostAction, useHostUpdate } from "@/features/hosts/use-hosts";
import { hostsService } from "@/services/hosts.service";
import type { HostAction, HostPriceLog, HostSessionHistoryItem } from "@/types";
import { formatInr } from "@/utils/currency";
import { formatDateTime } from "@/utils/date";

type DetailsTab = "overview" | "sessions" | "earnings" | "pricing-history";

export default function HostDetailsPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const hostId = params.id;

  const hostQuery = useHost(hostId);
  const actionMutation = useHostAction(hostId);
  const updateMutation = useHostUpdate(hostId);

  const [tab, setTab] = useState<DetailsTab>("overview");
  const [pendingAction, setPendingAction] = useState<HostAction | null>(null);
  const [sessionHistory, setSessionHistory] = useState<HostSessionHistoryItem[]>([]);
  const [priceHistory, setPriceHistory] = useState<HostPriceLog[]>([]);

  const host = hostQuery.data;

  const loadSessionHistory = async () => {
    try {
      const result = await hostsService.getHostSessionHistory(hostId);
      setSessionHistory(result);
    } catch {
      setSessionHistory([]);
    }
  };

  const loadPricingLogs = async () => {
    try {
      const result = await hostsService.getHostPricingLogs(hostId);
      setPriceHistory(result);
    } catch {
      setPriceHistory([]);
    }
  };

  const sessionColumns: DataColumn<HostSessionHistoryItem>[] = useMemo(
    () => [
      {
        key: "type",
        header: "Type",
        render: (row) => <StatusBadge status={row.type} />,
      },
      {
        key: "user",
        header: "User",
        render: (row) => <span>{row.userName}</span>,
      },
      {
        key: "start",
        header: "Started",
        render: (row) => <span>{formatDateTime(row.startedAt)}</span>,
      },
      {
        key: "end",
        header: "Ended",
        render: (row) => <span>{formatDateTime(row.endedAt)}</span>,
      },
      {
        key: "duration",
        header: "Duration",
        render: (row) => <span>{row.durationMinutes} mins</span>,
      },
      {
        key: "billing",
        header: "Billed",
        render: (row) => <span className="font-semibold">{formatInr(row.billedAmount)}</span>,
      },
    ],
    [],
  );

  const pricingColumns: DataColumn<HostPriceLog>[] = useMemo(
    () => [
      {
        key: "changedAt",
        header: "Changed At",
        render: (row) => <span>{formatDateTime(row.changedAt)}</span>,
      },
      {
        key: "oldRates",
        header: "Old Rates",
        render: (row) => (
          <span>
            Call {formatInr(row.oldCallRate)} | Chat {formatInr(row.oldChatRate)}
          </span>
        ),
      },
      {
        key: "newRates",
        header: "New Rates",
        render: (row) => (
          <span>
            Call {formatInr(row.newCallRate)} | Chat {formatInr(row.newChatRate)}
          </span>
        ),
      },
      {
        key: "by",
        header: "Changed By",
        render: (row) => <span>{row.changedBy}</span>,
      },
    ],
    [],
  );

  if (hostQuery.isLoading) {
    return (
      <AdminLayout title="Host Details">
        <PageLoader />
      </AdminLayout>
    );
  }

  if (!host) {
    return (
      <AdminLayout title="Host Details">
        <EmptyState
          title="Host not found"
          description="The host profile you requested does not exist or has been removed."
        />
      </AdminLayout>
    );
  }

  return (
    <AdminLayout
      title="Host Profile Control"
      subtitle={`Manage ${host.displayName} profile, moderation, pricing, and earnings.`}
    >
      <RoleGate roles={["super_admin", "admin"]}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button variant="secondary" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            onClick={() => setPendingAction(host.verificationStatus === "verified" ? "reject" : "approve")}
          >
            <ShieldCheck className="h-4 w-4" />
            {host.verificationStatus === "verified" ? "Reject" : "Approve"}
          </Button>
          <Button
            variant="secondary"
            onClick={() => setPendingAction(host.status === "suspended" ? "reactivate" : "suspend")}
          >
            <ShieldAlert className="h-4 w-4" />
            {host.status === "suspended" ? "Reactivate" : "Suspend"}
          </Button>
          <Button
            variant="secondary"
            onClick={() =>
              setPendingAction(host.visibility === "visible" ? "hide" : "show")
            }
          >
            {host.visibility === "visible" ? (
              <EyeOff className="h-4 w-4" />
            ) : (
              <Eye className="h-4 w-4" />
            )}
            {host.visibility === "visible" ? "Hide Host" : "Show Host"}
          </Button>
        </div>
      </div>

      <ProfileCard host={host} />

      <Tabs
        value={tab}
        onChange={async (nextTab) => {
          setTab(nextTab as DetailsTab);
          if (nextTab === "sessions") {
            await loadSessionHistory();
          }
          if (nextTab === "pricing-history") {
            await loadPricingLogs();
          }
        }}
        items={[
          { label: "Overview", value: "overview" },
          { label: "Sessions", value: "sessions" },
          { label: "Earnings", value: "earnings" },
          { label: "Pricing Logs", value: "pricing-history" },
        ]}
      />

      {tab === "overview" ? (
        <div className="grid gap-4 xl:grid-cols-2">
          <PricingCard
            host={host}
            onSave={async (payload) => {
              await updateMutation.mutateAsync(payload);
            }}
          />
          <Card className="space-y-4">
            <CardTitle className="text-base">Moderation & Controls</CardTitle>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-xl border border-app-border p-3">
                <p className="text-xs text-app-text-muted">Verification Status</p>
                <div className="mt-2">
                  <StatusBadge status={host.verificationStatus} />
                </div>
              </div>
              <div className="rounded-xl border border-app-border p-3">
                <p className="text-xs text-app-text-muted">Current Presence</p>
                <div className="mt-2">
                  <StatusBadge status={host.presence} />
                </div>
              </div>
            </div>

            <div className="grid gap-2">
              <Button
                variant="secondary"
                onClick={() => setPendingAction("forceOffline")}
              >
                Force Offline
              </Button>
              <Button
                variant="secondary"
                onClick={() => setPendingAction("resetPassword")}
              >
                Reset Password
              </Button>
              <Button
                variant="secondary"
                onClick={() =>
                  setPendingAction(host.blockedNewSessions ? "allowSessions" : "blockSessions")
                }
              >
                {host.blockedNewSessions ? "Allow New Sessions" : "Block New Sessions"}
              </Button>
              <Button
                variant={host.featured ? "danger" : "secondary"}
                onClick={() => setPendingAction(host.featured ? "unfeature" : "feature")}
              >
                {host.featured ? "Unmark Featured" : "Mark Featured"}
              </Button>
            </div>
          </Card>
        </div>
      ) : null}

      {tab === "sessions" ? (
        <Card>
          <CardTitle className="mb-3 text-base">Session History</CardTitle>
          <DataTable data={sessionHistory} columns={sessionColumns} />
        </Card>
      ) : null}

      {tab === "earnings" ? <EarningsCard host={host} /> : null}

      {tab === "pricing-history" ? (
        <Card>
          <CardTitle className="mb-3 text-base">Pricing History</CardTitle>
          <DataTable data={priceHistory} columns={pricingColumns} />
        </Card>
      ) : null}

      <ConfirmationModal
        open={Boolean(pendingAction)}
        title="Confirm Host Action"
        description={`Are you sure you want to ${pendingAction} this host?`}
        onCancel={() => setPendingAction(null)}
        isLoading={actionMutation.isPending}
        onConfirm={async () => {
          if (!pendingAction) {
            return;
          }
          try {
            await actionMutation.mutateAsync({ action: pendingAction });
            toast.success("Host status updated");
            setPendingAction(null);
          } catch {
            toast.error("Unable to perform this action");
          }
        }}
      />
      </RoleGate>
    </AdminLayout>
  );
}
