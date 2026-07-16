"use client";

// BigQuery connection card. Unlike the single-select IntegrationCard, BigQuery
// drills down project → dataset → table, discovering each level live from the
// read-only /api/bigquery/* routes. Test Connection, Save & Sync, Manual Sync
// and Disconnect reuse the same server routes as every other Google source, so
// this component adds UI only — no new token or tenant logic.
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import { Database, RefreshCw, AlertTriangle, PlugZap } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { IntegrationDescriptor } from "@/lib/integrations/types";
import type { IntegrationSource } from "@/components/IntegrationCard";

type Option = { id: string; name: string };

export function BigQueryCard({
  descriptor,
  source,
  selectedDatasetId,
  selectedTableId,
  status = null,
  lastSyncedAt = null,
  lastSyncError = null,
}: {
  descriptor: IntegrationDescriptor;
  clientId: string;
  source: IntegrationSource;
  selectedDatasetId: string | null;
  selectedTableId: string | null;
  status?: string | null;
  lastSyncedAt?: string | null;
  lastSyncError?: string | null;
}) {
  const router = useRouter();
  const dataSourceId = source?.id ?? "";
  const projects = source?.accounts ?? [];

  const [project, setProject] = useState(source?.selectedAccountId ?? "");
  const [dataset, setDataset] = useState(selectedDatasetId ?? "");
  const [table, setTable] = useState(selectedTableId ?? "");
  const [datasets, setDatasets] = useState<Option[]>([]);
  const [tables, setTables] = useState<Option[]>([]);
  const [loadingDatasets, setLoadingDatasets] = useState(false);
  const [loadingTables, setLoadingTables] = useState(false);
  const [busy, setBusy] = useState(false);

  // Load datasets whenever the selected project changes.
  useEffect(() => {
    if (!project || !dataSourceId) { setDatasets([]); return; }
    let active = true;
    setLoadingDatasets(true);
    fetch(`/api/bigquery/datasets?${new URLSearchParams({ dataSourceId, projectId: project })}`)
      .then((r) => r.json().then((j) => ({ ok: r.ok, j })))
      .then(({ ok, j }) => { if (!active) return; if (!ok) toast.error(j.error ?? "Couldn't load datasets"); setDatasets(ok ? (j.datasets ?? []) : []); })
      .finally(() => active && setLoadingDatasets(false));
    return () => { active = false; };
  }, [project, dataSourceId]);

  // Load tables whenever the selected dataset changes.
  useEffect(() => {
    if (!project || !dataset || !dataSourceId) { setTables([]); return; }
    let active = true;
    setLoadingTables(true);
    fetch(`/api/bigquery/tables?${new URLSearchParams({ dataSourceId, projectId: project, datasetId: dataset })}`)
      .then((r) => r.json().then((j) => ({ ok: r.ok, j })))
      .then(({ ok, j }) => { if (!active) return; if (!ok) toast.error(j.error ?? "Couldn't load tables"); setTables(ok ? (j.tables ?? []) : []); })
      .finally(() => active && setLoadingTables(false));
    return () => { active = false; };
  }, [project, dataset, dataSourceId]);

  if (!source) return null;

  const needsReconnect = status === "revoked";
  const dirty = project !== (source.selectedAccountId ?? "") || dataset !== (selectedDatasetId ?? "") || table !== (selectedTableId ?? "");

  async function testConnection() {
    setBusy(true);
    const res = await fetch("/api/bigquery/test", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dataSourceId }),
    });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return toast.error(json.error ?? "Connection test failed");
    toast.success(`Connected — ${json.projectCount} project${json.projectCount === 1 ? "" : "s"} accessible`);
  }

  async function saveSelection() {
    setBusy(true);
    const res = await fetch("/api/bigquery/select", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dataSourceId, projectId: project, datasetId: dataset || null, tableId: table || null }),
    });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return toast.error(json.error ?? "Failed to save selection");
    if (json.syncError) toast.warning(`Saved, but sync failed: ${json.syncError}`);
    else toast.success("Selection saved & synced");
    router.refresh();
  }

  async function refreshNow() {
    setBusy(true);
    const res = await fetch("/api/google/sync", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dataSourceId }),
    });
    setBusy(false);
    if (!res.ok) return toast.error((await res.json().catch(() => ({}))).error ?? "Failed to sync");
    toast.success("BigQuery data refreshed");
    router.refresh();
  }

  async function disconnect() {
    if (!confirm(`Disconnect ${descriptor.name} for this client?`)) return;
    setBusy(true);
    await fetch("/api/google/disconnect", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dataSourceId }),
    });
    setBusy(false);
    toast.success("Disconnected");
    router.refresh();
  }

  const selectClass = "h-10 w-full rounded-lg border border-ink-300 px-3 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100 disabled:bg-slate-50 disabled:text-ink-400";

  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-sky-50 text-sky-600">
              <Database size={18} />
            </div>
            <div>
              <p className="font-medium text-ink-900">{descriptor.name}</p>
              <p className="text-sm text-ink-500">Connected as {source.display_name}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="outline" size="sm" onClick={testConnection} disabled={busy}>
              <PlugZap size={15} /> Test connection
            </Button>
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
              {lastSyncError ?? `${descriptor.name} access has expired or was revoked.`} Syncing is paused until you reconnect.
            </span>
          </div>
        )}

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-ink-700">Project</label>
            <select value={project} onChange={(e) => { setProject(e.target.value); setDataset(""); setTable(""); }} className={selectClass}>
              <option value="">Select a project…</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-ink-700">Dataset</label>
            <select value={dataset} onChange={(e) => { setDataset(e.target.value); setTable(""); }} disabled={!project || loadingDatasets} className={selectClass}>
              <option value="">{loadingDatasets ? "Loading…" : "All datasets (overview)"}</option>
              {datasets.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-ink-700">Table / view</label>
            <select value={table} onChange={(e) => setTable(e.target.value)} disabled={!dataset || loadingTables} className={selectClass}>
              <option value="">{loadingTables ? "Loading…" : "Select a table…"}</option>
              {tables.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={saveSelection} disabled={busy || !project || !dirty}>
            Save &amp; sync
          </Button>
          <Button onClick={refreshNow} disabled={busy || !source.selectedAccountId}>
            <RefreshCw size={16} className={busy ? "animate-spin" : ""} /> {busy ? "Working…" : "Refresh now"}
          </Button>
        </div>

        {source.selectedAccountId && lastSyncError && !needsReconnect && (
          <div className="mt-3 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            <AlertTriangle size={14} className="mt-0.5 shrink-0" />
            <span>Last sync failed: {lastSyncError}. Click Refresh now to retry.</span>
          </div>
        )}

        {source.selectedAccountId && (
          <p className="mt-3 text-xs text-ink-400">
            {lastSyncedAt
              ? `Last synced ${formatDistanceToNow(new Date(lastSyncedAt), { addSuffix: true })} · refreshes automatically every few hours`
              : "Not synced yet — choose a table and click Save & sync, or wait for the next scheduled sync."}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
