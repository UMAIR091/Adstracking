import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserAndAgency } from "@/lib/agency";
import { billingConfigured, findPrice, type BillingInterval, type PlanId } from "@/lib/billing/config";
import { createCheckoutSession, PaddleError } from "@/lib/billing/paddle";

export const runtime = "nodejs";

const INTERVALS: BillingInterval[] = ["monthly", "annual"];

// Side-effect-free probe used by the public pricing page to decide where a
// plan button should lead: straight to the dashboard checkout for a signed-in
// customer, or through signup first. Deliberately creates nothing — probing
// with POST would litter Paddle with abandoned transactions.
export async function GET() {
  const { user, agency } = await getCurrentUserAndAgency().catch(() => ({ user: null, agency: null }));
  return NextResponse.json(
    { authenticated: Boolean(user && agency), configured: billingConfigured() },
    { headers: { "Cache-Control": "no-store" } }
  );
}

// Creates a Paddle transaction for the requested plan + interval and returns
// the ids Paddle.js needs to open the checkout overlay.
//
// The price is resolved server-side from our catalog, so the browser never
// chooses what it is buying — it only opens the transaction we created. The
// agency id is stamped into customData so every downstream webhook can be
// attributed even if the user closes the tab mid-payment.
export async function POST(req: Request) {
  const { user, agency } = await getCurrentUserAndAgency();
  if (!user || !agency) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!billingConfigured()) {
    return NextResponse.json(
      { error: "Billing isn't configured yet. Set PADDLE_API_KEY, PADDLE_CLIENT_TOKEN and the PADDLE_PRICE_* variables." },
      { status: 503 }
    );
  }

  const body = (await req.json().catch(() => null)) as { plan?: string; interval?: string } | null;
  const plan = body?.plan as PlanId | undefined;
  const interval = body?.interval as BillingInterval | undefined;
  if (!plan || !interval || !INTERVALS.includes(interval)) {
    return NextResponse.json({ error: "plan and interval (monthly/annual) are required." }, { status: 400 });
  }

  const priceId = findPrice(plan, interval);
  if (!priceId) return NextResponse.json({ error: "That plan isn't available." }, { status: 400 });

  // Reuse the existing Paddle customer when we have one, so a returning
  // customer keeps a single billing identity instead of spawning duplicates.
  const supabase = createClient();
  const { data: sub } = await supabase
    .from("subscriptions")
    .select("provider_customer_id, provider, provider_subscription_id, status")
    .eq("agency_id", agency.id)
    .maybeSingle();

  // An agency that already has a live subscription must change plan through
  // the subscription route, otherwise Paddle would bill two subscriptions.
  const LIVE = new Set(["active", "on_trial", "past_due", "paused"]);
  if (sub?.provider_subscription_id && LIVE.has(sub.status as string)) {
    return NextResponse.json(
      { error: "You already have an active subscription. Use Change plan instead.", code: "already_subscribed" },
      { status: 409 }
    );
  }

  const customerId = sub?.provider === "paddle" ? sub.provider_customer_id : null;

  try {
    const session = await createCheckoutSession({
      priceId,
      agencyId: agency.id,
      email: user.email,
      customerId,
    });
    return NextResponse.json(session);
  } catch (err) {
    const e = err as PaddleError;
    console.error("Paddle checkout failed:", e.message);
    return NextResponse.json({ error: e.message }, { status: e.status ?? 502 });
  }
}
