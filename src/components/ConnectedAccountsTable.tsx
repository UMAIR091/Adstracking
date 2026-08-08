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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";

const ICONS: Record<string, typeof Search> = {
  Search, BarChart3, Megaphone, MapPin, Facebook, Instagram, Linkedin, Music, Twitter, Youtube, Ghost, ShoppingBag, FileSpreadsheet, Magnet,
};
const TINTS: Record<string, string> = {
  emerald: "bg-emerald-50 text-emerald-600",
  amber: "bg-amber-50 text-amber-600",
  sky: "bg-sky-50 text-sky-600",
  rose: "bg-rose-50 text-rose-600",
  blue: "bg-blue-50 text-blue-600",
  cyan: "bg-cyan-50 text-cyan-600",
  fuchsia: "bg-fuchsia-50 text-fuchsia-600",
  red: "bg-red-50 text-red-600",
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
  /** True when the source is connected but no account has been chosen yet. */
  needsAccount: boolean;
  clientId: string;
  clientName: string;
  status: string | null;
  lastSyncedAt: string | null;
  lastSyncError: string | null;
};

function StatusBadge({ row }: { row: ConnectedAccountRow }) {
  if (row.status === "revoked") return <Badge variant="danger" dot>Reconnect needed</Badge>;
  if (row.status === "error" || row.lastSyncError) return <Badge variant="warning" dot>Sync issue</Badge>;
  if (row.needsAccount) return <Badge variant="info" dot>Setup incomplete</Badge>;
  if (row.lastSyncedAt) return <Badge variant="success" dot>Connected</Badge>;
  return <Badge variant="info" dot>Awaiting first sync</Badge>;
}

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
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
      <table className="w-full min-w-[760px] text-sm">
        <thead>
          <tr className="border-b border-slate-100 text-left text-xs font-medium text-ink-500">
            <th scope="col" className="px-4 py-3">Platform</th>
            <th scope="col" className="px-4 py-3">Account</th>
            <th scope="col" className="px-4 py-3">Client</th>
            <th scope="col" className="px-4 py-3">Status</th>
            <th scope="col" className="px-4 py-3">Last sync</th>
            <th scope="col" className="px-4 py-3 text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const Icon = ICONS[row.icon] ?? Plug;
            const tint = TINTS[row.accent] ?? "bg-ink-100 text-ink-600";
            const busy = busyId === row.dataSourceId;

            return (
              <tr key={row.dataSourceId} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/60">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2.5">
                    <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${tint}`}>
                      <Icon size={15} />
                    </span>
                    <span className="font-medium text-ink-900">{row.platform}</span>
                  </div>
                </td>
                <td className="px-4 py-3 text-ink-700">
                  {row.accountLabel ?? <span className="text-ink-400">Not selected</span>}
                </td>
                <td className="px-4 py-3">
                  <Link href={`/dashboard/clients/${row.clientId}`} className="text-ink-700 hover:text-ink-900 hover:underline">
                    {row.clientName}
                  </Link>
                </td>
                <td className="px-4 py-3"><StatusBadge row={row} /></td>
                <td className="px-4 py-3 text-ink-500">
                  {row.lastSyncedAt ? `${formatDistanceToNow(new Date(row.lastSyncedAt))} ago` : "—"}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-1.5">
                    <Button asChild variant="outline" size="sm">
                      <Link href={`/dashboard/clients/${row.clientId}`}>View</Link>
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => refresh(row)} disabled={busy}>
                      <RefreshCw size={14} className={busy ? "animate-spin" : undefined} />
                      Refresh
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => disconnect(row)} disabled={busy}>
                      Disconnect
                    </Button>
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
