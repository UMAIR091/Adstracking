// Paddle Billing server client. Wraps @paddle/paddle-node-sdk so the rest of
// the app never touches the SDK directly: routes call these functions, and the
// mapping between Paddle's vocabulary and our `subscriptions` table lives here.
//
// Server-only — PADDLE_API_KEY must never reach the browser. The browser gets
// PADDLE_CLIENT_TOKEN (a public, publishable token) via the checkout route.
import {
  Paddle,
  Environment,
  type Subscription,
  type Transaction,
  type EventEntity,
} from "@paddle/paddle-node-sdk";

// ── Environment ──────────────────────────────────────────────
// PADDLE_ENV selects the catalog; anything other than an explicit
// "production"/"live" stays on sandbox so a missing var can never bill a real
// card by accident.
export function paddleEnvironment(): Environment {
  const raw = (process.env.PADDLE_ENV ?? "").trim().toLowerCase();
  return raw === "production" || raw === "live" ? Environment.production : Environment.sandbox;
}

export function isSandbox(): boolean {
  return paddleEnvironment() === Environment.sandbox;
}

export function paddleClientToken(): string | null {
  return process.env.PADDLE_CLIENT_TOKEN?.trim() || null;
}

let client: Paddle | null = null;

// Lazily constructed so importing this module never throws at build time.
export function paddle(): Paddle {
  if (client) return client;
  const key = process.env.PADDLE_API_KEY?.trim();
  if (!key) throw new PaddleError("Billing is not configured (PADDLE_API_KEY).", 503);
  client = new Paddle(key, { environment: paddleEnvironment() });
  return client;
}

// Error carrying an HTTP status so routes can pass it straight through.
export class PaddleError extends Error {
  status: number;
  constructor(message: string, status = 502) {
    super(message);
    this.name = "PaddleError";
    this.status = status;
  }
}

// ── Retry ────────────────────────────────────────────────────
// Paddle is rate limited and can return transient 5xx. Retry idempotent reads
// and safe writes with exponential backoff; never retry a 4xx (a bad request
// won't fix itself) so we fail fast on genuine errors.
const RETRYABLE = new Set([408, 429, 500, 502, 503, 504]);

function statusOf(err: unknown): number | null {
  const c = (err as { code?: unknown })?.code;
  if (typeof c === "number") return c;
  const s = (err as { status?: unknown })?.status;
  return typeof s === "number" ? s : null;
}

export async function withRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const status = statusOf(err);
      const retryable = status === null || RETRYABLE.has(status);
      if (!retryable || i === attempts - 1) break;
      await new Promise((r) => setTimeout(r, 300 * 2 ** i));
    }
  }
  throw lastErr;
}

// Normalises any SDK failure into a PaddleError with a safe message. Paddle's
// detail strings are operator-facing, so we surface them without the payload.
function wrap(err: unknown, fallback: string): PaddleError {
  if (err instanceof PaddleError) return err;
  const status = statusOf(err) ?? 502;
  const detail = (err as { detail?: unknown })?.detail;
  const message = typeof detail === "string" && detail ? detail : (err as Error)?.message || fallback;
  return new PaddleError(message, status >= 400 && status < 600 ? status : 502);
}

// ── Status mapping ───────────────────────────────────────────
// Paddle subscription statuses → our existing `subscriptions.status` vocabulary
// (unchanged, so the access-control layer keeps working untouched).
const STATUS_MAP: Record<string, string> = {
  active: "active",
  trialing: "on_trial",
  past_due: "past_due",
  paused: "paused",
  canceled: "cancelled",
};

export function mapStatus(paddleStatus: string | null | undefined): string {
  return STATUS_MAP[(paddleStatus ?? "").toLowerCase()] ?? "inactive";
}

// ── Checkout ─────────────────────────────────────────────────

export type CheckoutSession = {
  transactionId: string;
  clientToken: string;
  environment: "sandbox" | "production";
};

