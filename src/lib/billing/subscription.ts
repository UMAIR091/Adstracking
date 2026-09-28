import type { SupabaseClient } from "@supabase/supabase-js";
import { TRIAL_DAYS, getPlan, planName as planNameFor, type BillingInterval, type PlanId } from "./config";

// One place decides who has access to premium features. Rules:
//  - active / on_trial subscription → access
//  - past_due → access (grace period while Paddle retries the card)
//  - cancelled but ends_at in the future → access until the paid period ends
//  - paused / unpaid / expired / no subscription → fall back to the app-level
//    trial that starts when the agency is created
//
// Provider-agnostic: Paddle writes the same columns Lemon Squeezy used to, so
// nothing below needed to change when the provider was swapped.
export type SubscriptionRow = {
  id: string;
  plan: string;
  status: string;
  provider: string | null;
  provider_customer_id: string | null;
  provider_subscription_id: string | null;
  variant_id: string | null;
  price_id: string | null;
  billing_interval: string | null;
  current_period_end: string | null;
  ends_at: string | null;
  cancel_at_period_end: boolean | null;
  trial_ends_at: string | null;
  card_brand: string | null;
  card_last_four: string | null;
  payment_failed_at: string | null;
};

export type SubscriptionState = {
  // What the agency is on right now, for display.
  plan: PlanId | "trial" | "free";
  planName: string;
  status: string; // raw status for badges ("active", "on_trial", "trial", "expired", ...)
  interval: BillingInterval | null;
  hasAccess: boolean;
  blockedReason: string | null; // set when hasAccess is false
  // Dates for the billing page.
  renewsAt: string | null;
  endsAt: string | null;
  trialEndsAt: string | null; // app-level trial end when on trial
  trialDaysLeft: number | null;
  paymentFailed: boolean;
  card: { brand: string; lastFour: string } | null;
  /** Provider subscription id (Paddle sub_…) — presence means "manageable". */
  subscriptionId: string | null;
  customerId: string | null;
  priceId: string | null;
  /** A cancellation is scheduled; access continues until `endsAt`. */
  cancelAtPeriodEnd: boolean;
  /**
   * The provider subscription still exists and can be changed, cancelled or
   * resumed. False once it has ended at the provider — a Paddle subscription
   * in `canceled` is terminal and can never be billed again, so the only way
   * back onto a paid plan is a NEW checkout.
   */
  subscriptionLive: boolean;
  /** The paid plan an ended subscription was on, so the UI can offer it back. */
  previous: { plan: PlanId; planName: string; status: string; endedAt: string | null; subscriptionId: string | null } | null;
};

const ACCESS_STATUSES = new Set(["active", "on_trial", "past_due"]);
/** Statuses where the provider subscription still exists and accepts changes. */
export const LIVE_SUBSCRIPTION_STATUSES = new Set(["active", "on_trial", "past_due", "paused"]);

