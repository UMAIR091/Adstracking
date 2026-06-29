"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import { RefreshCw, AlertTriangle, Search, BarChart3, Megaphone, MapPin, Facebook, Linkedin, Music, Plug } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { IntegrationDescriptor } from "@/lib/integrations/types";

// Serializable, already-normalized connection passed from the server.
export type IntegrationSource = {
  id: string;
  display_name: string | null;
  accounts: { id: string; name: string }[];
  selectedAccountId: string | null;
} | null;

const ICONS: Record<string, typeof Search> = {
  Search, BarChart3, Megaphone, MapPin, Facebook, Linkedin, Music,
};

// Full literal class strings so Tailwind keeps them.
const TINTS: Record<string, string> = {
  emerald: "bg-emerald-50 text-emerald-600",
  amber: "bg-amber-50 text-amber-600",
  sky: "bg-sky-50 text-sky-600",
  rose: "bg-rose-50 text-rose-600",
  blue: "bg-blue-50 text-blue-600",
  cyan: "bg-cyan-50 text-cyan-600",
  fuchsia: "bg-fuchsia-50 text-fuchsia-600",
};

// One card for every integration: handles Connect, Select account, Save, Refresh
// (Sync), Disconnect, and Status. Behavior is identical across providers — only
// the descriptor differs.
export function IntegrationCard({
  descriptor,
  clientId,
  source,
  lastSyncedAt = null,
  lastSyncError = null,
}: {
  descriptor: IntegrationDescriptor;
  clientId: string;
  source: IntegrationSource;
  lastSyncedAt?: string | null;
  lastSyncError?: string | null;
}) {
  const router = useRouter();
  const [account, setAccount] = useState(source?.selectedAccountId ?? "");
  const [busy, setBusy] = useState(false);

  const Icon = ICONS[descriptor.icon] ?? Plug;
  const tint = TINTS[descriptor.accent] ?? "bg-ink-100 text-ink-600";
  const noun = descriptor.accountNoun;

  if (!source) {
    return (
      <Card className="transition-shadow hover:shadow-md">
        <CardContent className="flex flex-wrap items-center justify-between gap-3 p-5">
          <div className="flex items-center gap-3">
            <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${tint}`}>
              <Icon size={18} />
            </div>
            <div>
              <p className="font-medium text-ink-900">{descriptor.name}</p>
              <p className="text-sm text-ink-500">{descriptor.description}.</p>
            </div>
          </div>
          {descriptor.status === "live" && descriptor.connectPath ? (
            <Button asChild>
              <a href={`${descriptor.connectPath}?clientId=${clientId}&type=${descriptor.id}`}>Connect</a>
            </Button>
          ) : (
            <span className="rounded-full bg-ink-100 px-2.5 py-1 text-xs font-medium text-ink-500">Coming soon</span>
          )}
        </CardContent>
      </Card>
    );
  }

  async function saveAccount() {
    setBusy(true);
    const res = await fetch("/api/google/save-property", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dataSourceId: source!.id, accountId: account }),
    });
    setBusy(false);
    if (!res.ok) return toast.error((await res.json()).error ?? "Failed to save");
    toast.success(`${noun.charAt(0).toUpperCase() + noun.slice(1)} saved`);
    router.refresh();
  }

  async function refreshNow() {
    setBusy(true);
    const res = await fetch("/api/google/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dataSourceId: source!.id }),
    });
    setBusy(false);
    if (!res.ok) return toast.error((await res.json()).error ?? "Failed to refresh data");
    toast.success("Analytics refreshed");
    router.refresh();
  }

  async function disconnect() {
    if (!confirm(`Disconnect ${descriptor.name} for this client?`)) return;
    setBusy(true);
    await fetch("/api/google/disconnect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dataSourceId: source!.id }),
    });
    setBusy(false);
    toast.success("Disconnected");
    router.refresh();
  }

  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${tint}`}>
              <Icon size={18} />
            </div>
            <div>
              <p className="font-medium text-ink-900">{descriptor.name}</p>
              <p className="text-sm text-ink-500">Connected as {source.display_name}</p>
            </div>
          </div>
          <button onClick={disconnect} disabled={busy} className="text-xs text-ink-500 transition-colors hover:text-red-600 disabled:opacity-50">
            Disconnect
          </button>
        </div>

        <div className="mt-4 flex flex-wrap items-end gap-2">
          <div className="flex-1">
            <label className="mb-1 block text-xs font-medium capitalize text-ink-700">{noun}</label>
            <select
              value={account}
              onChange={(e) => setAccount(e.target.value)}
              className="h-10 w-full rounded-lg border border-ink-300 px-3 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
            >
              <option value="">Select a {noun}…</option>
              {source.accounts.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          </div>
          <Button variant="outline" onClick={saveAccount} disabled={busy || !account || account === source.selectedAccountId}>
            Save
          </Button>
          <Button onClick={refreshNow} disabled={busy || !source.selectedAccountId}>
            <RefreshCw size={16} className={busy ? "animate-spin" : ""} /> {busy ? "Refreshing…" : "Refresh now"}
          </Button>
        </div>

        {source.selectedAccountId && lastSyncError && (
          <div className="mt-3 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            <AlertTriangle size={14} className="mt-0.5 shrink-0" />
            <span>Last sync failed: {lastSyncError}. Click Refresh now to retry, or reconnect if the problem persists.</span>
          </div>
        )}

        {source.selectedAccountId && (
          <p className="mt-3 text-xs text-ink-400">
            {lastSyncedAt
              ? `Auto-synced ${formatDistanceToNow(new Date(lastSyncedAt), { addSuffix: true })} · refreshes automatically every few hours`
              : "Not synced yet — click Refresh now or wait for the next scheduled sync."}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
