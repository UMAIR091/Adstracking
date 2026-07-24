import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { cronAuthorized } from "@/lib/cronAuth";
import { runSyncBatch, batchSize } from "@/lib/syncBatch";
import { logRouteError } from "@/lib/errorLog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Refreshes cached provider metrics for a BOUNDED batch of the stalest connected
// sources per invocation (see lib/syncBatch.ts). Designed to be called
// frequently: batch size × runs-per-day must exceed the total connected sources
// so every source is refreshed daily. Tune with SYNC_BATCH_SIZE and the cron
// schedule. Safe to run concurrently — token refresh is single-flight and each
// source is claimed by staleness order.
export async function GET(req: Request) {
  if (!cronAuthorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  try {
    const { claimed, synced, failed } = await runSyncBatch(admin, batchSize());

    // Best-effort housekeeping: drop expired rate-limit buckets so the table
    // stays small. Never affects the response.
    admin.rpc("purge_rate_limits").then(() => {}, () => {});

    return NextResponse.json({ ok: true, batch: batchSize(), claimed, synced, failed });
  } catch (err) {
    // Per-source failures are already logged inside syncDataSource; this catches
    // a batch-level crash (e.g. the claim query failing).
    const message = await logRouteError("cron", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
