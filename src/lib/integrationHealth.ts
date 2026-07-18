// Integration health — per-connection status for the dashboard. Reads only the
// non-secret health columns from data_sources (never access/refresh tokens) and
// derives a token-expiration signal from token_expires_at + status.
import type { SupabaseClient } from "@supabase/supabase-js";
import { getIntegration } from "@/lib/integrations/registry";

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
export async function getIntegrationHealth(supabase: SupabaseClient, agencyId: string): Promise<IntegrationHealth[]> {
  const { data } = await supabase
    .from("data_sources")
    .select("id, type, display_name, status, last_synced_at, last_sync_failed_at, last_sync_error, token_expires_at, clients(name)")
    .eq("agency_id", agencyId)
    .order("last_sync_attempt_at", { ascending: false, nullsFirst: false });

  return ((data ?? []) as Row[]).map((r) => {
    const status = (r.status ?? "connected") as ConnectionStatus;
    return {
      id: r.id,
      type: r.type,
      providerName: getIntegration(r.type)?.name ?? r.type,
      clientName: clientName(r),
      displayName: r.display_name,
      status,
      lastSyncedAt: r.last_synced_at,
      lastSyncFailedAt: r.last_sync_failed_at,
      lastSyncError: r.last_sync_error,
      tokenExpiresAt: r.token_expires_at,
      token: tokenState(status, r.token_expires_at),
    };
  });
}

// Small roll-up for the dashboard summary card.
export function summarize(rows: IntegrationHealth[]) {
  return {
    total: rows.length,
    connected: rows.filter((r) => r.status === "connected").length,
    errored: rows.filter((r) => r.status === "error").length,
    needsReconnect: rows.filter((r) => r.status === "revoked").length,
  };
}
