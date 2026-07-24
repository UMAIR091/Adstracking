import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { cronAuthorized } from "@/lib/cronAuth";
import { runScheduledReports, scheduleBatchSize } from "@/lib/scheduledReports";
import { logRouteError } from "@/lib/errorLog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Generates and emails reports for due schedules — now bounded, atomically
// claimed, and idempotent (see lib/scheduledReports.ts). Safe to run frequently
// and concurrently: each occurrence is claimed by exactly one worker via a
// unique delivery-ledger row, next_run_at advances before any send, and a
// mid-flight crash is retried (never duplicated) on a later run. Best-effort
// retention purge runs opportunistically so metric_daily can't grow unbounded.
export async function GET(req: Request) {
  if (!cronAuthorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  try {
    const result = await runScheduledReports(admin, scheduleBatchSize());

    // Housekeeping (best-effort; never affects the response).
    admin.rpc("purge_old_metrics", { p_days: Number(process.env.METRIC_RETENTION_DAYS) || 400 }).then(
      () => {},
      () => {}
    );

    return NextResponse.json({ ok: true, batch: scheduleBatchSize(), ...result });
  } catch (err) {
    const message = await logRouteError("cron", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
