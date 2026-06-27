import type { SupabaseClient } from "@supabase/supabase-js";
import { getValidAccessToken } from "@/lib/googleTokens";
import { fetchGscReportWithComparison } from "@/lib/google";

// Periods we keep warm in the cache (match the report/analytics date ranges).
const PERIODS = [28, 90];

export type SyncableSource = {
  id: string;
  agency_id: string;
  config: { site_url?: string | null } | null;
  access_token: string | null;
  refresh_token: string | null;
  token_expires_at: string | null;
};

// Pulls Search Console data for one connection and upserts it into gsc_snapshots,
// then records sync status on the data source. Never throws — returns a result so
// the cron job can keep going across all sources.
export async function syncDataSource(
  supabase: SupabaseClient,
  ds: SyncableSource
): Promise<{ ok: boolean; error?: string }> {
  const siteUrl = ds.config?.site_url;
  if (!siteUrl) return { ok: false, error: "No property selected" };

  try {
    const accessToken = await getValidAccessToken(supabase, ds);
    const now = new Date().toISOString();

    for (const period of PERIODS) {
      // Pull the period plus the previous one so the cached snapshot already
      // contains period-over-period totals and query movers — report generation
      // then needs no live Google calls.
      const data = await fetchGscReportWithComparison(accessToken, siteUrl, period);
      await supabase
        .from("gsc_snapshots")
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
