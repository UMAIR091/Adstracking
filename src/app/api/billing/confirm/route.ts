import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserAndAgency } from "@/lib/agency";
import { getTransactionFacts, getSubscription, readSubscription, PaddleError } from "@/lib/billing/paddle";
import { planForPrice } from "@/lib/billing/config";

export const runtime = "nodejs";

// Confirms a completed checkout directly with Paddle.
//
// Webhooks are the primary path and stay authoritative, but they are delivered
// by a third party to a destination we don't control at runtime: a
// misconfigured, disabled or mistyped destination means the customer pays and
// the app never finds out, leaving them locked out of what they just bought.
// This closes that gap by asking Paddle about the transaction the browser just
// completed, so activation never depends on an inbound request arriving.
//
// Both paths write the same fields and are idempotent, so whichever lands first
// wins and the other is a no-op.
export async function POST(req: Request) {
  const { user, agency } = await getCurrentUserAndAgency();
  if (!user || !agency) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { transactionId?: string } | null;
  const transactionId = typeof body?.transactionId === "string" ? body.transactionId.trim() : "";
  if (!transactionId.startsWith("txn_")) {
    return NextResponse.json({ error: "A transaction id is required." }, { status: 400 });
  }

  try {
    const tx = await getTransactionFacts(transactionId);

    // Authorisation. The transaction carries the agency it was created for in
    // customData; a caller may only confirm their OWN. Without this check any
    // signed-in user who learned a transaction id could attach someone else's
    // paid subscription to their workspace.
    if (tx.agencyId && tx.agencyId !== agency.id) {
      console.error(`Confirm rejected: txn ${transactionId} belongs to agency ${tx.agencyId}, caller is ${agency.id}`);
      return NextResponse.json({ error: "That transaction doesn't belong to this workspace." }, { status: 403 });
    }

    if (!tx.subscriptionId) {
      // Checkout can complete moments before Paddle attaches the subscription.
      // Reported as "pending" so the client can retry rather than treating an
      // in-flight purchase as a failure.
      return NextResponse.json({ ok: false, pending: true, message: "Payment received — still finalising." });
    }

    const subscription = await getSubscription(tx.subscriptionId);
    const facts = readSubscription(subscription);
    const mapped = facts.priceId ? planForPrice(facts.priceId) : null;

    const row: Record<string, unknown> = {
      provider: "paddle",
      provider_subscription_id: facts.subscriptionId,
      provider_customer_id: facts.customerId ?? tx.customerId,
      price_id: facts.priceId,
      status: facts.status,
      current_period_end: facts.currentPeriodEnd,
      ends_at: facts.endsAt,
      cancel_at_period_end: facts.cancelAtPeriodEnd,
      updated_at: new Date().toISOString(),
    };
    if (mapped) {
      row.plan = mapped.plan;
      row.billing_interval = mapped.interval;
    }

    // RLS scopes this to the caller's own agency.
    const { error } = await supabaseUpdate(agency.id, row);
    if (error) {
      console.error(`Confirm failed to persist for agency ${agency.id}: ${error}`);
      return NextResponse.json({ error: "Couldn't activate your plan. Please refresh." }, { status: 500 });
    }

    return NextResponse.json({ ok: true, status: facts.status, plan: mapped?.plan ?? null });
  } catch (err) {
    const e = err as PaddleError;
    console.error(`Checkout confirm failed for ${transactionId}: ${e.message}`);
    return NextResponse.json({ error: e.message }, { status: e.status ?? 502 });
  }
}

// Upsert rather than update: an agency that has never had a subscription row
// (or whose row was cleared by reconciliation) still needs one written.
async function supabaseUpdate(agencyId: string, row: Record<string, unknown>): Promise<{ error: string | null }> {
  const supabase = createClient();
  const { data: existing } = await supabase
    .from("subscriptions")
    .select("id")
    .eq("agency_id", agencyId)
    .maybeSingle();

  const { error } = existing
    ? await supabase.from("subscriptions").update(row).eq("agency_id", agencyId)
    : await supabase.from("subscriptions").insert({ agency_id: agencyId, ...row });

  return { error: error?.message ?? null };
}
