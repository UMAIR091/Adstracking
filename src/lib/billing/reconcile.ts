// Reconciles a local subscription row against the payment provider.
//
// A stored provider id can stop existing: the subscription was created in the
// sandbox and the deployment later switched to live, the object was deleted in
// the Paddle dashboard, or the account was migrated. When that happens the row
// describes a subscription that is not real, and every button built on it
// fails — "Manage billing" 404s, "Cancel" 404s, and checkout ALSO fails,
// because it passes the dead customer id back to Paddle. The agency ends up
// showing an active paid plan it cannot use, cancel, or replace.
//
// Clearing the provider ids is what unblocks them: the UI falls back to
// "choose a plan", and a fresh checkout creates a new customer.
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Marks a subscription as gone at the provider.
 *
 * Only ever called after a definitive 404 — never on a timeout or a 5xx, which
 * are transient and must not revoke access. Status becomes `inactive` because
 * that is the truth: there is no subscription. Never throws; a failed
 * reconciliation must not turn into a second error on top of the first.
 */
export async function reconcileMissingSubscription(
  supabase: SupabaseClient,
  agencyId: string,
  reason: string
): Promise<void> {
  console.error(`Reconciling agency ${agencyId}: provider subscription missing (${reason}). Clearing stale ids.`);

  const { error } = await supabase
    .from("subscriptions")
    .update({
      status: "inactive",
      provider_subscription_id: null,
      // Cleared too: a dead customer id passed to checkout fails the same way,
      // which would leave them unable to subscribe again.
      provider_customer_id: null,
      price_id: null,
      cancel_at_period_end: false,
    })
    .eq("agency_id", agencyId);

  if (error) console.error(`Reconciliation failed for agency ${agencyId}: ${error.message}`);
}
