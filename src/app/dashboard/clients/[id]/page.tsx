import Link from "next/link";
import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Eye } from "lucide-react";
import { ConnectStatusToast } from "@/components/ConnectStatusToast";
import { getCurrentUserAndAgency } from "@/lib/agency";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { IntegrationCard, type IntegrationSource } from "@/components/IntegrationCard";
import { BigQueryCard } from "@/components/BigQueryCard";
import { ClientAnalytics } from "@/components/ClientAnalytics";
import { GenerateReport } from "@/components/GenerateReport";
import { BrandingNotice } from "@/components/BrandingNotice";
import { ReportSchedule, type ScheduleData } from "@/components/ReportSchedule";
import { DeliveryHistory, type DeliveryLog } from "@/components/DeliveryHistory";
import { SyncStatusPoller } from "@/components/SyncStatusPoller";
import { liveIntegrations, descriptor } from "@/lib/integrations/registry";

export const dynamic = "force-dynamic";

// Sources with a dashboard block. Every one renders only once a real synced
// snapshot exists — no source ever displays placeholder analytics. (The chart
// rendering itself lives in the lazy-loaded ClientAnalytics client component.)
const HAS_VIZ = new Set(["gsc", "ga4", "instagram", "google_ads", "meta_ads", "linkedin_ads", "tiktok_ads", "pinterest_ads", "snapchat_ads", "reddit_ads", "amazon_ads", "x_ads", "adobe_analytics", "gbp", "shopify", "sheets", "hubspot", "salesforce", "bigquery", "youtube_analytics", "moz", "activecampaign", "constantcontact", "campaignmonitor"]);

