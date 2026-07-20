import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { EventEntity } from "@paddle/paddle-node-sdk";
import { createAdminClient } from "@/lib/supabase/admin";
import { planForPrice } from "@/lib/billing/config";
import {
  verifyWebhook,
  webhookConfigured,
  readSubscription,
  type SubscriptionFacts,
  type SubscriptionLike,
  type TransactionLike,
} from "@/lib/billing/paddle";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Paddle webhook — the source of truth for subscription state.
//
// Signature-verified against the raw body by the Paddle SDK (timestamped
// HMAC-SHA256 with a replay window). Uses the admin client because webhooks
// carry no user session. Every handler is an idempotent upsert keyed on
// agency_id, so replays and out-of-order deliveries settle to the same row.
//
// Subscribe this endpoint (Paddle → Developer tools → Notifications) to:
//   transaction.completed
//   subscription.created, subscription.updated, subscription.canceled,
//   subscription.paused, subscription.resumed, subscription.past_due
//
// Retry contract: a 2xx acknowledges the event. Anything we can't attribute is
// acknowledged (retrying won't supply missing data); genuine failures return
// 500 so Paddle retries with backoff.

type Handled = { ok: true; ignored?: string };

export async function POST(req: Request) {
  if (!webhookConfigured()) {
    console.error("Paddle webhook received but PADDLE_WEBHOOK_SECRET is not set.");
    return NextResponse.json({ error: "Webhook not configured" }, { status: 503 });
  }

  // Raw body is required for signature verification — read text before parsing.
  const rawBody = await req.text();
  const signature = req.headers.get("paddle-signature");

  const event = await verifyWebhook(rawBody, signature);
  if (!event) return NextResponse.json({ error: "Invalid signature" }, { status: 401 });

  const admin = createAdminClient();

  try {
    const result = await handleEvent(admin, event);
    return NextResponse.json(result);
  } catch (err) {
    // 500 → Paddle retries with backoff, which is what we want for transient
    // database failures.
    console.error(`Paddle webhook ${event.eventType} failed:`, (err as Error).message);
    return NextResponse.json({ error: "Webhook processing failed" }, { status: 500 });
  }
}

async function handleEvent(admin: SupabaseClient, event: EventEntity): Promise<Handled> {
  switch (event.eventType) {
    case "subscription.created":
    case "subscription.updated":
    case "subscription.canceled":
    case "subscription.paused":
    case "subscription.resumed":
    case "subscription.past_due":
    case "subscription.activated":
    case "subscription.trialing":
      return syncSubscription(admin, event.data);

    case "transaction.completed":
      return recordPayment(admin, event.data);

    default:
      // Acknowledge everything else so Paddle stops retrying events we don't
      // subscribe to logically (transaction.created, product.updated, …).
      return { ok: true, ignored: event.eventType };
  }
}

// ── subscription.* ───────────────────────────────────────────
// Writes the full subscription picture. This is what grants and revokes
// premium access: the access layer (lib/billing/subscription.ts) reads these
// columns on every request, so a status change here takes effect immediately.
async function syncSubscription(admin: SupabaseClient, sub: SubscriptionLike): Promise<Handled> {
  const facts = readSubscription(sub);
  const agencyId = await resolveAgencyId(admin, facts);
  if (!agencyId) {
    console.error(`Paddle webhook: no agency for subscription ${facts.subscriptionId} (customer ${facts.customerId})`);
    return { ok: true, ignored: "unattributed subscription" };
  }

  const mapped = facts.priceId ? planForPrice(facts.priceId) : null;

  const row: Record<string, unknown> = {
    agency_id: agencyId,
    provider: "paddle",
    provider_customer_id: facts.customerId,
    provider_subscription_id: facts.subscriptionId,
    price_id: facts.priceId,
    status: facts.status,
    current_period_end: facts.currentPeriodEnd,
    ends_at: facts.endsAt,
    cancel_at_period_end: facts.cancelAtPeriodEnd,
    trial_ends_at: facts.trialEndsAt,
    updated_at: new Date().toISOString(),
  };

  // Only overwrite plan/interval when the price is one we recognise — an
  // unknown price (e.g. sold before an env change) shouldn't silently
  // downgrade someone to the default plan.
  if (mapped) {
    row.plan = mapped.plan;
    row.billing_interval = mapped.interval;
  } else if (facts.priceId) {
    console.warn(`Paddle webhook: price ${facts.priceId} is not in the catalog — plan left unchanged.`);
  }

  // A healthy lifecycle event clears any earlier payment failure.
  if (facts.status === "active" || facts.status === "on_trial") row.payment_failed_at = null;

  const { error } = await admin.from("subscriptions").upsert(row, { onConflict: "agency_id" });
  if (error) throw new Error(error.message);

  return { ok: true };
}

