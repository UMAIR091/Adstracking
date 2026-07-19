// Plan-limit enforcement. Reads the current subscription state, resolves the
// applicable limits from the central config, and compares them against live
// counts. Every limited action in the app funnels through one of these checks,
// so limits only ever need changing in config.ts.
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSubscriptionState } from "./subscription";
import { TRIAL_LIMITS, limitsForPlan, type PlanLimits } from "./config";

export type LimitKind = "clients" | "integrations" | "reports";

export type LimitCheck = {
  allowed: boolean;
  current: number;
  limit: number | null; // null = unlimited
  planName: string;
  isTrial: boolean;
  hasAccess: boolean;
  reason: string | null; // human-readable, set when !allowed
};

// The limits that apply to the agency right now (trial vs paid plan). Returns
// null when the agency has no access at all (trial expired / no subscription).
function activeLimits(plan: string): PlanLimits {
  return plan === "trial" ? TRIAL_LIMITS : limitsForPlan(plan);
}

async function count(supabase: SupabaseClient, table: string, filters: [string, string | boolean][]): Promise<number> {
  let q = supabase.from(table).select("id", { count: "exact", head: true });
  for (const [col, val] of filters) q = q.eq(col, val);
  const { count: n } = await q;
  return n ?? 0;
}

const blocked = (reason: string, planName: string, isTrial: boolean, current: number, limit: number | null): LimitCheck =>
  ({ allowed: false, current, limit, planName, isTrial, hasAccess: true, reason });

// Trial expired / no subscription — nothing is allowed until they upgrade.
const noAccess = (planName: string): LimitCheck =>
  ({ allowed: false, current: 0, limit: 0, planName, isTrial: false, hasAccess: false, reason: "Your free trial has ended. Upgrade to keep using ReportFlow." });

// Can this agency create another client/workspace?
export async function checkClientLimit(supabase: SupabaseClient, agencyId: string): Promise<LimitCheck> {
  const state = await getSubscriptionState(supabase, agencyId);
  if (!state.hasAccess) return noAccess(state.planName);
  const isTrial = state.plan === "trial";
  const limit = activeLimits(state.plan).maxClients;
  const current = await count(supabase, "clients", [["agency_id", agencyId], ["archived", false]]);
  if (current < limit) return { allowed: true, current, limit, planName: state.planName, isTrial, hasAccess: true, reason: null };
  return blocked(
    `You've reached your ${state.planName} limit of ${limit} client${limit === 1 ? "" : "s"}. Upgrade for more.`,
    state.planName, isTrial, current, limit
  );
}

// Can this client take another integration? (Only the trial caps this.)
export async function checkIntegrationLimit(supabase: SupabaseClient, agencyId: string, clientId: string): Promise<LimitCheck> {
  const state = await getSubscriptionState(supabase, agencyId);
  if (!state.hasAccess) return noAccess(state.planName);
  const isTrial = state.plan === "trial";
  const limit = activeLimits(state.plan).maxIntegrationsPerClient; // null on paid plans
  const current = await count(supabase, "data_sources", [["client_id", clientId]]);
  if (limit === null || current < limit) return { allowed: true, current, limit, planName: state.planName, isTrial, hasAccess: true, reason: null };
  return blocked(
    `Your free trial allows ${limit} integrations per client. Upgrade for unlimited integrations.`,
    state.planName, isTrial, current, limit
  );
}

// Can this agency generate another report? (Only the trial caps this.)
export async function checkReportLimit(supabase: SupabaseClient, agencyId: string): Promise<LimitCheck> {
  const state = await getSubscriptionState(supabase, agencyId);
  if (!state.hasAccess) return noAccess(state.planName);
  const isTrial = state.plan === "trial";
  const limit = activeLimits(state.plan).maxReports; // null on paid plans
  if (limit === null) return { allowed: true, current: 0, limit: null, planName: state.planName, isTrial, hasAccess: true, reason: null };
  const current = await count(supabase, "reports", [["agency_id", agencyId]]);
  if (current < limit) return { allowed: true, current, limit, planName: state.planName, isTrial, hasAccess: true, reason: null };
  return blocked(
    `Your free trial includes ${limit} report${limit === 1 ? "" : "s"}. Upgrade to generate unlimited reports.`,
    state.planName, isTrial, current, limit
  );
}
