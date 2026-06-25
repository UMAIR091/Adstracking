"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import { Search, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export type GscSource = {
  id: string;
  display_name: string | null;
  config: { sites?: string[]; site_url?: string | null };
} | null;

export function GoogleConnect({
  clientId,
  source,
  lastSyncedAt = null,
}: {
  clientId: string;
  source: GscSource;
  lastSyncedAt?: string | null;
}) {
  const router = useRouter();
  const [site, setSite] = useState(source?.config?.site_url ?? "");
  const [busy, setBusy] = useState(false);

  if (!source) {
    return (
      <Card className="transition-shadow hover:shadow-md">
        <CardContent className="flex flex-wrap items-center justify-between gap-3 p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
              <Search size={18} />
            </div>
            <div>
              <p className="font-medium text-ink-900">Google Search Console</p>
              <p className="text-sm text-ink-500">Pull clicks, impressions, queries and pages.</p>
            </div>
          </div>
          <Button asChild>
            <a href={`/api/google/connect?clientId=${clientId}`}>Connect</a>
          </Button>
        </CardContent>
      </Card>
    );
  }

  const sites = source.config?.sites ?? [];

  async function saveProperty() {
    setBusy(true);
    const res = await fetch("/api/google/save-property", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dataSourceId: source!.id, siteUrl: site }),
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
    router.refresh(); // re-reads the cached snapshot from the DB
  }

  async function disconnect() {
    if (!confirm("Disconnect Search Console for this client?")) return;
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
    <div className="space-y-5">
      <Card>
        <CardContent className="p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
                <Search size={18} />
              </div>
              <div>
                <p className="font-medium text-ink-900">Google Search Console</p>
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
                value={site}
                onChange={(e) => setSite(e.target.value)}
                className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
              >
                <option value="">Select a site…</option>
                {sites.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
            <Button variant="outline" onClick={saveProperty} disabled={busy || !site || site === source.config?.site_url}>
              Save
            </Button>
            <Button onClick={refreshNow} disabled={busy || !source.config?.site_url}>
              <RefreshCw size={16} className={busy ? "animate-spin" : ""} /> {busy ? "Refreshing…" : "Refresh now"}
            </Button>
          </div>

          {source.config?.site_url && (
            <p className="mt-3 text-xs text-ink-400">
              {lastSyncedAt
                ? `Auto-synced ${formatDistanceToNow(new Date(lastSyncedAt), { addSuffix: true })} · refreshes automatically every few hours`
                : "Not synced yet — click Refresh now or wait for the next scheduled sync."}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
