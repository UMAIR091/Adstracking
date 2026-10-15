"use client";

// Connected accounts across every client, with the actions that already exist
// on the client-page integration card. It calls the SAME endpoints with the same
// payloads — no new connection, OAuth or API-key logic is introduced here.
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import { RefreshCw, Search, BarChart3, Megaphone, MapPin, Facebook, Instagram, Linkedin, Music, Twitter, Youtube, Ghost, Plug, ShoppingBag, FileSpreadsheet, Magnet } from "lucide-react";
import { toast } from "sonner";
import { type SourceHealth } from "@/lib/integrations/status";
import { HealthChip, StatusChip } from "@/components/ui/status-chip";
import { useConfirm } from "@/components/ui/confirm-dialog";

const ICONS: Record<string, typeof Search> = {
  Search, BarChart3, Megaphone, MapPin, Facebook, Instagram, Linkedin, Music, Twitter, Youtube, Ghost, ShoppingBag, FileSpreadsheet, Magnet,
};
const TINTS: Record<string, string> = {
  emerald: "bg-success-50 text-success-600",
  amber: "bg-warning-50 text-warning-600",
  sky: "bg-info-50 text-info-600",
  rose: "bg-danger-50 text-danger-600",
  blue: "bg-info-50 text-info-600",
  cyan: "bg-info-50 text-info-600",
  fuchsia: "bg-brand-50 text-brand-600",
  red: "bg-danger-50 text-danger-600",
  ink: "bg-ink-100 text-ink-700",
};

export type ConnectedAccountRow = {
  dataSourceId: string;
  integrationId: string;
  platform: string;
  icon: string;
  accent: string;
  /** Selected account/property name, falling back to the authenticated identity. */
  accountLabel: string | null;
  /** Shared classification (P0-1) — replaces this table's own status ladder. */
  health: SourceHealth;
  clientId: string;
  clientName: string;
  status: string | null;
  lastSyncedAt: string | null;
  lastSyncError: string | null;
};

// One classifier, one vocabulary. This used to rank status/lastSyncError/
// needsAccount itself and call the result "Sync issue" for a source that was
// only missing an account selection.
function StatusBadge({ row }: { row: ConnectedAccountRow }) {
  if (row.health === "healthy" && !row.lastSyncedAt) return <StatusChip tone="info">Awaiting first sync</StatusChip>;
  return <HealthChip health={row.health} />;
}

const ACTION = "rounded-md px-2 py-1 text-[13px] font-medium transition-colors disabled:opacity-50";

export function ConnectedAccountsTable({ rows }: { rows: ConnectedAccountRow[] }) {
  const router = useRouter();
  const confirm = useConfirm();
  const [busyId, setBusyId] = useState<string | null>(null);

  // Same endpoint and payload the client-page card uses.
  async function refresh(row: ConnectedAccountRow) {
    setBusyId(row.dataSourceId);
    const res = await fetch("/api/google/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dataSourceId: row.dataSourceId }),
    });
    setBusyId(null);
    if (!res.ok) return toast.error((await res.json().catch(() => ({}))).error ?? "Failed to refresh data");
    toast.success(`${row.platform} refreshed`);
    router.refresh();
  }

  async function disconnect(row: ConnectedAccountRow) {
    const ok = await confirm({
      title: `Disconnect ${row.platform}?`,
      description: `This removes the connection and its cached data for ${row.clientName}. Reports you've already generated are kept.`,
      confirmLabel: "Disconnect",
      destructive: true,
    });
    if (!ok) return;
    setBusyId(row.dataSourceId);
    await fetch("/api/google/disconnect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dataSourceId: row.dataSourceId }),
    });
    setBusyId(null);
    toast.success("Disconnected");
    router.refresh();
  }

  return (
    <div className="overflow-x-auto rounded-card border border-ink-200 bg-surface">
      <table className="w-full min-w-[760px] text-[13.5px]">
        <thead>
          <tr className="border-b border-ink-100 bg-ink-50 text-left text-xs font-normal text-ink-400">
            <th scope="col" className="px-[18px] py-2.5 font-normal">Platform</th>
            <th scope="col" className="px-3 py-2.5 font-normal">Account</th>
            <th scope="col" className="px-3 py-2.5 font-normal">Client</th>
            <th scope="col" className="px-3 py-2.5 font-normal">Status</th>
            <th scope="col" className="px-3 py-2.5 font-normal">Last sync</th>
            <th scope="col" className="px-[18px] py-2.5 text-right font-normal"><span className="sr-only">Actions</span></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const Icon = ICONS[row.icon] ?? Plug;
            const tint = TINTS[row.accent] ?? "bg-ink-100 text-ink-600";
            const busy = busyId === row.dataSourceId;

            return (
              <tr key={row.dataSourceId} className="border-b border-ink-100 transition-colors last:border-0 hover:bg-ink-50">
                <td className="px-[18px] py-3">
                  <div className="flex items-center gap-2.5">
                    <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-[7px] ${tint}`}>
                      <Icon size={14} />
                    </span>
                    <span className="font-medium text-ink-900">{row.platform}</span>
                  </div>
                </td>
                <td className="max-w-[220px] truncate px-3 py-3 font-app-mono text-[12.5px] text-ink-500">
                  {row.accountLabel ?? <span className="font-sans text-ink-400">Not selected</span>}
                </td>
                <td className="px-3 py-3">
                  <Link href={`/dashboard/clients/${row.clientId}`} className="text-ink-900 hover:underline">
                    {row.clientName}
                  </Link>
                </td>
                <td className="px-3 py-3"><StatusBadge row={row} /></td>
                <td className="whitespace-nowrap px-3 py-3 text-ink-500">
                  {row.lastSyncedAt ? `${formatDistanceToNow(new Date(row.lastSyncedAt))} ago` : "—"}
                </td>
                <td className="px-[18px] py-3">
                  {/* Fixing it happens on the client page (reconnect, choose
                      account), so that's the lead action for a problem row. */}
                  <div className="flex items-center justify-end gap-0.5">
                    <Link
                      href={`/dashboard/clients/${row.clientId}/data-sources`}
                      className={`${ACTION} ${row.health === "healthy" ? "text-ink-500 hover:text-ink-900" : "text-brand-600 hover:text-ink-900"}`}
                    >
                      {row.health === "needs_reconnect" ? "Reconnect" : row.health === "needs_account" ? "Choose account" : row.health === "sync_error" ? "Review" : "View"}
                    </Link>
                    <button type="button" onClick={() => refresh(row)} disabled={busy} className={`${ACTION} inline-flex items-center gap-1 text-ink-500 hover:text-ink-900`}>
                      <RefreshCw size={13} className={busy ? "animate-spin" : undefined} aria-hidden />
                      Refresh
                    </button>
                    <button type="button" onClick={() => disconnect(row)} disabled={busy} className={`${ACTION} text-ink-500 hover:text-danger-700`}>
                      Disconnect
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
