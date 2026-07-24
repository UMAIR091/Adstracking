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
  try {
    const admin = createAdminClient();
    // HEAD count on a tiny system-owned table — fast and independent of tenants.
    const { error } = await admin.from("report_templates").select("id", { count: "exact", head: true }).limit(1);
    dbOk = !error;
  } catch {
    dbOk = false;
  }

  const body = {
    status: dbOk ? "ok" : "degraded",
    checks: { database: dbOk ? "ok" : "fail" },
    monitoring: monitoringConfigured() ? "configured" : "console-only",
    latencyMs: Date.now() - startedAt,
    time: new Date().toISOString(),
  };

  return NextResponse.json(body, {
    status: dbOk ? 200 : 503,
    headers: { "Cache-Control": "no-store" },
  });
}
