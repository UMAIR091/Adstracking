import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { syncDataSource, type SyncableSource } from "@/lib/sync";
import { getIntegration } from "@/lib/integrations/registry";

export const runtime = "nodejs";

// Saves which account/property a data source reports on. Accepts a generic
// `accountId` (keyed by the provider's config field) and keeps the legacy
// `siteUrl`/`propertyId` fields for backward compatibility.
export async function POST(req: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const { dataSourceId, siteUrl, propertyId, accountId } = body ?? {};
  const value: string | undefined = accountId ?? propertyId ?? siteUrl;
  if (!dataSourceId || !value) {
    return NextResponse.json({ error: "dataSourceId and an account/property are required" }, { status: 400 });
  }

  const { data: ds } = await supabase.from("data_sources").select("type, config").eq("id", dataSourceId).maybeSingle();
  if (!ds) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Store under the integration's account-config key (e.g. site_url, property_id).
  const key = getIntegration(ds.type as string)?.accountConfigKey ?? (propertyId ? "property_id" : "site_url");
  const config = { ...(ds.config as object), [key]: value };
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
