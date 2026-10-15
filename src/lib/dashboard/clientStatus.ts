// One status for a client, rolled up from its data sources. The sidebar's
// recent-client dot, the Home and Clients tables and the client page header
// all read this, so a client never looks healthy in one place and broken in
// another. Built on the shared per-source classifier (lib/integrations/status).
import type { SourceHealth } from "@/lib/integrations/status";
import type { StatusTone } from "@/components/ui/status-chip";

export type ClientStatusKey = "reconnect" | "sync_error" | "account" | "setup" | "first_sync" | "healthy";

export type ClientStatus = { key: ClientStatusKey; tone: StatusTone; label: string };

export type ClientSourceState = { health: SourceHealth; lastSyncedAt: string | null };

const STATUS: Record<ClientStatusKey, ClientStatus> = {
  reconnect: { key: "reconnect", tone: "danger", label: "Reconnect" },
  sync_error: { key: "sync_error", tone: "danger", label: "Sync error" },
  account: { key: "account", tone: "warning", label: "Choose account" },
  setup: { key: "setup", tone: "muted", label: "Needs a source" },
  first_sync: { key: "first_sync", tone: "info", label: "First sync" },
  healthy: { key: "healthy", tone: "success", label: "Healthy" },
};

/** Lower sorts first: what needs the user most. */
export const CLIENT_STATUS_PRIORITY: Record<ClientStatusKey, number> = {
  reconnect: 0,
  sync_error: 1,
  account: 2,
  setup: 3,
  first_sync: 4,
  healthy: 5,
};

export function clientStatus(sources: ClientSourceState[]): ClientStatus {
  if (sources.length === 0) return STATUS.setup;
  if (sources.some((s) => s.health === "needs_reconnect")) return STATUS.reconnect;
  if (sources.some((s) => s.health === "sync_error")) return STATUS.sync_error;
  if (sources.some((s) => s.health === "needs_account")) return STATUS.account;
  // Connected and configured, but nothing has landed yet.
  if (!sources.some((s) => s.lastSyncedAt)) return STATUS.first_sync;
  return STATUS.healthy;
}

/** Group health rows by client and roll each client up. */
export function clientStatusMap(
  rows: { clientId: string | null; health: SourceHealth; lastSyncedAt: string | null }[]
): Map<string, ClientStatus> {
  const byClient = new Map<string, ClientSourceState[]>();
  for (const r of rows) {
    if (!r.clientId) continue;
    const list = byClient.get(r.clientId) ?? [];
    list.push({ health: r.health, lastSyncedAt: r.lastSyncedAt });
    byClient.set(r.clientId, list);
  }
  const out = new Map<string, ClientStatus>();
  byClient.forEach((list, id) => out.set(id, clientStatus(list)));
  return out;
}

/** Status for a client id; a client with no rows has no sources yet. */
export function statusFor(map: Map<string, ClientStatus>, clientId: string): ClientStatus {
  return map.get(clientId) ?? STATUS.setup;
}
