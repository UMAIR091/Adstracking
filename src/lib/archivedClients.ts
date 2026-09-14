// Archived clients are paused.
//
// The plan's client limit counts ACTIVE clients (lib/billing/limits.ts and the
// create/restore functions in migration 0037), so archiving a client frees its
// slot. That is only fair if the archived client stops using the slot. It keeps
// its history (past reports, share links, stored metrics, settings) but does no
// new work: no syncs, no report generation, no scheduled deliveries. Otherwise
// archive, add, archive, add would keep any number of clients working on a plan
// that allows five.
//
// The flag can be trusted for this. Tenants may archive directly, but the only
// way back is restore_client_within_limit(), which re-checks the limit (0037);
// the 0038 trigger refuses a direct un-archive.
//
// Enforced where the work happens, so every entry point is covered:
//   syncDataSource()        cron sync, "Refresh now", first sync after connecting
//   createClientReport()    manual generate, "Send now", scheduled delivery
//   runScheduledReports()   skips archived clients' deliveries before generating
import type { SupabaseClient } from "@supabase/supabase-js";

export const ARCHIVED_CLIENT_ERROR = "This client is archived. Restore it to sync its data or create reports.";

// Whether a data source belongs to a client that can't do work: archived, or no
// longer there. Throws when the state can't be read, so callers fail closed.
export async function isSourceClientPaused(supabase: SupabaseClient, dataSourceId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("data_sources")
    .select("client_id, clients(archived)")
    .eq("id", dataSourceId)
    .maybeSingle();
  if (error) throw new Error(`Couldn't read the client's archive state: ${error.message}`);
  const embedded = data?.clients as { archived?: boolean | null } | { archived?: boolean | null }[] | null | undefined;
  const client = Array.isArray(embedded) ? embedded[0] : embedded;
  return client?.archived !== false;
}

// Of the given client ids, the ones that can't do work: archived, or no longer
// there. One query for a whole batch. Throws when the state can't be read.
export async function pausedClientIds(supabase: SupabaseClient, clientIds: string[]): Promise<Set<string>> {
  const unique = Array.from(new Set(clientIds));
  if (unique.length === 0) return new Set();
  const { data, error } = await supabase.from("clients").select("id, archived").in("id", unique);
  if (error) throw new Error(`Couldn't read client archive state: ${error.message}`);
  const active = new Set((data ?? []).filter((c) => c.archived === false).map((c) => c.id as string));
  return new Set(unique.filter((id) => !active.has(id)));
}
