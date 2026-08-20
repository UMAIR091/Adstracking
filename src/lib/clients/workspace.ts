// The client workspace's shared data load.
//
// This is the query and derivation logic that used to sit inline at the top of
// the single client page, lifted out unchanged so the five workspace tabs read
// from one implementation instead of five copies. Nothing here is new: the
// queries, the N+1 avoidance, the health classification, the "why is this
// blocked" reasoning and the shapes handed to IntegrationCard / ClientPerformance
// / GenerateReport are exactly what the page did before.
//
// Every tab needs most of it — Overview counts sources and their health,
// Performance needs the visualizable ones, Data sources needs the cards, and
// both Reports and Automations gate on whether a synced snapshot exists — so it
// is loaded once per tab rather than split into partial loaders that would drift
// apart.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { IntegrationSource } from "@/components/IntegrationCard";
import type { PerformanceSource } from "@/components/ClientPerformance";
import type { ConnectableIntegration } from "@/components/ConnectAccountModal";
import { liveIntegrations, listIntegrations, isConnectable } from "@/lib/integrations/registry";
import { hasAnalyticsView, groupForIntegration } from "@/lib/integrations/analyticsViews";
import { sourceHealth } from "@/lib/integrations/status";
import type { CachedPeriodDays } from "@/lib/reports/periods";
import type { IntegrationDef } from "@/lib/integrations/types";

export type WorkspaceIntegration = {
  def: IntegrationDef;
  source: IntegrationSource;
  snapshot: unknown;
  status: string | null;
  lastSyncedAt: string | null;
  lastSyncError: string | null;
  ready: boolean;
  health: ReturnType<typeof sourceHealth> | null;
  selectedDatasetId: string | null;
  selectedTableId: string | null;
};

export type ClientWorkspace = {
  /** Which cached window every snapshot in this load came from. */
  periodDays: CachedPeriodDays;
  integrations: WorkspaceIntegration[];
  /** Sources the user has actually connected. */
  connectedIntegrations: WorkspaceIntegration[];
  /** Connected sources, anything unhealthy first. */
  sortedConnected: WorkspaceIntegration[];
  needingAttention: WorkspaceIntegration[];
  /** Sources with a real synced snapshot AND a chart block to render. */
  vizSources: WorkspaceIntegration[];
  performanceSources: PerformanceSource[];
  connectableIntegrations: ConnectableIntegration[];
  anyReady: boolean;
  anyConnected: boolean;
  hasSyncedData: boolean;
  /** Names whichever setup stage is actually missing, or undefined when ready. */
  dataBlockedReason: string | undefined;
};

type DsRow = {
  id: string;
  type: string;
  display_name: string | null;
  config: Record<string, unknown> | null;
  status: string | null;
  last_synced_at: string | null;
  last_sync_error: string | null;
};

// Anything not healthy leads the list — needs_account / sync_error /
// needs_reconnect, in that order of how blocking they are.
const ATTENTION_RANK: Record<string, number> = { needs_reconnect: 0, sync_error: 1, needs_account: 2, healthy: 3 };

export async function loadClientWorkspace(
  supabase: SupabaseClient,
  clientId: string,
  // Which cached snapshot window to read. Every sync stores one row per window
  // in CACHED_PERIOD_DAYS, so this only ever selects between rows that already
  // exist — no derivation, no provider call, no change to any figure. 28 stays
  // the default, so every tab but Performance loads exactly as it did before.
  periodDays: CachedPeriodDays = 28,
): Promise<ClientWorkspace> {
  // Load this client's connections + the cached snapshots for `periodDays`
  // WITHOUT an N+1:
  // one query for all data_sources, then one query per snapshot table for the
  // connected sources (was: 2 queries × every live integration ≈ 60/page load).
  const { data: dsRows } = await supabase
    .from("data_sources")
    .select("id, type, display_name, config, status, last_synced_at, last_sync_error")
    .eq("client_id", clientId);
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
        .eq("period_days", periodDays);
      for (const s of snaps ?? []) snapshotByDsId.set(s.data_source_id as string, (s.data as unknown) ?? null);
    }),
  );

  const integrations: WorkspaceIntegration[] = liveIntegrations().map((def) => {
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

  const connectedIntegrations = integrations.filter((i) => i.source !== null);
  const sortedConnected = [...connectedIntegrations].sort(
    (a, b) => (ATTENTION_RANK[a.health ?? "healthy"] ?? 3) - (ATTENTION_RANK[b.health ?? "healthy"] ?? 3),
  );
  const needingAttention = connectedIntegrations.filter((i) => i.health && i.health !== "healthy");

  const anyReady = integrations.some((i) => i.ready);
  const anyConnected = connectedIntegrations.length > 0;
  // Report generation reads a CACHED SNAPSHOT — a connected source with an
  // account selected but no completed sync still produces nothing.
  const hasSyncedData = integrations.some((i) => i.snapshot);
  const dataBlockedReason = hasSyncedData
    ? undefined
    : !anyConnected
      ? "Connect a data source before scheduling — there's nothing to report on yet."
      : !anyReady
        ? "Finish setting up the data source (choose a property or account), then run a sync."
        : "Waiting for the first sync. Use “Refresh now” on the data source — reports are built from synced data.";

  // A source only qualifies for a chart block once it has a real synced
  // snapshot — nothing here is ever fabricated.
  const vizSources = integrations.filter((i) => hasAnalyticsView(i.def.id) && i.snapshot);
  const performanceSources: PerformanceSource[] = vizSources.map((i) => ({
    id: i.def.id,
    name: i.def.name,
    accountLabel: i.source?.accounts.find((a) => a.id === i.source?.selectedAccountId)?.name ?? null,
    // Metric family, so Performance only ever combines like with like.
    group: groupForIntegration(i.def.id),
    snapshot: i.snapshot,
  }));

  // Everything in the registry, so discovery is complete: connectable providers
  // link into the existing consent screen, and the rest are listed as "Coming
  // soon" (disabled) rather than taking up a card.
  const connectableIntegrations: ConnectableIntegration[] = listIntegrations().map((def) => ({
    id: def.id,
    name: def.name,
    description: def.description,
    icon: def.icon,
    accent: def.accent,
    connected: dsByType.has(def.id),
    comingSoon: !isConnectable(def),
  }));

  return {
    periodDays,
    integrations,
    connectedIntegrations,
    sortedConnected,
    needingAttention,
    vizSources,
    performanceSources,
    connectableIntegrations,
    anyReady,
    anyConnected,
    hasSyncedData,
    dataBlockedReason,
  };
}
