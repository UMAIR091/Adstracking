import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserAndAgency } from "@/lib/agency";
import { findPrice, getPlan, planForPrice, planRank, type BillingInterval, type PlanId } from "@/lib/billing/config";
import {
  cancelSubscription,
  changeSubscriptionPrice,
  resumeSubscription,
  readSubscription,
  PaddleError,
} from "@/lib/billing/paddle";

export const runtime = "nodejs";

// Plan changes and cancellation for an existing Paddle subscription.
//
//   { action: "change", plan, interval }  upgrade or downgrade
//   { action: "cancel" }                  cancel at period end
//   { action: "resume" }                  undo a scheduled cancellation
//
// Paddle is authoritative, so after each call we write the returned
// subscription straight back to the database. The webhook will deliver the
// same facts moments later — both paths are idempotent upserts, so whichever
// lands first wins and the other is a no-op.

type Body = { action?: string; plan?: string; interval?: string };

const INTERVALS: BillingInterval[] = ["monthly", "annual"];

// Upgrade vs downgrade is decided by catalog order (client capacity), not by
// a price literal — prices live in Paddle and must not be duplicated here.

export async function POST(req: Request) {
  const { user, agency } = await getCurrentUserAndAgency();
  if (!user || !agency) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as Body | null;
  const action = body?.action;
  if (!action || !["change", "cancel", "resume"].includes(action)) {
    return NextResponse.json({ error: "action must be change, cancel or resume." }, { status: 400 });
  }

  const supabase = createClient();
  const { data: sub } = await supabase
    .from("subscriptions")
    .select("provider, provider_subscription_id, price_id, plan, status")
    .eq("agency_id", agency.id)
    .maybeSingle();

  if (sub?.provider !== "paddle" || !sub.provider_subscription_id) {
    return NextResponse.json({ error: "No active subscription to manage." }, { status: 404 });
  }
  const subscriptionId = sub.provider_subscription_id as string;

  try {
    if (action === "cancel") {
      const updated = await cancelSubscription(subscriptionId);
      await persist(supabase, agency.id, updated);
      return NextResponse.json({ ok: true, message: "Your subscription will end at the close of the current period." });
    }

    if (action === "resume") {
      const updated = await resumeSubscription(subscriptionId);
      await persist(supabase, agency.id, updated);
      return NextResponse.json({ ok: true, message: "Your subscription has been resumed." });
    }

    // action === "change"
    const plan = body?.plan as PlanId | undefined;
    const interval = body?.interval as BillingInterval | undefined;
    if (!plan || !getPlan(plan) || !interval || !INTERVALS.includes(interval)) {
      return NextResponse.json({ error: "plan and interval (monthly/annual) are required." }, { status: 400 });
    }

    const priceId = findPrice(plan, interval);
    if (!priceId) return NextResponse.json({ error: "That plan isn't available." }, { status: 400 });
    if (priceId === sub.price_id) {
      return NextResponse.json({ error: "You're already on that plan." }, { status: 400 });
    }

    // Compare against the plan the current price maps to, not the stored plan
    // column, so a stale row can't misclassify the direction of the change.
    const currentPlan = (sub.price_id ? planForPrice(sub.price_id)?.plan : null) ?? (sub.plan as PlanId | null);
    const isUpgrade = planRank(plan) >= planRank(currentPlan);

    const updated = await changeSubscriptionPrice({ subscriptionId, priceId, immediate: isUpgrade });
    await persist(supabase, agency.id, updated);

    return NextResponse.json({
      ok: true,
      message: isUpgrade
        ? `You're now on ${getPlan(plan)!.name}. The prorated difference has been charged.`
        : `Your plan will change to ${getPlan(plan)!.name}. The lower rate applies from your next renewal.`,
    });
  } catch (err) {
    const e = err as PaddleError;
    console.error(`Paddle subscription ${action} failed:`, e.message);
    return NextResponse.json({ error: e.message }, { status: e.status ?? 502 });
  }
}

// Mirrors Paddle's response into our row so the UI reflects the change on the
// next render, without waiting for the webhook.
async function persist(
  supabase: ReturnType<typeof createClient>,
  agencyId: string,
  subscription: Parameters<typeof readSubscription>[0]
): Promise<void> {
  const facts = readSubscription(subscription);
  const mapped = facts.priceId ? planForPrice(facts.priceId) : null;

  const row: Record<string, unknown> = {
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
  await supabase.from("subscriptions").update(row).eq("agency_id", agencyId);
}
