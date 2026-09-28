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
import { planForPrice } from "./config";
import { getSubscription, readSubscription, type PaddleError } from "./paddle";

/**
 * Re-reads a subscription the row claims is live and writes back what Paddle
 * says, returning true when anything changed.
 *
 * Webhooks are the primary path, but one that never lands leaves the row
 * frozen: a subscription cancelled at Paddle kept reading "active" here for a
 * month, so the workspace kept paid access and its billing page offered
 * plan changes Paddle rejects. The billing page calls this on every view — it
 * is the one place a customer goes to fix billing, so it must show the truth.
 *
 * A definitive 404 clears the stale ids; a timeout or 5xx changes nothing
 * (transient errors must never revoke access). Never throws.
 */
export async function refreshSubscriptionFromProvider(
  admin: SupabaseClient,
  agencyId: string,
  subscriptionId: string
): Promise<boolean> {
  try {
    const facts = readSubscription(await getSubscription(subscriptionId));
    const { data: row } = await admin
      .from("subscriptions")
      .select("status, price_id, current_period_end, ends_at, cancel_at_period_end, provider_subscription_id")
      .eq("agency_id", agencyId)
      .maybeSingle();
    // Only touch the row that still points at this subscription.
    if (!row || row.provider_subscription_id !== subscriptionId) return false;

    const sameInstant = (a: string | null, b: string | null) =>
      (a ? new Date(a).getTime() : null) === (b ? new Date(b).getTime() : null);
    const unchanged =
      row.status === facts.status &&
      row.price_id === facts.priceId &&
      Boolean(row.cancel_at_period_end) === facts.cancelAtPeriodEnd &&
      sameInstant(row.current_period_end, facts.currentPeriodEnd) &&
      sameInstant(row.ends_at, facts.endsAt);
    if (unchanged) return false;

    const mapped = facts.priceId ? planForPrice(facts.priceId) : null;
    const update: Record<string, unknown> = {
      status: facts.status,
      price_id: facts.priceId,
      current_period_end: facts.currentPeriodEnd,
      ends_at: facts.endsAt,
      cancel_at_period_end: facts.cancelAtPeriodEnd,
      updated_at: new Date().toISOString(),
      ...(mapped ? { plan: mapped.plan, billing_interval: mapped.interval } : {}),
    };
    console.warn(`Billing drift for agency ${agencyId}: row said ${row.status}, Paddle says ${facts.status}. Syncing.`);
    const { error } = await admin
      .from("subscriptions")
      .update(update)
      .eq("agency_id", agencyId)
      .eq("provider_subscription_id", subscriptionId);
    if (error) {
      console.error(`Billing drift sync failed for agency ${agencyId}: ${error.message}`);
      return false;
    }
    return true;
  } catch (err) {
    if ((err as PaddleError)?.notFound) {
      await reconcileMissingSubscription(admin, agencyId, "billing page refresh: not found");
      return true;
    }
    return false;
  }
}

/**
 * Marks a subscription as gone at the provider.
 *
 * Only ever called after a definitive 404 — never on a timeout or a 5xx, which
 * are transient and must not revoke access. Status becomes `inactive` because
 * that is the truth: there is no subscription. Never throws; a failed
 * reconciliation must not turn into a second error on top of the first.
 *
 * `admin` must be the service-role client: tenants can read their subscription
 * but not write it (migration 0038).
 */
export async function reconcileMissingSubscription(
  admin: SupabaseClient,
  agencyId: string,
  reason: string
): Promise<void> {
  console.error(`Reconciling agency ${agencyId}: provider subscription missing (${reason}). Clearing stale ids.`);

  const { error } = await admin
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
