import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { syncDataSource, type SyncableSource } from "@/lib/sync";

export const runtime = "nodejs";

// Saves which Search Console site_url a data source reports on.
export async function POST(req: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const { dataSourceId, siteUrl, propertyId } = body ?? {};
  if (!dataSourceId || (!siteUrl && !propertyId)) {
    return NextResponse.json({ error: "dataSourceId and a siteUrl or propertyId are required" }, { status: 400 });
  }

  const { data: ds } = await supabase.from("data_sources").select("config").eq("id", dataSourceId).maybeSingle();
  if (!ds) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // GSC sources store site_url; GA4 sources store property_id.
  const change = propertyId ? { property_id: propertyId } : { site_url: siteUrl };
  const config = { ...(ds.config as object), ...change };
  const { error } = await supabase.from("data_sources").update({ config }).eq("id", dataSourceId);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  // Sync immediately so cached analytics are available without waiting for cron.
  const { data: full } = await supabase
    .from("data_sources")
    .select("id, agency_id, type, config, access_token, refresh_token, token_expires_at")
    .eq("id", dataSourceId)
    .maybeSingle();
  if (full) await syncDataSource(supabase, full as SyncableSource);

  return NextResponse.json({ ok: true });
}
