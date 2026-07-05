import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { cronAuthorized } from "@/lib/cronAuth";
import { syncableTypes } from "@/lib/integrations/registry";
import { syncDataSource, type SyncableSource } from "@/lib/sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Refreshes the cached Search Console metrics for every connected source.
export async function GET(req: Request) {
  if (!cronAuthorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const { data: sources, error } = await admin
    .from("data_sources")
    .select("id, agency_id, type, config, access_token, refresh_token, token_expires_at")
    .in("type", syncableTypes());
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let synced = 0;
  let failed = 0;
  // Sequential to avoid bursting Google's quota.
  for (const ds of (sources ?? []) as SyncableSource[]) {
    const result = await syncDataSource(admin, ds);
    if (result.ok) synced++;
    else failed++;
  }

  return NextResponse.json({ ok: true, total: (sources ?? []).length, synced, failed });
}