export default async function ClientDetailPage({ params }: { params: { id: string } }) {
  const { user, agency } = await getCurrentUserAndAgency();
  if (!user || !agency) redirect("/login");

  const supabase = createClient();
  const { data: client } = await supabase
    .from("clients")
    .select("id, name, website, email")
    .eq("id", params.id)
    .maybeSingle();
  if (!client) notFound();

  // Load this client's connections + cached 28-day snapshots WITHOUT an N+1:
  // one query for all data_sources, then one query per snapshot table for the
  // connected sources (was: 2 queries × every live integration ≈ 60/page load).
  type DsRow = {
    id: string; type: string; display_name: string | null;
    config: Record<string, unknown> | null; status: string | null;
    last_synced_at: string | null; last_sync_error: string | null;
  };
  const { data: dsRows } = await supabase
    .from("data_sources")
    .select("id, type, display_name, config, status, last_synced_at, last_sync_error")
    .eq("client_id", client.id);
  const dsByType = new Map<string, DsRow>();
  for (const d of (dsRows ?? []) as DsRow[]) dsByType.set(d.type, d);

  // Group connected sources by snapshot table, then bulk-fetch snapshots.
  const tableToIds = new Map<string, string[]>();
  for (const def of liveIntegrations()) {
    const ds = dsByType.get(def.id);
    if (ds?.id && def.snapshotTable) {
      const arr = tableToIds.get(def.snapshotTable) ?? [];
      arr.push(ds.id);
      tableToIds.set(def.snapshotTable, arr);
    }
  }
  const snapshotByDsId = new Map<string, unknown>();
  await Promise.all(
    Array.from(tableToIds, async ([table, ids]) => {
      const { data: snaps } = await supabase
        .from(table)
        .select("data_source_id, data")
        .in("data_source_id", ids)
        .eq("period_days", 28);
      for (const s of snaps ?? []) snapshotByDsId.set(s.data_source_id as string, (s.data as unknown) ?? null);
    })
  );

  const integrations = liveIntegrations().map((def) => {
    const ds = dsByType.get(def.id) ?? null;
    const snapshot = ds?.id ? snapshotByDsId.get(ds.id) ?? null : null;
    const config = (ds?.config as Record<string, unknown> | null) ?? {};
    const source: IntegrationSource = ds
      ? {
          id: ds.id,
          display_name: ds.display_name ?? null,
          accounts: def.readAccounts?.(config) ?? [],
          selectedAccountId: def.readSelected?.(config) ?? null,
        }
      : null;

    return {
      def,
      source,
      snapshot,
      status: ds?.status ?? null,
      lastSyncedAt: ds?.last_synced_at ?? null,
      lastSyncError: ds?.last_sync_error ?? null,
      ready: Boolean(source?.selectedAccountId),
      // BigQuery drills deeper than a single account — surface its dataset/table
      // selection so its dedicated card can restore the picker state.
      selectedDatasetId: (config.dataset_id as string | null) ?? null,
      selectedTableId: (config.table_id as string | null) ?? null,
    };
  });

  const anyReady = integrations.some((i) => i.ready);

  // Report generation reads a CACHED SNAPSHOT — a connected source with an
  // account selected but no completed sync still produces nothing. Gate the
  // generate and delivery actions on the snapshot, and name whichever stage is
  // actually missing so the message is actionable rather than generic.
  const hasSyncedData = integrations.some((i) => i.snapshot);
  const anyConnected = integrations.some((i) => i.source !== null);
  const dataBlockedReason = hasSyncedData
    ? undefined
    : !anyConnected
      ? "Connect a data source above before scheduling — there's nothing to report on yet."
      : !anyReady
        ? "Finish setting up the data source above (choose a property or account), then run a sync."
        : "Waiting for the first sync. Use “Refresh now” on the data source above — reports are built from synced data.";
  // Sources the user has actually connected — drives the awaiting-sync state
  // that replaces the old sample analytics.
  const connectedSources = integrations.filter((i) => i.source !== null);

  const { data: schedule } = await supabase
    .from("report_schedules")
    .select("frequency, recipients, enabled, next_run_at, send_day, send_hour, subject, message")
    .eq("client_id", client.id)
    .maybeSingle();

  const { data: deliveryLogs } = await supabase
    .from("email_logs")
    .select("id, to_email, subject, status, sent_at, attempts, error, reports!inner(client_id)")
    .eq("reports.client_id", client.id)
    .order("sent_at", { ascending: false })
    .limit(8);

  return (
    <div>
      <Suspense fallback={null}>
        <ConnectStatusToast />
      </Suspense>
      <Link href="/dashboard/clients" className="inline-flex items-center gap-1 text-sm text-ink-500 hover:text-ink-700">
        <ArrowLeft size={15} /> Back to clients
      </Link>
      <div className="mb-6 mt-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink-900">{client.name}</h1>
          <p className="text-sm text-ink-500">{client.website || client.email || "—"}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline">
            <Link href="/dashboard/reports/preview"><Eye size={16} /> Preview report</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href={`/dashboard/clients/${client.id}/edit`}>Edit client</Link>
          </Button>
        </div>
      </div>

      <h2 className="mb-3 text-sm font-medium text-ink-700">Data sources</h2>
      <div className="space-y-3">
        {integrations.map((i) =>
          i.def.id === "bigquery" ? (
            <BigQueryCard
              key={i.def.id}
              descriptor={descriptor(i.def)}
              clientId={client.id}
              source={i.source}
              selectedDatasetId={i.selectedDatasetId}
              selectedTableId={i.selectedTableId}
              status={i.status}
              lastSyncedAt={i.lastSyncedAt}
              lastSyncError={i.lastSyncError}
            />
          ) : (
            <IntegrationCard
              key={i.def.id}
              descriptor={descriptor(i.def)}
              clientId={client.id}
              source={i.source}
              status={i.status}
              lastSyncedAt={i.lastSyncedAt}
              lastSyncError={i.lastSyncError}
            />
          )
        )}
        <Link
          href="/dashboard/integrations"
          className="block rounded-xl border border-dashed border-ink-300 bg-surface-subtle p-5 text-sm text-ink-500 transition-colors hover:border-ink-400 hover:text-ink-700"
        >
          Google Ads, Shopify, HubSpot, LinkedIn Ads, TikTok Ads and more — see all integrations →
        </Link>
      </div>

      {/* Performance — only ever rendered from a real synced snapshot. A
          connected source with no data yet shows the awaiting-sync state
          instead, so nothing on this page is fabricated. */}
      {integrations.filter((i) => HAS_VIZ.has(i.def.id) && i.snapshot).map((i) => (
        <div key={i.def.id} className="mt-8">
          <h2 className="mb-3 text-sm font-medium text-ink-700">{i.def.name}</h2>
          <ClientAnalytics id={i.def.id} snapshot={i.snapshot} />
        </div>
      ))}

      {connectedSources.length > 0 && !integrations.some((i) => HAS_VIZ.has(i.def.id) && i.snapshot) && (
        <div className="mt-8">
          <SyncStatusPoller
            clientId={client.id}
            sourceCount={connectedSources.length}
            initialFailing={connectedSources.filter((i) => i.lastSyncError).length}
          />
        </div>
      )}

      <BrandingNotice hasLogo={!!agency.logo_url} />

      <div className="mt-8">
        <GenerateReport clientId={client.id} ready={hasSyncedData} blockedReason={dataBlockedReason} />
      </div>

      <div className="mt-4 space-y-4">
        <ReportSchedule
          clientId={client.id}
          clientEmail={(client.email as string | null) ?? null}
          schedule={(schedule as unknown as ScheduleData) ?? null}
          brandingReady={!!agency.logo_url}
          dataReady={hasSyncedData}
          dataBlockedReason={dataBlockedReason}
        />
        {/* On a client page an empty history is noise — the card is omitted. */}
        <DeliveryHistory logs={(deliveryLogs as unknown as DeliveryLog[]) ?? []} showEmpty={false} />
      </div>
    </div>
  );
}