// Creates a Paddle transaction for a single subscription price and returns the
// id for Paddle.js to open. Doing this server-side (rather than passing raw
// price ids to the browser) means the plan, quantity and agency attribution are
// all validated and stamped by us — the client can't tamper with what it buys.
export async function createCheckoutSession(args: {
  priceId: string;
  agencyId: string;
  email?: string | null;
  customerId?: string | null;
}): Promise<CheckoutSession> {
  const token = paddleClientToken();
  if (!token) throw new PaddleError("Billing is not configured (PADDLE_CLIENT_TOKEN).", 503);

  try {
    const tx = await withRetry(() =>
      paddle().transactions.create({
        items: [{ priceId: args.priceId, quantity: 1 }],
        // Echoed back on every webhook for this transaction and the resulting
        // subscription, so we can always attribute it to an agency.
        customData: { agency_id: args.agencyId },
        ...(args.customerId ? { customerId: args.customerId } : {}),
      })
    );
    return {
      transactionId: tx.id,
      clientToken: token,
      environment: isSandbox() ? "sandbox" : "production",
    };
  } catch (err) {
    throw wrap(err, "Couldn't start checkout.");
  }
}

// ── Subscriptions ────────────────────────────────────────────

export async function getSubscription(subscriptionId: string): Promise<Subscription> {
  try {
    return await withRetry(() => paddle().subscriptions.get(subscriptionId));
  } catch (err) {
    throw wrap(err, "Couldn't load the subscription.");
  }
}

// Swaps the subscription onto a new price (upgrade or downgrade).
//   - Upgrades bill the prorated difference immediately, so the customer gets
//     the higher client cap straight away. `prevent_change` means a declined
//     card leaves them on the old plan rather than granting an unpaid upgrade.
//   - Downgrades swap the price without an immediate charge or credit; the
//     lower amount simply applies from the next renewal.
export async function changeSubscriptionPrice(args: {
  subscriptionId: string;
  priceId: string;
  immediate: boolean;
}): Promise<Subscription> {
  try {
    return await withRetry(() =>
      paddle().subscriptions.update(args.subscriptionId, {
        items: [{ priceId: args.priceId, quantity: 1 }],
        ...(args.immediate
          ? { prorationBillingMode: "prorated_immediately" as const, onPaymentFailure: "prevent_change" as const }
          : { prorationBillingMode: "do_not_bill" as const }),
      })
    );
  } catch (err) {
    throw wrap(err, "Couldn't change the plan.");
  }
}

// Schedules cancellation at the end of the paid period (never immediate — the
// customer keeps what they've paid for). Paddle reports this back as
// scheduled_change, which the webhook stores as cancel_at_period_end.
export async function cancelSubscription(subscriptionId: string): Promise<Subscription> {
  try {
    return await withRetry(() =>
      paddle().subscriptions.cancel(subscriptionId, { effectiveFrom: "next_billing_period" })
    );
  } catch (err) {
    throw wrap(err, "Couldn't cancel the subscription.");
  }
}

// Removes a scheduled cancellation, resuming normal billing.
export async function resumeSubscription(subscriptionId: string): Promise<Subscription> {
  try {
    return await withRetry(() => paddle().subscriptions.update(subscriptionId, { scheduledChange: null }));
  } catch (err) {
    throw wrap(err, "Couldn't resume the subscription.");
  }
}

// ── Customer portal ──────────────────────────────────────────

// Paddle generates short-lived, signed portal links per customer, so we mint a
// fresh one per click rather than storing it. Scoping it to the subscription
// gives the customer deep links for payment method + cancellation too.
export async function createPortalUrl(customerId: string, subscriptionId?: string | null): Promise<string> {
  try {
    const session = await withRetry(() =>
      paddle().customerPortalSessions.create(customerId, subscriptionId ? [subscriptionId] : [])
    );
    return session.urls.general.overview;
  } catch (err) {
    throw wrap(err, "Couldn't open the billing portal.");
  }
}

// ── Transactions (invoice history) ───────────────────────────

export type InvoiceView = {
  id: string;
  billedAt: string | null;
  status: string;
  total: string; // formatted, e.g. "$49.00"
  invoiceUrl: string | null;
};

function formatAmount(amount: string | null | undefined, currency: string | null | undefined): string {
  const cents = Number(amount ?? 0);
  if (!isFinite(cents)) return "—";
  const value = cents / 100;
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: currency || "USD" }).format(value);
  } catch {
    return `${value.toFixed(2)} ${currency ?? ""}`.trim();
  }
}

