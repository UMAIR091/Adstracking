"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import { BarChart3, RefreshCw, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export type Ga4Property = { id: string; name: string; account?: string };
export type Ga4Source = {
  id: string;
  display_name: string | null;
  config: { properties?: Ga4Property[]; property_id?: string | null };
} | null;

// Mirrors GoogleConnect (Search Console) for Google Analytics 4: connect via
// OAuth, pick one GA4 property, save, refresh on demand, disconnect.
export function Ga4Connect({
  clientId,
  source,
  lastSyncedAt = null,
  lastSyncError = null,
}: {
  clientId: string;
  source: Ga4Source;
  lastSyncedAt?: string | null;
  lastSyncError?: string | null;
}) {
  const router = useRouter();
  const [property, setProperty] = useState(source?.config?.property_id ?? "");
  const [busy, setBusy] = useState(false);

  if (!source) {
    return (
      <Card className="transition-shadow hover:shadow-md">
        <CardContent className="flex flex-wrap items-center justify-between gap-3 p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
              <BarChart3 size={18} />
            </div>
            <div>
              <p className="font-medium text-ink-900">Google Analytics 4</p>
              <p className="text-sm text-ink-500">Pull users, sessions, conversions, traffic sources and more.</p>
            </div>
          </div>
          <Button asChild>
            <a href={`/api/google/connect?clientId=${clientId}&type=ga4`}>Connect</a>
          </Button>
        </CardContent>
      </Card>
    );
  }

  const properties = source.config?.properties ?? [];

  async function saveProperty() {
    setBusy(true);
    const res = await fetch("/api/google/save-property", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dataSourceId: source!.id, propertyId: property }),
    });
    setBusy(false);
    if (!res.ok) return toast.error((await res.json()).error ?? "Failed to save");
    toast.success("Property saved");
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
    if (!confirm("Disconnect Google Analytics for this client?")) return;
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
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
              <BarChart3 size={18} />
            </div>
            <div>
              <p className="font-medium text-ink-900">Google Analytics 4</p>
              <p className="text-sm text-ink-500">Connected as {source.display_name}</p>
            </div>
          </div>
          <button onClick={disconnect} disabled={busy} className="text-xs text-ink-500 transition-colors hover:text-red-600 disabled:opacity-50">
            Disconnect
          </button>
        </div>

        <div className="mt-4 flex flex-wrap items-end gap-2">
          <div className="flex-1">
            <label className="mb-1 block text-xs font-medium text-ink-700">Property</label>
            <select
              value={property}
              onChange={(e) => setProperty(e.target.value)}
              className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
            >
              <option value="">Select a property…</option>
              {properties.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}{p.account ? ` · ${p.account}` : ""} ({p.id})
                </option>
              ))}
            </select>
          </div>
          <Button variant="outline" onClick={saveProperty} disabled={busy || !property || property === source.config?.property_id}>
            Save
          </Button>
          <Button onClick={refreshNow} disabled={busy || !source.config?.property_id}>
            <RefreshCw size={16} className={busy ? "animate-spin" : ""} /> {busy ? "Refreshing…" : "Refresh now"}
          </Button>
        </div>

        {source.config?.property_id && lastSyncError && (
          <div className="mt-3 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            <AlertTriangle size={14} className="mt-0.5 shrink-0" />
            <span>Last sync failed: {lastSyncError}. Click Refresh now to retry, or reconnect Google if the problem persists.</span>
          </div>
        )}

        {source.config?.property_id && (
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
