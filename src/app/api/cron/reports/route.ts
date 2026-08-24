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

    // Heartbeat — AWAITED, deliberately.
    //
    // This used to be fire-and-forget. On a serverless runtime the instance can
    // be frozen the moment the response is returned, so an un-awaited write is
    // not guaranteed to reach the database — and this row is the only evidence
    // that this cron ran at all. When there are no due schedules the run has no
    // other side effect whatsoever, so a dropped heartbeat is indistinguishable
    // from the cron never having been invoked. That ambiguity is exactly what
    // made this job's execution unverifiable, so the write now blocks the
    // response.
    //
    // A heartbeat failure must NOT fail the cron: the run itself already
    // succeeded, and reporting 500 would make a healthy run look broken (and,
    // on some schedulers, trigger a retry of work already done). The error is
    // swallowed here and surfaced in the response body instead.
    let heartbeat: "ok" | "failed" = "ok";
    try {
      const { error } = await admin.rpc("record_heartbeat", {
        p_job: "reports",
        p_ok: true,
        p_detail: `sent ${result.sent} failed ${result.failed}`,
      });
      if (error) heartbeat = "failed";
    } catch {
      heartbeat = "failed";
    }

    // Housekeeping stays best-effort and non-blocking — it is not evidence of
    // anything, and a slow purge should never delay the cron response.
    admin.rpc("purge_old_metrics", { p_days: Number(process.env.METRIC_RETENTION_DAYS) || 400 }).then(
      () => {},
      () => {}
    );

    return NextResponse.json({ ok: true, batch: scheduleBatchSize(), heartbeat, ...result });
  } catch (err) {
    const message = await logRouteError("cron", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
