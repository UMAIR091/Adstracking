// The client list for the "New report" dialog, built from data the dashboard
// layout already has: active clients plus the integration-health rows. A client
// can be picked once one of its sources has synced data, since generation reads
// cached snapshots, never live APIs. Each source carries an honest note when it
// may be stale or won't contribute.
import type { SourceHealth } from "@/lib/integrations/status";
import type { GenClient } from "@/components/GenerateReportDialog";

type HealthRow = { clientId: string | null; type: string; providerName: string; health: SourceHealth; lastSyncedAt: string | null };

export function sourceNote(health: SourceHealth, lastSyncedAt: string | null): string | null {
  if (health === "needs_account") return "no account selected, not included";
  if (health === "needs_reconnect") return lastSyncedAt ? "needs reconnecting, may be out of date" : "needs reconnecting";
  if (health === "sync_error") return lastSyncedAt ? "last sync failed, may be out of date" : "sync failing";
  if (!lastSyncedAt) return "waiting for first sync";
  return null;
}

export function buildGenClients(
  clients: { id: string; name: string; email: string | null }[],
  rows: HealthRow[]
): GenClient[] {
  return clients.map((c) => {
    const mine = rows.filter((r) => r.clientId === c.id);
    return {
      id: c.id,
      name: c.name,
      email: c.email,
      ready: mine.some((r) => r.lastSyncedAt && r.health !== "needs_account"),
      sources: mine.map((r) => ({ type: r.type, name: r.providerName, note: sourceNote(r.health, r.lastSyncedAt) })),
    };
  });
}
