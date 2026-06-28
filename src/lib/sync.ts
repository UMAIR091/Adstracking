import type { SupabaseClient } from "@supabase/supabase-js";
import { getValidAccessToken } from "@/lib/googleTokens";
import { fetchGscReportWithComparison, fetchGa4ReportWithComparison } from "@/lib/google";

// Periods we keep warm in the cache (match the report/analytics date ranges).
const PERIODS = [28, 90];

export type SyncableSource = {
  id: string;
  agency_id: string;
  type?: string | null; // 'gsc' | 'ga4'
  config: { site_url?: string | null; property_id?: string | null } | null;
  access_token: string | null;
  refresh_token: string | null;
  token_expires_at: string | null;
};

type SyncResult = { ok: boolean; error?: string };

// Dispatches a data source to the right connector sync. Both connectors share
// the same shape: pull the period (+ previous) and upsert one snapshot row per
// period, then stamp sync status on the source. Never throws, so the cron job
// can keep going across every source.
export async function syncDataSource(supabase: SupabaseClient, ds: SyncableSource): Promise<SyncResult> {
  return ds.type === "ga4" ? syncGa4(supabase, ds) : syncGsc(supabase, ds);
}

async function markError(supabase: SupabaseClient, id: string, message: string): Promise<SyncResult> {
  await supabase.from("data_sources").update({ last_sync_error: message, status: "error" }).eq("id", id);
  return { ok: false, error: message };
}

async function markSynced(supabase: SupabaseClient, id: string, now: string): Promise<void> {
  await supabase.from("data_sources").update({ last_synced_at: now, last_sync_error: null, status: "connected" }).eq("id", id);
}

// Pulls Search Console data for one connection and upserts it into gsc_snapshots.
async function syncGsc(supabase: SupabaseClient, ds: SyncableSource): Promise<SyncResult> {
  const siteUrl = ds.config?.site_url;
  if (!siteUrl) return { ok: false, error: "No property selected" };

  try {
    const accessToken = await getValidAccessToken(supabase, ds);
    const now = new Date().toISOString();
    for (const period of PERIODS) {
      const data = await fetchGscReportWithComparison(accessToken, siteUrl, period);
      await supabase
        .from("gsc_snapshots")
        .upsert(
          { data_source_id: ds.id, agency_id: ds.agency_id, period_days: period, data, synced_at: now },
          { onConflict: "data_source_id,period_days" }
        );
    }
    await markSynced(supabase, ds.id, now);
    return { ok: true };
  } catch (err) {
    return markError(supabase, ds.id, (err as Error).message);
  }
}

// Pulls GA4 data for one connection and upserts it into ga4_snapshots.
async function syncGa4(supabase: SupabaseClient, ds: SyncableSource): Promise<SyncResult> {
  const propertyId = ds.config?.property_id;
  if (!propertyId) return { ok: false, error: "No GA4 property selected" };

  try {
    const accessToken = await getValidAccessToken(supabase, ds);
    const now = new Date().toISOString();
    for (const period of PERIODS) {
      const data = await fetchGa4ReportWithComparison(accessToken, propertyId, period);
      await supabase
        .from("ga4_snapshots")
        .upsert(
          { data_source_id: ds.id, agency_id: ds.agency_id, period_days: period, data, synced_at: now },
          { onConflict: "data_source_id,period_days" }
        );
    }
    await markSynced(supabase, ds.id, now);
    return { ok: true };
  } catch (err) {
    return markError(supabase, ds.id, (err as Error).message);
  }
}
