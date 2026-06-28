import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { syncDataSource, type SyncableSource } from "@/lib/sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Authorize the scheduler: accept either ?key=CRON_SECRET (cron-job.org, manual)
// or an Authorization: Bearer CRON_SECRET header (Vercel Cron sets this when the
// CRON_SECRET env var is configured).
function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const key = new URL(req.url).searchParams.get("key");
  const auth = req.headers.get("authorization");
  return key === secret || auth === `Bearer ${secret}`;
}

// Refreshes the cached Search Console metrics for every connected source.
export async function GET(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const { data: sources, error } = await admin
    .from("data_sources")
    .select("id, agency_id, type, config, access_token, refresh_token, token_expires_at")
    .in("type", ["gsc", "ga4"]);
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
