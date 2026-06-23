import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { syncDataSource, type SyncableSource } from "@/lib/sync";

export const runtime = "nodejs";

// On-demand "Refresh now" — re-syncs a single connection for the signed-in user.
// RLS scopes the lookup to the user's own data sources.
export async function POST(req: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const dataSourceId: string | undefined = body?.dataSourceId;
  if (!dataSourceId) return NextResponse.json({ error: "dataSourceId required" }, { status: 400 });

  const { data: ds } = await supabase
    .from("data_sources")
    .select("id, agency_id, config, access_token, refresh_token, token_expires_at")
    .eq("id", dataSourceId)
    .maybeSingle();
  if (!ds) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const result = await syncDataSource(supabase, ds as SyncableSource);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 502 });

  return NextResponse.json({ ok: true });
}