export function resolveState(sub: SubscriptionRow | null, agencyCreatedAt: string): SubscriptionState {
  const now = Date.now();

  if (sub) {
    const planName = planNameFor(sub.plan);
    const base = {
      plan: (getPlan(sub.plan as PlanId) ? (sub.plan as PlanId) : "pro"),
      planName,
      status: sub.status,
      interval: (sub.billing_interval as BillingInterval | null) ?? null,
      renewsAt: sub.current_period_end,
      endsAt: sub.ends_at,
      trialEndsAt: null,
      trialDaysLeft: null,
      paymentFailed: Boolean(sub.payment_failed_at),
      card: sub.card_brand && sub.card_last_four ? { brand: sub.card_brand, lastFour: sub.card_last_four } : null,
      subscriptionId: sub.provider_subscription_id,
      customerId: sub.provider_customer_id,
      priceId: sub.price_id,
      cancelAtPeriodEnd: Boolean(sub.cancel_at_period_end),
      subscriptionLive: Boolean(sub.provider_subscription_id) && LIVE_SUBSCRIPTION_STATUSES.has(sub.status),
      previous: null,
    };

    if (ACCESS_STATUSES.has(sub.status)) {
      return { ...base, hasAccess: true, blockedReason: null };
    }
    if (sub.status === "cancelled" && sub.ends_at && new Date(sub.ends_at).getTime() > now) {
      return { ...base, hasAccess: true, blockedReason: null };
    }
    if (sub.status === "paused") {
      return { ...base, hasAccess: false, blockedReason: "Your subscription is paused. Resume it to keep generating reports." };
    }
    // unpaid / expired / cancelled-and-ended / inactive: the paid plan is
    // over. The agency is now exactly where one that never subscribed would
    // be — the app trial if it is still running, otherwise Free.
    //
    // This used to keep `plan` on the old paid tier with hasAccess false, so
    // the billing page badged a dead subscription "Current plan", offered
    // "Manage billing" (a portal that cannot take payment for a cancelled
    // subscription) instead of checkout, and routed the other tiers through
    // "change plan" on a subscription Paddle refuses to update. It also locked
    // a lapsed customer out entirely — harsher than Free.
    const ended = unsubscribedState(agencyCreatedAt, now);
    return {
      ...ended,
      status: sub.status,
      interval: base.interval,
      endsAt: sub.ends_at,
      customerId: sub.provider_customer_id,
      previous: {
        plan: base.plan,
        planName,
        status: sub.status,
        endedAt: sub.ends_at ?? sub.current_period_end,
        subscriptionId: sub.provider_subscription_id,
      },
    };
  }

  return unsubscribedState(agencyCreatedAt, now);
}

// No paid subscription: the app-level trial from agency creation, and after it
// the free plan. The trial ending is not a lockout — the account keeps working
// on FREE_LIMITS (one client, two sources, one report a month, no scheduling,
// no AI). What it can still do is enforced by lib/billing/limits and
// featuresForPlan, not by hasAccess.
function unsubscribedState(agencyCreatedAt: string, now: number): SubscriptionState {
  const trial = appTrial(agencyCreatedAt, now);
  return {
    plan: trial.active ? "trial" : "free",
    planName: trial.active ? "Free trial" : "Free",
    status: trial.active ? "trial" : "free",
    interval: null,
    hasAccess: true,
    blockedReason: null,
    renewsAt: null,
    endsAt: null,
    trialEndsAt: trial.endsAt,
    trialDaysLeft: trial.daysLeft,
    paymentFailed: false,
    card: null,
    subscriptionId: null,
    customerId: null,
    priceId: null,
    cancelAtPeriodEnd: false,
    subscriptionLive: false,
    previous: null,
  };
}

function appTrial(agencyCreatedAt: string, now: number) {
  const endsMs = new Date(agencyCreatedAt).getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000;
  const daysLeft = Math.max(0, Math.ceil((endsMs - now) / (24 * 60 * 60 * 1000)));
  return { active: endsMs > now, endsAt: new Date(endsMs).toISOString(), daysLeft };
}

// Loads the agency's subscription row + created_at and resolves the state.
// Works with both the RLS user client and the admin client (cron).
export async function getSubscriptionState(supabase: SupabaseClient, agencyId: string): Promise<SubscriptionState> {
  const [{ data: sub }, { data: agency }] = await Promise.all([
    supabase
      .from("subscriptions")
      .select(
        "id, plan, status, provider, provider_customer_id, provider_subscription_id, variant_id, price_id, billing_interval, current_period_end, ends_at, cancel_at_period_end, trial_ends_at, card_brand, card_last_four, payment_failed_at"
      )
      .eq("agency_id", agencyId)
      .maybeSingle(),
    supabase.from("agencies").select("created_at").eq("id", agencyId).maybeSingle(),
  ]);

  return resolveState(
    (sub as SubscriptionRow | null) ?? null,
    (agency?.created_at as string | undefined) ?? new Date(0).toISOString()
  );
}

// Guard for premium API routes. Returns null when allowed, or a ready-to-send
// error payload when blocked — keeps route handlers to two lines.
export async function requireActiveAccess(
  supabase: SupabaseClient,
  agencyId: string
): Promise<{ error: string; status: number } | null> {
  const state = await getSubscriptionState(supabase, agencyId);
  if (state.hasAccess) return null;
  return { error: state.blockedReason ?? "Subscription required.", status: 402 };
}
