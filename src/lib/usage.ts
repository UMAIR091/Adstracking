// SaaS usage tracking. Three parts:
//
//   trackUsage()        — records a cumulative event (a sync executed, an AI
//                         summary produced) by atomically bumping the current
//                         month's counter via the increment_usage RPC.
//                         Best-effort: it uses the service-role client and never
//                         throws, so metering can't break the path it meters.
//
//   reserveReportGeneration() / releaseReportGeneration() / reportsGenerated()
//                       — report generations, which the Free and trial report
//                         allowances are counted from. A generation is counted
//                         as a report is produced, atomically against the plan's
//                         cap (migration 0040), and stays counted when the saved
//                         report is later deleted.
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

// Reports an agency has generated, read from the generation counter: in one
// month (the Free allowance) or ever (the trial's). Deleting a saved report
// doesn't touch this count. Members can read their own counters, so `supabase`
// may be the caller's RLS client. A failed read counts as zero; the atomic
// reservation below is what actually enforces the cap.
export async function reportsGenerated(
  supabase: SupabaseClient,
  agencyId: string,
  periodMonth: string | null
): Promise<number> {
  let query = supabase
    .from("usage_counters")
    .select("count")
    .eq("agency_id", agencyId)
    .eq("metric", "reports_generated");
  if (periodMonth) query = query.eq("period_month", periodMonth);
  const { data } = await query;
  return ((data ?? []) as { count: number | string }[]).reduce((sum, row) => sum + (Number(row.count) || 0), 0);
}

export type ReportReservation =
  /** `periodMonth` is the month the generation was counted in; null when it went unmetered. */
  | { ok: true; periodMonth: string | null }
  | { ok: false; reason: "limit" | "unavailable" };

// Counts one report generation against the agency's allowance, atomically.
// reserve_report_generation() (migration 0040) locks the agency, sums what it
// has generated (this month, or ever when `lifetime`) and increments only if
// that is below `limit`, so two requests racing for the last slot can't both
// get it. `limit` null means unlimited: counted, never refused.
//
// An allowance that can't be checked isn't granted. Unlimited plans have no cap
// to protect, so a metering failure never blocks them.
export async function reserveReportGeneration(
  agencyId: string,
  cap: { limit: number | null; lifetime: boolean }
): Promise<ReportReservation> {
  try {
    const { data, error } = await createAdminClient().rpc("reserve_report_generation", {
      p_agency: agencyId,
      p_limit: cap.limit,
      p_lifetime: cap.lifetime,
    });
    if (error) throw new Error(error.message);
    if (typeof data === "string") return { ok: true, periodMonth: data };
    return cap.limit === null ? { ok: true, periodMonth: null } : { ok: false, reason: "limit" };
  } catch (err) {
    if (cap.limit === null) return { ok: true, periodMonth: null };
    console.error(`Report allowance check failed for agency ${agencyId}: ${(err as Error).message}`);
    return { ok: false, reason: "unavailable" };
  }
}

// Hands back a reservation whose report was never stored. Only the generation
// path calls this, when its own insert failed; deleting a saved report never
// does. Best-effort: a failed release costs the agency one generation, it can
// never grant one.
export async function releaseReportGeneration(agencyId: string, periodMonth: string | null): Promise<void> {
  if (!periodMonth) return;
  try {
    await createAdminClient().rpc("release_report_generation", { p_agency: agencyId, p_period_month: periodMonth });
  } catch {
    // See above.
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
