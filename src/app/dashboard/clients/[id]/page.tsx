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
import { liveIntegrations, listIntegrations, isConnectable, descriptor } from "@/lib/integrations/registry";
import { hasAnalyticsView, groupForIntegration } from "@/lib/integrations/analyticsViews";
import { sourceHealth, SOURCE_HEALTH } from "@/lib/integrations/status";

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
      // Same classifier the dashboard, health page and integrations page read,
      // so this section's "needs attention" can't disagree with their counts.
      health: ds
        ? sourceHealth({
            status: ds.status,
            lastSyncError: ds.last_sync_error,
            selectedAccountId: source?.selectedAccountId ?? null,
          })
        : null,
      // BigQuery drills deeper than a single account — surface its dataset/table
      // selection so its dedicated card can restore the picker state.
      selectedDatasetId: (config.dataset_id as string | null) ?? null,
      selectedTableId: (config.table_id as string | null) ?? null,
    };
  });

  const anyReady = integrations.some((i) => i.ready);

  // ── Data sources: only what's actually connected ──────────────
  // This section used to render a card for every live integration (~19),
  // burying the handful the client actually uses and pushing Reporting far
  // down the page. Discovery moved into the existing "+ Add data source"
  // modal; nothing was removed, only relocated.
  const connectedIntegrations = integrations.filter((i) => i.source !== null);
  // Anything not healthy leads the list — needs_account / sync_error /
  // needs_reconnect, in that order of how blocking they are.
  const attentionRank: Record<string, number> = { needs_reconnect: 0, sync_error: 1, needs_account: 2, healthy: 3 };
  const sortedConnected = [...connectedIntegrations].sort(
    (a, b) => (attentionRank[a.health ?? "healthy"] ?? 3) - (attentionRank[b.health ?? "healthy"] ?? 3)
  );
  const needingAttention = connectedIntegrations.filter((i) => i.health && i.health !== "healthy");

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
  // Everything in the registry, so discovery is complete: connectable providers
  // link into the existing consent screen, and the rest are listed as "Coming
  // soon" (disabled) instead of taking up a card on the main page.
  const connectableIntegrations: ConnectableIntegration[] = listIntegrations().map((def) => ({
    id: def.id,
    name: def.name,
    description: def.description,
    icon: def.icon,
    accent: def.accent,
    connected: dsByType.has(def.id),
    comingSoon: !isConnectable(def),
  }));

  const performanceSources: PerformanceSource[] = vizSources.map((i) => ({
    id: i.def.id,
    name: i.def.name,
    accountLabel: i.source?.accounts.find((a) => a.id === i.source?.selectedAccountId)?.name ?? null,
    // Metric family, so Performance only ever combines like with like.
    group: groupForIntegration(i.def.id),
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
            <Link href="/dashboard/reports/preview"><Eye size={16} /> Sample report</Link>
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

      {/* ── 2. Data sources ──────────────────────────────────────────────
          What Performance is built from, so it answers the "why is this empty?"
          question immediately after the numbers — and before Reporting, which
          depends on both. Only CONNECTED sources render here; discovery lives
          in the "Add data source" modal. */}
      <Section
        id="data-sources"
        title="Data sources"
        description={
          connectedIntegrations.length === 0
            ? "Connect a platform to start pulling this client's data."
            : `${connectedIntegrations.length} connected${needingAttention.length > 0 ? ` · ${needingAttention.length} need attention` : ""}.`
        }
        action={
          <ConnectAccountButton
            clientId={client.id}
            integrations={connectableIntegrations}
            label="Add data source"
          />
        }
      >
        {connectedIntegrations.length === 0 ? (
          <div className="rounded-xl border border-dashed border-ink-300 bg-surface-subtle px-6 py-12 text-center">
            <p className="text-sm font-medium text-ink-800">No data sources connected yet</p>
            <p className="mx-auto mt-1.5 max-w-md text-sm leading-relaxed text-ink-500">
              Connect this client&apos;s Search Console, GA4, Meta Ads or any of the other platforms.
              ReportFlow syncs the data automatically and builds their reports from it.
            </p>
            <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
              <ConnectAccountButton
                clientId={client.id}
                integrations={connectableIntegrations}
                label="Add data source"
                variant="default"
              />
              <Button asChild variant="outline" size="sm">
                <Link href="/dashboard/integrations">Browse all integrations</Link>
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {/* Anything needing action is named up front, then the cards
                themselves lead with those same sources. */}
            {needingAttention.length > 0 && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-800">
                <span className="font-semibold">
                  {needingAttention.length} source{needingAttention.length === 1 ? "" : "s"} need attention:
                </span>{" "}
                {needingAttention.map((i, n) => (
                  <span key={i.def.id}>
                    {n > 0 && ", "}
                    {i.def.name} ({SOURCE_HEALTH[i.health!].short.toLowerCase()})
                  </span>
                ))}
              </div>
            )}

            {sortedConnected.map((i) =>
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
          </div>
        )}
      </Section>

      {/* ── 3. Reporting ─────────────────────────────────────────────────
          The output stage: it depends on both the numbers above and the
          sources feeding them, so it reads last. */}
      <Section title="Reporting" description="Generate a branded report, or put delivery on a schedule.">
        <BrandingNotice hasLogo={!!agency.logo_url} />
        <div className="space-y-4">
          <GenerateReport clientId={client.id} clientName={client.name as string} ready={hasSyncedData} blockedReason={dataBlockedReason} />
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
