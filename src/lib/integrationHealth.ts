// Integration health — per-connection status for the dashboard. Reads only the
// non-secret health columns from data_sources (never access/refresh tokens) and
// derives a token-expiration signal from token_expires_at + status.
import { unstable_cache, revalidateTag } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getIntegration } from "@/lib/integrations/registry";
import { getIntegrationName } from "@/lib/integrations/names";
import { sourceHealth, countHealth, type SourceHealth } from "@/lib/integrations/status";
import { createAdminClient } from "@/lib/supabase/admin";

const healthTag = (agencyId: string) => `integration-health-${agencyId}`;

// Call after any change to an agency's connections (connect / reconnect /
// disconnect) so the cached health rollup reflects it immediately instead of
// waiting out the TTL. Safe to call from route handlers; no-op elsewhere.
export function revalidateIntegrationHealth(agencyId: string): void {
  try {
    revalidateTag(healthTag(agencyId));
  } catch {
    /* outside a request context (e.g. cron) — the short TTL covers it */
  }
}

export type ConnectionStatus = "connected" | "error" | "revoked";
export type TokenState = "auto_refresh" | "no_expiry" | "expiring" | "reconnect";

export type IntegrationHealth = {
  id: string;
  type: string;
  providerName: string;
  clientName: string;
  displayName: string | null;
  status: ConnectionStatus;
  lastSyncedAt: string | null;
  lastSyncFailedAt: string | null;
  lastSyncError: string | null;
  tokenExpiresAt: string | null;
  token: { state: TokenState; label: string };
  /** The selected account/property id stored in config, null if none chosen. */
  selectedAccountId: string | null;
  /** Canonical one-of-four health classification — the single truth every screen reads. */
  health: SourceHealth;
};

// API-key connections store a ~100-year expiry sentinel; anything beyond ~10
// years is treated as "no real expiry".
const TEN_YEARS_MS = 10 * 365 * 24 * 60 * 60 * 1000;

function tokenState(status: ConnectionStatus, tokenExpiresAt: string | null): { state: TokenState; label: string } {
  if (status === "revoked") return { state: "reconnect", label: "Reconnect required" };
  if (!tokenExpiresAt) return { state: "no_expiry", label: "No expiry" };
  const ms = new Date(tokenExpiresAt).getTime() - Date.now();
  if (ms > TEN_YEARS_MS) return { state: "no_expiry", label: "No expiry (API key)" };
  // OAuth access tokens are short-lived and refreshed automatically by the sync;
  // an expired-but-not-revoked token is normal, not a problem.
  return { state: "auto_refresh", label: "Auto-refreshing" };
}

type Row = {
  id: string;
  type: string;
  display_name: string | null;
  status: string | null;
  last_synced_at: string | null;
  last_sync_failed_at: string | null;
  last_sync_error: string | null;
  token_expires_at: string | null;
  // Carries the selected account/property, which decides needs_account. Config
  // holds no secrets — tokens live in their own encrypted columns.
  config: Record<string, unknown> | null;
  clients: { name: string | null } | { name: string | null }[] | null;
};

function clientName(row: Row): string {
  const c = row.clients;
  const name = Array.isArray(c) ? c[0]?.name : c?.name;
  return name ?? "—";
}

// Every connected data source for the agency, newest-touched first. `supabase`
// should be the caller's RLS-scoped client; the agency filter is explicit so the
// admin client is safe too.
// Short-TTL cached health rollup for the dashboard (perf audit P2-7). The badge
// tolerates ~60s staleness, so this cuts the 5-query rollup out of most dashboard
// loads. Uses the admin client (the read is explicitly agency-scoped below), so
// it's safe outside a request's RLS session and cacheable across requests.
export function getIntegrationHealthCached(agencyId: string): Promise<IntegrationHealth[]> {
  return unstable_cache(
    () => getIntegrationHealth(createAdminClient(), agencyId),
    ["integration-health", agencyId],
    { revalidate: 60, tags: [healthTag(agencyId)] }
  )();
}

export async function getIntegrationHealth(supabase: SupabaseClient, agencyId: string): Promise<IntegrationHealth[]> {
  const { data } = await supabase
    .from("data_sources")
    .select("id, type, display_name, status, last_synced_at, last_sync_failed_at, last_sync_error, token_expires_at, config, clients(name)")
    .eq("agency_id", agencyId)
    .order("last_sync_attempt_at", { ascending: false, nullsFirst: false });

  return ((data ?? []) as Row[]).map((r) => {
    const status = (r.status ?? "connected") as ConnectionStatus;
    const def = getIntegration(r.type);
    const selectedAccountId = def?.readSelected?.((r.config ?? {}) as never) ?? null;
    return {
      id: r.id,
      type: r.type,
      providerName: def?.name ?? getIntegrationName(r.type),
      clientName: clientName(r),
      displayName: r.display_name,
      status,
      lastSyncedAt: r.last_synced_at,
      lastSyncFailedAt: r.last_sync_failed_at,
      lastSyncError: r.last_sync_error,
      tokenExpiresAt: r.token_expires_at,
      token: tokenState(status, r.token_expires_at),
      selectedAccountId,
      // The one classification every screen reads (P0-1).
      health: sourceHealth({ status, lastSyncError: r.last_sync_error, selectedAccountId }),
    };
  });
}

// Small roll-up for the dashboard summary card and the health page.
//
// Derived from the shared classifier, so "connected" now means genuinely
// healthy — a source still waiting for an account selection is reported under
// needsAccount instead of silently inflating the connected count.
export function summarize(rows: IntegrationHealth[]) {
  const counts = countHealth(rows.map((r) => r.health));
  return {
    total: counts.total,
    connected: counts.healthy,
    errored: counts.syncError,
    needsReconnect: counts.needsReconnect,
    needsAccount: counts.needsAccount,
    /** Every source that isn't healthy — the number screens should headline. */
    needsAttention: counts.needsAttention,
  };
}
