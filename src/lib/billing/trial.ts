// One-time paid-plan trial: eligibility and consumption.
//
// The rule is "one trial per customer, ever". Because a customer can cancel,
// delete the account and sign up again, eligibility can't be derived from the
// current subscription — it's a ledger keyed on the email address that
// outlives the agency (see migration 0020).
//
// Mechanically the trial is a property of the Paddle *price*, so this module
// only decides WHICH price id checkout should use:
//   eligible   -> the trial-enabled price (Paddle starts the subscription in
//                 `trialing` and charges nothing today)
//   ineligible -> the standard price (charged immediately)
import type { SupabaseClient } from "@supabase/supabase-js";

/** Emails are compared case-insensitively and trimmed. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export type TrialEligibility = {
  eligible: boolean;
  /** Why not, for logging and honest UI copy. */
  reason: "eligible" | "already_used" | "has_subscription" | "no_email";
};

// Decides whether this agency may take the paid-plan trial.
//
// `supabase` must be a client that can read paid_trial_grants for any email —
// i.e. the service-role admin client. RLS only exposes an agency's own grant,
// which would let a fresh agency with a reused email appear eligible.
export async function checkTrialEligibility(
  admin: SupabaseClient,
  args: { agencyId: string; email: string | null | undefined }
): Promise<TrialEligibility> {
  const email = args.email ? normalizeEmail(args.email) : "";
  // No verifiable identity to bind the grant to — don't hand out a trial.
  if (!email) return { eligible: false, reason: "no_email" };

  // Any prior grant for this email OR this agency blocks a second trial. The
  // agency clause catches an account whose email changed after the trial.
  const [{ data: byEmail }, { data: agency }] = await Promise.all([
    admin.from("paid_trial_grants").select("email").eq("email", email).maybeSingle(),
    admin.from("agencies").select("paid_trial_used_at").eq("id", args.agencyId).maybeSingle(),
  ]);

  if (byEmail || agency?.paid_trial_used_at) return { eligible: false, reason: "already_used" };

  // A trial is for a FIRST paid subscription. An agency that already has (or
  // had) a Paddle subscription is changing plans, not starting out — that path
  // goes through the subscription route and never mints a new trial.
  const { data: sub } = await admin
    .from("subscriptions")
    .select("provider_subscription_id")
    .eq("agency_id", args.agencyId)
    .maybeSingle();
  if (sub?.provider_subscription_id) return { eligible: false, reason: "has_subscription" };

  return { eligible: true, reason: "eligible" };
}

// Records that the trial has been taken. Idempotent: the primary key on email
// means a webhook replay or a concurrent checkout can't create a second grant,
// and the existing row is left as the authoritative first grant.
//
// Never throws — failing to record must not fail the webhook that carries the
// subscription state, but it is logged loudly because a silent failure here
// would let a second trial through later.
export async function recordTrialGrant(
  admin: SupabaseClient,
  args: {
    agencyId: string;
    email: string | null | undefined;
    plan: string | null;
    interval: string | null;
    customerId: string | null;
    subscriptionId: string | null;
  }
): Promise<void> {
  const email = args.email ? normalizeEmail(args.email) : "";
  if (!email) {
    console.error(`paid trial grant not recorded for agency ${args.agencyId}: no email`);
    return;
  }

  const { error } = await admin.from("paid_trial_grants").upsert(
    {
      email,
      agency_id: args.agencyId,
      plan: args.plan,
      billing_interval: args.interval,
      paddle_customer_id: args.customerId,
      paddle_subscription_id: args.subscriptionId,
    },
    { onConflict: "email", ignoreDuplicates: true }
  );
  if (error) console.error(`paid_trial_grants upsert failed for ${email}: ${error.message}`);

  // Denormalized fast path. Only ever set, never cleared.
  const { error: agencyError } = await admin
    .from("agencies")
    .update({ paid_trial_used_at: new Date().toISOString() })
    .eq("id", args.agencyId)
    .is("paid_trial_used_at", null);
  if (agencyError) console.error(`agencies.paid_trial_used_at update failed: ${agencyError.message}`);
}

// Whether this agency has already consumed its trial — the cheap read used to
// render accurate UI ("3-day free trial" vs "billed today"). Uses the
// denormalized flag plus the email ledger so a reused email is caught too.
export async function hasUsedTrial(
  admin: SupabaseClient,
  args: { agencyId: string; email: string | null | undefined }
): Promise<boolean> {
  const { reason } = await checkTrialEligibility(admin, args);
  return reason === "already_used";
}
