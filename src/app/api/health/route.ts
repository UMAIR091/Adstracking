import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { monitoringConfigured } from "@/lib/monitoring";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Lightweight health check for external uptime/synthetic monitors (audit #5).
// Verifies database reachability with a cheap, index-only query and reports
// whether error monitoring is wired up in this environment. Returns 200 when
// healthy, 503 otherwise — no secrets, no tenant data. Never cached.
export async function GET() {
  const startedAt = Date.now();
  let dbOk = false;
  let crons: Record<string, { lastRunAt: string | null; stale: boolean }> = {};
  try {
    const admin = createAdminClient();
    // HEAD count on a tiny system-owned table — fast and independent of tenants.
    const { error } = await admin.from("report_templates").select("id", { count: "exact", head: true }).limit(1);
    dbOk = !error;

    // Cron freshness for uptime monitoring: flag a job that hasn't run within its
    // window (default 30h — covers a daily cron + slack; tighten on Pro/frequent).
    const staleMs = (Number(process.env.CRON_STALE_HOURS) || 30) * 3600_000;
    const { data: hb } = await admin.from("ops_heartbeats").select("job, last_run_at");
    for (const h of (hb ?? []) as { job: string; last_run_at: string }[]) {
      const last = h.last_run_at ? new Date(h.last_run_at).getTime() : 0;
      crons[h.job] = { lastRunAt: h.last_run_at ?? null, stale: Date.now() - last > staleMs };
    }
  } catch {
    dbOk = false;
  }

  const cronStale = Object.values(crons).some((c) => c.stale);
  const body = {
    status: dbOk ? (cronStale ? "degraded" : "ok") : "degraded",
    checks: { database: dbOk ? "ok" : "fail", crons },
    monitoring: monitoringConfigured() ? "configured" : "console-only",
    latencyMs: Date.now() - startedAt,
    time: new Date().toISOString(),
  };

  return NextResponse.json(body, {
    status: dbOk ? 200 : 503,
    headers: { "Cache-Control": "no-store" },
  });
}
