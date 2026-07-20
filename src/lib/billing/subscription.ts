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
};

const ACCESS_STATUSES = new Set(["active", "on_trial", "past_due"]);

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
    // unpaid / expired / cancelled-and-ended / inactive → no paid access;
    // fall through to the app trial (covers "subscribed then expired inside
    // the original 14 days" edge case gracefully).
    const trial = appTrial(agencyCreatedAt, now);
    if (trial.active) {
      return { ...base, hasAccess: true, blockedReason: null, trialEndsAt: trial.endsAt, trialDaysLeft: trial.daysLeft };
    }
    return {
      ...base,
      hasAccess: false,
      blockedReason:
        sub.status === "unpaid"
          ? "Your last payment failed. Update your payment method to keep generating reports."
          : "Your subscription has ended. Choose a plan to keep generating reports.",
    };
  }

  // No subscription row: app-level free trial from agency creation.
  const trial = appTrial(agencyCreatedAt, now);
  return {
    plan: trial.active ? "trial" : "free",
    planName: trial.active ? "Free trial" : "Free",
    status: trial.active ? "trial" : "expired",
    interval: null,
    hasAccess: trial.active,
    blockedReason: trial.active ? null : `Your ${TRIAL_DAYS}-day free trial has ended. Choose a plan to keep using ReportFlow.`,
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
