import type { SupabaseClient } from "@supabase/supabase-js";
import { getValidAccessToken } from "@/lib/googleTokens";
import { getIntegration } from "@/lib/integrations/registry";
import { classifyIntegrationError, reconnectMessage } from "@/lib/integrations/errors";

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
//
// Every exit path stamps last_sync_attempt_at so the batch cron rotates fairly:
// a source that keeps failing still moves to the back of the queue and can't
// starve the others (see migration 0013).
export async function syncDataSource(
  supabase: SupabaseClient,
  ds: SyncableSource
): Promise<{ ok: boolean; error?: string }> {
  const attemptedAt = new Date().toISOString();
  const def = getIntegration(ds.type);
  if (!def || !def.fetchSnapshot || !def.snapshotTable || !def.readSelected) {
    await supabase.from("data_sources").update({ last_sync_attempt_at: attemptedAt }).eq("id", ds.id);
    return { ok: false, error: `Unsupported integration: ${ds.type ?? "unknown"}` };
  }

  const accountId = def.readSelected(ds.config ?? {});
  if (!accountId) {
    // Persist the reason so the UI can explain why nothing is syncing. This is a
    // configuration gap, not an auth failure — leave status untouched.
    const error = `No ${def.accountNoun} selected`;
    await supabase
      .from("data_sources")
      .update({ last_sync_error: error, last_sync_attempt_at: attemptedAt })
      .eq("id", ds.id);
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
      .update({ last_synced_at: now, last_sync_attempt_at: now, last_sync_error: null, status: "connected" })
      .eq("id", ds.id);

    return { ok: true };
  } catch (err) {
    const message = (err as Error).message;
    // Distinguish a genuinely dead grant (needs the user to reconnect) from a
    // temporary provider/network blip (retry next run). Only the former flips
    // the source to "revoked" and surfaces a Reconnect prompt; transient errors
    // stay "error" and keep the existing tokens for the next attempt.
    const kind = classifyIntegrationError(err);
    const patch =
      kind === "reauth"
        ? { status: "revoked", last_sync_error: reconnectMessage(def.name), last_sync_attempt_at: attemptedAt }
        : { status: "error", last_sync_error: message, last_sync_attempt_at: attemptedAt };

    await supabase.from("data_sources").update(patch).eq("id", ds.id);
    return { ok: false, error: message };
  }
}
