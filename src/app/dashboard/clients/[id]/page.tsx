import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Eye } from "lucide-react";
import { ConnectStatusToast } from "@/components/ConnectStatusToast";
import { getCurrentUserAndAgency } from "@/lib/agency";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { IntegrationCard, type IntegrationSource } from "@/components/IntegrationCard";
import { BigQueryCard } from "@/components/BigQueryCard";
import { ClientPerformance, type PerformanceSource } from "@/components/ClientPerformance";
import { ConnectAccountButton, type ConnectableIntegration } from "@/components/ConnectAccountModal";
import { GenerateReport } from "@/components/GenerateReport";
import { BrandingNotice } from "@/components/BrandingNotice";
import { ReportSchedule, type ScheduleData } from "@/components/ReportSchedule";
import { DeliveryHistory, type DeliveryLog } from "@/components/DeliveryHistory";
import { SyncStatusPoller } from "@/components/SyncStatusPoller";
import { liveIntegrations, descriptor } from "@/lib/integrations/registry";
import { hasAnalyticsView } from "@/lib/integrations/analyticsViews";

export const dynamic = "force-dynamic";

// Which sources render a chart block comes from lib/integrations/analyticsViews
// — the same module ClientAnalytics uses. This page used to keep its own list,
// which fell eight integrations behind the renderer and silently hid them.
// Every block still renders only once a real synced snapshot exists, so no
// source ever displays placeholder analytics.

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
      ? "Connect a data source below before scheduling — there's nothing to report on yet."
      : !anyReady
        ? "Finish setting up the data source below (choose a property or account), then run a sync."
        : "Waiting for the first sync. Use “Refresh now” on the data source below — reports are built from synced data.";
  // Sources the user has actually connected — drives the awaiting-sync state
  // that replaces the old sample analytics.
  const connectedSources = integrations.filter((i) => i.source !== null);

  // Performance leads the page, so resolve which sources can actually render a
  // chart block before laying anything out. A source only qualifies once it has
  // a real synced snapshot — nothing here is ever fabricated.
  const vizSources = integrations.filter((i) => hasAnalyticsView(i.def.id) && i.snapshot);

  // Shape the visualizable sources for the account switcher, resolving each
  // source's selected account to its display name from the config already
  // loaded above — no extra query, no second data model.
  // Everything connectable for this client, for the "+ Connect account" modal.
  // Reuses the registry's live set — the modal only links to the existing
  // consent screen, so no connection logic lives in the UI.
  const connectableIntegrations: ConnectableIntegration[] = liveIntegrations().map((def) => ({
    id: def.id,
    name: def.name,
    description: def.description,
    icon: def.icon,
    accent: def.accent,
    connected: dsByType.has(def.id),
  }));

  const performanceSources: PerformanceSource[] = vizSources.map((i) => ({
    id: i.def.id,
    name: i.def.name,
    accountLabel: i.source?.accounts.find((a) => a.id === i.source?.selectedAccountId)?.name ?? null,
    snapshot: i.snapshot,
  }));

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

      <div>
      {/* ── 1. Performance ──────────────────────────────────────────────
          The reason an agency opens a client, so it leads the page. Rendered
          only from a real synced snapshot; a connected source with no data yet
          gets the awaiting-sync state, and a client with nothing connected gets
          a first-run prompt. Nothing here is ever fabricated. */}
      {vizSources.length > 0 ? (
        <Section
          title="Performance"
          description="Live metrics from every connected source, for the last 28 days."
          action={<ConnectAccountButton clientId={client.id} integrations={connectableIntegrations} />}
        >
          <ClientPerformance sources={performanceSources} />
        </Section>
      ) : connectedSources.length > 0 ? (
        <Section
          title="Performance"
          description="Your first sync is on its way — metrics appear here as soon as it lands."
          action={<ConnectAccountButton clientId={client.id} integrations={connectableIntegrations} />}
        >
          <SyncStatusPoller
            clientId={client.id}
            sourceCount={connectedSources.length}
            initialFailing={connectedSources.filter((i) => i.lastSyncError).length}
          />
        </Section>
      ) : (
        <Section
          title="Performance"
          description="Connect a source and this client's metrics appear here automatically."
          action={<ConnectAccountButton clientId={client.id} integrations={connectableIntegrations} />}
        >
          <div className="rounded-xl border border-dashed border-ink-300 bg-surface-subtle px-6 py-12 text-center">
            <p className="text-sm font-medium text-ink-800">No performance data yet</p>
            <p className="mx-auto mt-1.5 max-w-md text-sm leading-relaxed text-ink-500">
              Connect Search Console, GA4, Meta Ads or any other source below. ReportFlow syncs the data and
              builds this client&apos;s dashboard for you.
            </p>
            <Button asChild className="mt-5">
              <a href="#data-sources">Connect a data source</a>
            </Button>
          </div>
        </Section>
      )}

      {/* ── 2. Reporting ── */}
      <Section title="Reporting" description="Generate a branded report, or put delivery on a schedule.">
        <BrandingNotice hasLogo={!!agency.logo_url} />
        <div className="space-y-4">
          <GenerateReport clientId={client.id} ready={hasSyncedData} blockedReason={dataBlockedReason} />
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
      </Section>

      {/* ── 3. Data sources ──────────────────────────────────────────────
          Setup, not the daily view — so it sits below the numbers it feeds. */}
      <Section
        id="data-sources"
        title="Data sources"
        description="Everything connected for this client. Add or reconnect a source here."
      >
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
      </Section>
      </div>
    </div>
  );
}

// Consistent section framing for the client page: a titled band with an
// optional one-line description, so Performance, Reporting and Data sources
// read as three deliberate parts rather than a stack of headings.
function Section({
  id,
  title,
  description,
  action,
  children,
}: {
  id?: string;
  title: string;
  description?: string;
  /** Optional control rendered on the header's trailing edge. */
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section id={id} className="mt-10 scroll-mt-6 first:mt-0">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3 border-b border-slate-100 pb-3">
        <div>
          <h2 className="text-base font-semibold tracking-tight text-ink-900">{title}</h2>
          {description ? <p className="mt-0.5 text-sm text-ink-500">{description}</p> : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}
