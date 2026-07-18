// SaaS usage tracking. Two halves:
//
//   trackUsage()        — records a cumulative event (a report generated, a sync
//                         executed, an AI summary produced) by atomically bumping
//                         the current month's counter via the increment_usage
//                         RPC. Best-effort: it uses the service-role client and
//                         never throws, so metering can't break the path it meters.
//
//   getWorkspaceUsage() — reads a workspace's current-month usage for the admin
//                         view AND as the shape a future limit check would read:
//                         live counts for current-state metrics (connected
//                         integrations, scheduled reports) + the accumulated
//                         counters for the rest. RLS scopes the reads to the
//                         caller's agency.
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";

export type UsageMetric = "reports_generated" | "sync_executions" | "ai_summaries";

// First day of the current UTC month, matching increment_usage()'s bucket.
export function currentPeriodMonth(): string {
  return new Date().toISOString().slice(0, 8) + "01"; // YYYY-MM-01
}

// Records `amount` of a cumulative metric for a workspace. Never throws.
export async function trackUsage(agencyId: string | null | undefined, metric: UsageMetric, amount = 1): Promise<void> {
  if (!agencyId || amount <= 0) return;
  try {
    const admin = createAdminClient();
    await admin.rpc("increment_usage", { p_agency: agencyId, p_metric: metric, p_amount: amount });
  } catch {
    // Best-effort: a missing table/RPC (migration not applied) or a transient DB
    // error must not affect the request being metered.
  }
}

export type WorkspaceUsage = {
  periodMonth: string;
  // Current-state (live counts — always accurate).
  connectedIntegrations: number;
  scheduledReports: number;
  // Cumulative this month (from usage_counters).
  reportsGenerated: number;
  syncExecutions: number;
  aiSummaries: number;
};

const ZERO = (m: string): WorkspaceUsage => ({
  periodMonth: m,
  connectedIntegrations: 0,
  scheduledReports: 0,
  reportsGenerated: 0,
  syncExecutions: 0,
  aiSummaries: 0,
});

// Reads current-month usage for one agency. `supabase` should be the caller's
// RLS-scoped client; every query is additionally filtered by agency_id so it's
// safe with the admin client too. Degrades to zeros if the migration isn't
// applied yet (the counters table / RPC may not exist).
export async function getWorkspaceUsage(supabase: SupabaseClient, agencyId: string): Promise<WorkspaceUsage> {
  const period = currentPeriodMonth();
  const usage = ZERO(period);

  const [integrations, schedules, counters] = await Promise.all([
    supabase.from("data_sources").select("id", { count: "exact", head: true }).eq("agency_id", agencyId),
    supabase.from("report_schedules").select("id", { count: "exact", head: true }).eq("agency_id", agencyId).eq("enabled", true),
    supabase.from("usage_counters").select("metric, count").eq("agency_id", agencyId).eq("period_month", period),
  ]);

  usage.connectedIntegrations = integrations.count ?? 0;
  usage.scheduledReports = schedules.count ?? 0;

  for (const row of (counters.data ?? []) as { metric: string; count: number }[]) {
    const n = Number(row.count) || 0;
    if (row.metric === "reports_generated") usage.reportsGenerated = n;
    else if (row.metric === "sync_executions") usage.syncExecutions = n;
    else if (row.metric === "ai_summaries") usage.aiSummaries = n;
  }

  return usage;
}
