import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { planForVariant } from "@/lib/billing/config";
import { verifyWebhookSignature } from "@/lib/billing/lemonsqueezy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Lemon Squeezy webhook — the source of truth for subscription state.
// Signature-verified against the raw body; uses the admin client because
// webhooks have no user session. Handlers are idempotent upserts keyed on
// agency_id, so replays and out-of-order deliveries settle correctly.
//
// Subscribe this endpoint to: subscription_created, subscription_updated,
// subscription_cancelled, subscription_resumed, subscription_paused,
// subscription_unpaused, subscription_expired,
// subscription_payment_failed, subscription_payment_success.

const SUBSCRIPTION_EVENTS = new Set([
  "subscription_created",
  "subscription_updated",
  "subscription_cancelled",
  "subscription_resumed",
  "subscription_paused",
  "subscription_unpaused",
  "subscription_expired",
]);

type WebhookPayload = {
  meta: { event_name: string; custom_data?: { agency_id?: string } };
  data: {
    id: string;
    attributes: {
      status: string;
      customer_id: number;
      variant_id: number;
      card_brand: string | null;
      card_last_four: string | null;
      trial_ends_at: string | null;
      renews_at: string | null;
      ends_at: string | null;
    };
  };
};

export async function POST(req: Request) {
  // Raw body is required for HMAC verification — read text before parsing.
  const rawBody = await req.text();
  if (!verifyWebhookSignature(rawBody, req.headers.get("x-signature"))) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let payload: WebhookPayload;
  try {
    payload = JSON.parse(rawBody) as WebhookPayload;
  } catch {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const event = payload.meta?.event_name ?? "";
  const agencyId = payload.meta?.custom_data?.agency_id;

  // Events we don't handle (order_created etc.) are acknowledged so LS
  // doesn't retry them forever.
  const isPayment = event === "subscription_payment_failed" || event === "subscription_payment_success";
  if (!SUBSCRIPTION_EVENTS.has(event) && !isPayment) return NextResponse.json({ ok: true, ignored: event });

  if (!agencyId) {
    // Without the agency id we can't attribute the subscription. Log and
    // acknowledge — retrying won't add the missing data.
    console.error(`Billing webhook ${event}: missing custom_data.agency_id`);
    return NextResponse.json({ ok: true, ignored: "no agency_id" });
  }

  const admin = createAdminClient();
  const a = payload.data.attributes;

  try {
    if (isPayment) {
      // Payment events carry an invoice, not the subscription — only flip the
      // failed-payment flag; the paired subscription_updated carries the rest.
      const { error } = await admin
        .from("subscriptions")
        .update({ payment_failed_at: event === "subscription_payment_failed" ? new Date().toISOString() : null })
        .eq("agency_id", agencyId);
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true });
    }

    const variantId = String(a.variant_id);
    const mapped = planForVariant(variantId);

    const { error } = await admin.from("subscriptions").upsert(
      {
        agency_id: agencyId,
        provider: "lemonsqueezy",
        provider_customer_id: String(a.customer_id),
        provider_subscription_id: payload.data.id,
        variant_id: variantId,
        plan: mapped?.plan ?? "pro",
        billing_interval: mapped?.interval ?? null,
        status: a.status, // LS statuses map 1:1 to our check constraint
        current_period_end: a.renews_at,
        ends_at: a.ends_at,
        trial_ends_at: a.trial_ends_at,
        card_brand: a.card_brand,
        card_last_four: a.card_last_four,
        // Any lifecycle event that isn't a failure clears the failed flag.
        ...(a.status === "active" || a.status === "on_trial" ? { payment_failed_at: null } : {}),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "agency_id" }
    );
    if (error) throw new Error(error.message);

    return NextResponse.json({ ok: true });
  } catch (err) {
    // 500 → Lemon Squeezy retries with backoff, which is what we want for
    // transient DB failures.
    console.error(`Billing webhook ${event} failed:`, (err as Error).message);
    return NextResponse.json({ error: "Webhook processing failed" }, { status: 500 });
  }
}
