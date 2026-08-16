"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import { RefreshCw, AlertTriangle, Info, Search, BarChart3, Megaphone, MapPin, Facebook, Instagram, Linkedin, Music, Ghost, Twitter, Plug, ShoppingBag, FileSpreadsheet, Magnet } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";
import type { IntegrationDescriptor } from "@/lib/integrations/types";

// Serializable, already-normalized connection passed from the server.
export type IntegrationSource = {
  id: string;
  display_name: string | null;
  accounts: { id: string; name: string }[];
  selectedAccountId: string | null;
} | null;

const ICONS: Record<string, typeof Search> = {
  Search, BarChart3, Megaphone, MapPin, Facebook, Instagram, Linkedin, Music, Ghost, Twitter, ShoppingBag, FileSpreadsheet, Magnet,
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
  status = null,
  lastSyncedAt = null,
  lastSyncError = null,
}: {
  descriptor: IntegrationDescriptor;
  clientId: string;
  source: IntegrationSource;
  status?: string | null;
  lastSyncedAt?: string | null;
  lastSyncError?: string | null;
}) {
  const router = useRouter();
  const [account, setAccount] = useState(source?.selectedAccountId ?? "");
  const [busy, setBusy] = useState(false);
  const confirm = useConfirm();

  const Icon = ICONS[descriptor.icon] ?? Plug;
  const tint = TINTS[descriptor.accent] ?? "bg-ink-100 text-ink-600";
  const noun = descriptor.accountNoun;
  // A revoked/expired grant needs the user to re-authorize — reuse the existing
  // consent → OAuth connect flow. connectHref is the same route as first connect.
  const needsReconnect = status === "revoked";
  // Connected but no account/property chosen yet — the sync cannot run.
  // Must be checked after needsReconnect so a revoked source doesn't also show
  // the account-selection banner (user needs to reconnect first).
  const needsAccount = !needsReconnect && source !== null && !source.selectedAccountId;
  const connectHref = `/dashboard/connect/${descriptor.id}?clientId=${clientId}`;

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
          {descriptor.connectable ? (
            /* Route through the consent screen so the user sees what data is
               accessed and why before the provider's OAuth page — or, for
               api-key providers, before entering their key.
               This used to test `status === "live" && connectPath`, which hid
               the Connect button for every api-key integration and labelled it
               "Coming soon" even though the Integrations page offered it. */
            <Button asChild>
              <a href={`/dashboard/connect/${descriptor.id}?clientId=${clientId}`}>Connect</a>
            </Button>
          ) : (
            <span className="rounded-full bg-ink-100 px-2.5 py-1 text-xs font-medium text-ink-600">Coming soon</span>
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
    if (!(await confirm({ title: `Disconnect ${descriptor.name}?`, description: "This removes the connection and its cached data for this client. Reports you’ve already generated are kept.", confirmLabel: "Disconnect", destructive: true }))) return;
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
              {/* The header line must not read as a working connection while
                  the source cannot sync (P0-4). */}
              <p className="text-sm text-ink-500">
                Connected as {source.display_name}
                {needsAccount && <span className="text-sky-700"> — {noun} selection required</span>}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {needsReconnect && (
              <Button asChild size="sm">
                <a href={connectHref}>Reconnect</a>
              </Button>
            )}
            <button onClick={disconnect} disabled={busy} className="text-xs text-ink-500 transition-colors hover:text-red-600 disabled:opacity-50">
              Disconnect
            </button>
          </div>
        </div>

        {needsReconnect && (
          <div className="mt-4 flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2.5 text-xs text-amber-800">
            <AlertTriangle size={14} className="mt-0.5 shrink-0" />
            <span>
              <span className="font-semibold">Reconnection required.</span>{" "}
              {lastSyncError ?? `${descriptor.name} access has expired or was revoked.`} Syncing is paused until you{" "}
              <a href={connectHref} className="font-semibold underline">reconnect {descriptor.name}</a>.
            </span>
          </div>
        )}

        {needsAccount && (
          <div className="mt-4 flex items-start gap-2 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2.5 text-xs text-sky-800">
            <Info size={14} className="mt-0.5 shrink-0" />
            <span>
              <span className="font-semibold">{noun.charAt(0).toUpperCase() + noun.slice(1)} selection required.</span>{" "}
              {source.accounts.length > 0 ? (
                <>
                  The connection succeeded, but no {noun} has been chosen yet — syncing is paused until you select one
                  below and click <span className="font-semibold">Save</span>.
                </>
              ) : (
                // Instagram and Pinterest land here: connected, but the provider
                // returned no selectable accounts, so "choose one below" would
                // point at an empty dropdown.
                <>
                  The connection succeeded, but no {noun} is available to choose yet. Click{" "}
                  <span className="font-semibold">Refresh now</span> to fetch the list — if it stays empty, the
                  connected profile has no {noun} that {descriptor.name} can report on.
                </>
              )}
            </span>
          </div>
        )}

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

        {source.selectedAccountId && lastSyncError && !needsReconnect && (
          <div className="mt-3 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            <AlertTriangle size={14} className="mt-0.5 shrink-0" />
            <span>
              Last sync failed: {lastSyncError}. Click Refresh now to retry, or{" "}
              <a href={connectHref} className="font-semibold underline">
                reconnect {descriptor.name}
              </a>{" "}
              if access expired or was revoked.
            </span>
          </div>
        )}

        {source.selectedAccountId && (
          <p className="mt-3 text-xs text-ink-500">
            {lastSyncedAt
              ? `Auto-synced ${formatDistanceToNow(new Date(lastSyncedAt), { addSuffix: true })} · refreshes automatically every few hours`
              : "Not synced yet — click Refresh now or wait for the next scheduled sync."}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
