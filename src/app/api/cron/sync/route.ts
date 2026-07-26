import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { cronAuthorized } from "@/lib/cronAuth";
import { dispatchSyncBatch, dispatchConfig } from "@/lib/syncDispatch";
import { logRouteError } from "@/lib/errorLog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Sync DISPATCHER (perf audit P0). Atomically claims a large batch of the stalest
// sources and fans them out to parallel worker invocations (see
// lib/syncDispatch.ts), so throughput scales horizontally instead of being
// capped by a single function's 60s budget. Safe to run concurrently — claiming
// is atomic (FOR UPDATE SKIP LOCKED) and fairly ordered by staleness. Tune with
// SYNC_DISPATCH_LIMIT (sources per tick) and SYNC_CHUNK_SIZE (sources per
// worker); raise the cron frequency on a plan that allows it.
export async function GET(req: Request) {
  if (!cronAuthorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 503 });

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || new URL(req.url).origin;
  const admin = createAdminClient();
  try {
    const result = await dispatchSyncBatch(admin, baseUrl, secret);

    // Heartbeat (uptime monitoring) + best-effort housekeeping. Never block.
    admin.rpc("record_heartbeat", { p_job: "sync", p_ok: true, p_detail: `claimed ${result.claimed}` }).then(() => {}, () => {});
    admin.rpc("purge_rate_limits").then(() => {}, () => {});

    return NextResponse.json({ ok: true, ...dispatchConfig(), ...result });
  } catch (err) {
    const message = await logRouteError("cron", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