// Recent billed transactions for the invoice list. Never throws — invoice
// history is decorative and must not take the billing page down.
export async function listInvoices(subscriptionId: string, limit = 10): Promise<InvoiceView[]> {
  try {
    const page = paddle().transactions.list({ subscriptionId: [subscriptionId], perPage: limit });
    const rows = await page.next();
    return rows.map((t: Transaction) => ({
      id: t.id,
      billedAt: t.billedAt ?? t.createdAt ?? null,
      status: t.status ?? "unknown",
      total: formatAmount(t.details?.totals?.total, t.currencyCode),
      invoiceUrl: null,
    }));
  } catch {
    return [];
  }
}

// A signed PDF invoice link for one transaction (fetched on demand).
export async function getInvoicePdfUrl(transactionId: string): Promise<string | null> {
  try {
    const res = await paddle().transactions.getInvoicePDF(transactionId);
    return res.url ?? null;
  } catch {
    return null;
  }
}

// ── Webhooks ─────────────────────────────────────────────────

// Verifies the Paddle-Signature header against the raw body and returns the
// parsed event, or null when the signature doesn't match. The SDK performs the
// timestamped HMAC-SHA256 check and replay-window validation for us.
export async function verifyWebhook(rawBody: string, signature: string | null): Promise<EventEntity | null> {
  const secret = process.env.PADDLE_WEBHOOK_SECRET?.trim();
  if (!secret || !signature) return null;
  try {
    return await paddle().webhooks.unmarshal(rawBody, secret, signature);
  } catch {
    return null;
  }
}

export function webhookConfigured(): boolean {
  return Boolean(process.env.PADDLE_WEBHOOK_SECRET?.trim());
}

// ── Shared shapes ────────────────────────────────────────────

// Everything the DB needs from a Paddle subscription, in one place so the
// webhook and the sync-on-read path can't drift apart.
export type SubscriptionFacts = {
  subscriptionId: string;
  customerId: string;
  priceId: string | null;
  status: string; // already mapped to our vocabulary
  currentPeriodEnd: string | null;
  endsAt: string | null;
  cancelAtPeriodEnd: boolean;
  trialEndsAt: string | null;
  agencyId: string | null; // from customData when present
};

// Structural shape shared by the API entity (`Subscription`) and the webhook
// entity (`SubscriptionNotification`). Typing against this rather than either
// class lets both flow through readSubscription without an unsafe cast — the
// two differ only in nullability of nested fields, all handled below.
export type SubscriptionLike = {
  id: string;
  status: string;
  customerId: string;
  nextBilledAt: string | null;
  canceledAt: string | null;
  currentBillingPeriod: { endsAt: string } | null;
  scheduledChange: { action: string; effectiveAt: string } | null;
  items: { price: { id: string } | null }[];
  customData: unknown;
};

// Same idea for transactions (`Transaction` / `TransactionNotification`).
export type TransactionLike = {
  id: string;
  customerId: string | null;
  subscriptionId: string | null;
  items: { price: { id: string } | null }[];
  customData: unknown;
};

export function readSubscription(sub: SubscriptionLike): SubscriptionFacts {
  const item = sub.items?.[0];
  const scheduled = sub.scheduledChange;
  const cancelAtPeriodEnd = scheduled?.action === "cancel";
  const custom = sub.customData as { agency_id?: unknown } | null | undefined;

  return {
    subscriptionId: sub.id,
    customerId: sub.customerId,
    priceId: item?.price?.id ?? null,
    status: mapStatus(sub.status),
    currentPeriodEnd: sub.currentBillingPeriod?.endsAt ?? sub.nextBilledAt ?? null,
    // When a cancellation is scheduled, access ends at the scheduled date;
    // otherwise Paddle only sets canceledAt once it has actually ended.
    endsAt: cancelAtPeriodEnd ? scheduled?.effectiveAt ?? null : sub.canceledAt ?? null,
    cancelAtPeriodEnd,
    trialEndsAt: sub.status === "trialing" ? sub.currentBillingPeriod?.endsAt ?? null : null,
    agencyId: typeof custom?.agency_id === "string" ? custom.agency_id : null,
  };
}