// ── transaction.completed ────────────────────────────────────
// Fires the moment a payment succeeds — including the very first one, which
// can arrive before subscription.created. Clearing payment_failed_at here (and
// stamping the customer id) means access is granted as soon as money lands
// rather than waiting for the subscription event.
async function recordPayment(admin: SupabaseClient, tx: TransactionLike): Promise<Handled> {
  const custom = tx.customData as { agency_id?: unknown } | null | undefined;
  const agencyId =
    (typeof custom?.agency_id === "string" ? custom.agency_id : null) ??
    (tx.subscriptionId ? await agencyBySubscription(admin, tx.subscriptionId) : null) ??
    (tx.customerId ? await agencyByCustomer(admin, tx.customerId) : null);

  if (!agencyId) {
    console.error(`Paddle webhook: no agency for transaction ${tx.id}`);
    return { ok: true, ignored: "unattributed transaction" };
  }

  // A one-off transaction with no subscription (rare in this app) has nothing
  // to sync — acknowledge it without touching the row.
  if (!tx.subscriptionId) return { ok: true, ignored: "non-subscription transaction" };

  const priceId = tx.items?.[0]?.price?.id ?? null;
  const mapped = priceId ? planForPrice(priceId) : null;

  const { data: existing } = await admin
    .from("subscriptions")
    .select("status")
    .eq("agency_id", agencyId)
    .maybeSingle();

  const row: Record<string, unknown> = {
    agency_id: agencyId,
    provider: "paddle",
    provider_subscription_id: tx.subscriptionId,
    payment_failed_at: null,
    updated_at: new Date().toISOString(),
  };

  // Money landed, so grant access here rather than waiting for
  // subscription.created — Paddle often delivers that event *after* this one,
  // and on a first purchase the row would otherwise be inserted with the
  // column default ('inactive'), locking out a paying customer.
  //
  // Only promote from states a successful payment actually resolves. Webhooks
  // can arrive out of order, so a replayed transaction.completed must never
  // resurrect a subscription that has since been cancelled, paused or expired
  // — those transitions belong to the subscription.* events.
  const PROMOTABLE = new Set(["inactive", "past_due", "unpaid"]);
  if (!existing || PROMOTABLE.has(existing.status as string)) row.status = "active";
  if (tx.customerId) row.provider_customer_id = tx.customerId;
  if (priceId) row.price_id = priceId;
  if (mapped) {
    row.plan = mapped.plan;
    row.billing_interval = mapped.interval;
  }

  const { error } = await admin.from("subscriptions").upsert(row, { onConflict: "agency_id" });
  if (error) throw new Error(error.message);

  return { ok: true };
}

// ── Attribution ──────────────────────────────────────────────
// customData is the primary link (stamped at checkout). Existing rows are the
// fallback for subscriptions created outside our checkout — e.g. in the Paddle
// dashboard, or when a customer's plan is changed by support.
async function resolveAgencyId(admin: SupabaseClient, facts: SubscriptionFacts): Promise<string | null> {
  if (facts.agencyId) return facts.agencyId;
  return (
    (await agencyBySubscription(admin, facts.subscriptionId)) ??
    (await agencyByCustomer(admin, facts.customerId))
  );
}

async function agencyBySubscription(admin: SupabaseClient, subscriptionId: string): Promise<string | null> {
  const { data } = await admin
    .from("subscriptions")
    .select("agency_id")
    .eq("provider_subscription_id", subscriptionId)
    .maybeSingle();
  return (data?.agency_id as string | undefined) ?? null;
}

async function agencyByCustomer(admin: SupabaseClient, customerId: string): Promise<string | null> {
  const { data } = await admin
    .from("subscriptions")
    .select("agency_id")
    .eq("provider_customer_id", customerId)
    .maybeSingle();
  return (data?.agency_id as string | undefined) ?? null;
}
