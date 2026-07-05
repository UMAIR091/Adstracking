import type { SupabaseClient } from "@supabase/supabase-js";
import { getValidAccessToken } from "@/lib/googleTokens";
import { getIntegration } from "@/lib/integrations/registry";

// Periods we keep warm in the cache (match the report/analytics date ranges).
const PERIODS = [28, 90];

export type SyncableSource = {
  id: string;
  agency_id: string;
  type?: string | null;
  config: Record<string, unknown> | null;
  access_token: string | null;
  refresh_token: string | null;
  token_expires_at: string | null;
};

// Syncs one data source of any integration type: resolve the provider from the
// registry, get a valid token, pull each period, and upsert into the provider's
// snapshot table. Records sync status on the source. Never throws, so the cron
// can keep going across every source.
export async function syncDataSource(
  supabase: SupabaseClient,
  ds: SyncableSource
): Promise<{ ok: boolean; error?: string }> {
  const def = getIntegration(ds.type);
  if (!def || !def.fetchSnapshot || !def.snapshotTable || !def.readSelected) {
    return { ok: false, error: `Unsupported integration: ${ds.type ?? "unknown"}` };
  }

  const accountId = def.readSelected(ds.config ?? {});
  if (!accountId) {
    // Persist the reason so the UI can explain why nothing is syncing.
    const error = `No ${def.accountNoun} selected`;
    await supabase.from("data_sources").update({ last_sync_error: error }).eq("id", ds.id);
    return { ok: false, error };
  }

  try {
    const accessToken = await getValidAccessToken(supabase, ds);
    const now = new Date().toISOString();

    for (const period of PERIODS) {
      const data = await def.fetchSnapshot(accessToken, accountId, period);
      await supabase
        .from(def.snapshotTable)
        .upsert(
          { data_source_id: ds.id, agency_id: ds.agency_id, period_days: period, data, synced_at: now },
          { onConflict: "data_source_id,period_days" }
        );
    }

    await supabase
      .from("data_sources")
      .update({ last_synced_at: now, last_sync_error: null, status: "connected" })
      .eq("id", ds.id);

    return { ok: true };
  } catch (err) {
    const message = (err as Error).message;
    await supabase
      .from("data_sources")
      .update({ last_sync_error: message, status: "error" })
      .eq("id", ds.id);
    return { ok: false, error: message };
  }
}
