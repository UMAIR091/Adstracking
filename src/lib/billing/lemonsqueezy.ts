import crypto from "node:crypto";

// Lemon Squeezy REST client — pure fetch (mirrors email.ts / google.ts style,
// no SDK). All calls are server-only; the API key must never reach the client.

const API = "https://api.lemonsqueezy.com/v1";

function apiKey(): string {
  const k = process.env.LEMONSQUEEZY_API_KEY;
  if (!k) throw new Error("Billing is not configured (LEMONSQUEEZY_API_KEY).");
  return k;
}

async function ls<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Accept: "application/vnd.api+json",
      "Content-Type": "application/vnd.api+json",
      Authorization: `Bearer ${apiKey()}`,
      ...init?.headers,
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    // Surface LS's error detail when present, without leaking the raw payload.
    let detail = `${res.status}`;
    try {
      const parsed = JSON.parse(body);
      detail = parsed?.errors?.[0]?.detail ?? detail;
    } catch {
      /* keep status code */
    }
    throw new Error(`Lemon Squeezy request failed: ${detail}`);
  }
  return (await res.json()) as T;
}

// ── Checkout ─────────────────────────────────────────────────

// Creates a hosted checkout for a variant, tagged with the agency id so the
// webhook can attribute the subscription. Returns the checkout URL.
export async function createCheckoutUrl(args: {
  variantId: string;
  agencyId: string;
  email?: string | null;
}): Promise<string> {
  const storeId = process.env.LEMONSQUEEZY_STORE_ID;
  if (!storeId) throw new Error("Billing is not configured (LEMONSQUEEZY_STORE_ID).");
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";

  const body = {
    data: {
      type: "checkouts",
      attributes: {
        checkout_data: {
          email: args.email ?? undefined,
          custom: { agency_id: args.agencyId },
        },
        product_options: {
          redirect_url: `${appUrl}/dashboard/billing?checkout=success`,
        },
      },
      relationships: {
        store: { data: { type: "stores", id: storeId } },
        variant: { data: { type: "variants", id: args.variantId } },
      },
    },
  };

  const res = await ls<{ data: { attributes: { url: string } } }>("/checkouts", {
    method: "POST",
    body: JSON.stringify(body),
  });
  return res.data.attributes.url;
}

// ── Subscriptions ────────────────────────────────────────────

export type LsSubscription = {
  id: string;
  attributes: {
    status: string;
    variant_id: number;
    customer_id: number;
    card_brand: string | null;
    card_last_four: string | null;
    trial_ends_at: string | null;
    renews_at: string | null;
    ends_at: string | null;
    urls: { customer_portal: string; update_payment_method: string };
  };
};

export async function getSubscription(lsSubscriptionId: string): Promise<LsSubscription> {
  const res = await ls<{ data: LsSubscription }>(`/subscriptions/${lsSubscriptionId}`);
  return res.data;
}

// ── Invoices ─────────────────────────────────────────────────

export type LsInvoice = {
  id: string;
  attributes: {
    status: string;
    status_formatted: string;
    total_formatted: string;
    created_at: string;
    urls: { invoice_url: string | null };
  };
};

export async function listSubscriptionInvoices(lsSubscriptionId: string): Promise<LsInvoice[]> {
  const res = await ls<{ data: LsInvoice[] }>(
    `/subscription-invoices?filter[subscription_id]=${encodeURIComponent(lsSubscriptionId)}&page[size]=10`
  );
  return res.data;
}

// ── Prices (for display; checkout always shows the source of truth) ──

export async function getVariantPrice(variantId: string): Promise<{ cents: number; currency: string } | null> {
  try {
    const res = await ls<{ data: { attributes: { price: number } } }>(`/variants/${variantId}`);
    return { cents: res.data.attributes.price, currency: "USD" };
  } catch {
    return null; // price display is optional; never block the page on it
  }
}

// ── Webhooks ─────────────────────────────────────────────────

// Lemon Squeezy signs the raw body with HMAC-SHA256 (hex) using the secret
// configured on the webhook. Constant-time comparison, like cronAuth.
export function verifyWebhookSignature(rawBody: string, signatureHeader: string | null): boolean {
  const secret = process.env.LEMONSQUEEZY_WEBHOOK_SECRET;
  if (!secret || !signatureHeader) return false;
  const digest = crypto.createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
  const a = Buffer.from(digest);
  const b = Buffer.from(signatureHeader);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}
