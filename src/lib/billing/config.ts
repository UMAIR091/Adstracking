// Billing plan catalog — the SINGLE source of truth for the subscription model.
// Every plan's price and limits live here; change them in one place and the
// whole app (enforcement, pricing page, billing page, upgrade prompts) follows.
//
// Design rule: all paid plans have EXACTLY the same features. The only
// differences are the client/workspace limit and the price. Nothing (AI,
// exports, scheduling, white-label, integrations, future features) is ever
// gated behind a higher plan — do not add per-plan feature flags here.
//
// Paddle price IDs come from env so the same code runs against the sandbox and
// live catalogs; a plan renders in the pricing UI only when it has a configured
// price. Lemon Squeezy variant ids are still resolved for historical rows but
// are no longer used for checkout.

export type PlanId = "pro" | "pro_plus" | "growth" | "agency";
export type BillingInterval = "monthly" | "annual";

// null = unlimited.
export type Limit = number | null;
export const UNLIMITED: Limit = null;

export type PlanLimits = {
  maxClients: number; // active clients / workspaces
  maxIntegrationsPerClient: Limit; // per-client data sources
  maxReports: Limit; // lifetime report cap (only the trial sets one)
};

// ── Free trial ───────────────────────────────────────────────
export const TRIAL_DAYS = 7;
export const TRIAL_LIMITS: PlanLimits = {
  maxClients: 1,
  maxIntegrationsPerClient: 3,
  maxReports: 1,
};

// ── Paid plans (identical features; differ only by client cap + price) ──
export type PlanDef = {
  id: PlanId;
  name: string;
  priceMonthly: number; // USD/month, for display
  limits: PlanLimits;
  /** Paddle price ids (pri_…) — the checkout source of truth. */
  prices: Partial<Record<BillingInterval, string>>;
  /** Legacy Lemon Squeezy variant ids, kept so historical rows still resolve. */
  variants: Partial<Record<BillingInterval, string>>;
};

// The feature set every paid plan shares — shown once on the pricing page.
export const PAID_FEATURES: string[] = [
  "Unlimited integrations per client",
  "Unlimited reports & scheduled delivery",
  "AI insights on every report",
  "Full white-label branding & PDF exports",
  "Every integration, as it launches",
];

function env(key: string): string | undefined {
  return process.env[key] || undefined;
}

// Prices + limits are static; only the provider ids are environment-bound.
const CATALOG: Omit<PlanDef, "variants" | "prices">[] = [
  { id: "pro", name: "Pro", priceMonthly: 49, limits: { maxClients: 5, maxIntegrationsPerClient: UNLIMITED, maxReports: UNLIMITED } },
  { id: "pro_plus", name: "Pro Plus", priceMonthly: 95, limits: { maxClients: 10, maxIntegrationsPerClient: UNLIMITED, maxReports: UNLIMITED } },
  { id: "growth", name: "Growth", priceMonthly: 149, limits: { maxClients: 25, maxIntegrationsPerClient: UNLIMITED, maxReports: UNLIMITED } },
  { id: "agency", name: "Agency", priceMonthly: 299, limits: { maxClients: 100, maxIntegrationsPerClient: UNLIMITED, maxReports: UNLIMITED } },
];

// Client-safe display data (no env reads) for the pricing/marketing UI, derived
// from the same CATALOG so prices + client caps are never defined twice.
export const PLAN_DISPLAY: { id: PlanId; name: string; priceMonthly: number; maxClients: number }[] =
  CATALOG.map((p) => ({ id: p.id, name: p.name, priceMonthly: p.priceMonthly, maxClients: p.limits.maxClients }));

const ENV_KEY: Record<PlanId, string> = {
  pro: "PRO",
  pro_plus: "PRO_PLUS",
  growth: "GROWTH",
  agency: "AGENCY",
};

function variantsFor(id: PlanId): Partial<Record<BillingInterval, string>> {
  const k = ENV_KEY[id];
  // Pro falls back to the legacy env names so an existing store keeps working.
  const legacyMonthly = id === "pro" ? env("LEMONSQUEEZY_VARIANT_ID_PRO_MONTHLY") ?? env("LEMONSQUEEZY_VARIANT_ID_MONTHLY") : undefined;
  const legacyAnnual = id === "pro" ? env("LEMONSQUEEZY_VARIANT_ID_PRO_ANNUAL") ?? env("LEMONSQUEEZY_VARIANT_ID_ANNUAL") : undefined;
  return {
    monthly: env(`LEMONSQUEEZY_VARIANT_ID_${k}_MONTHLY`) ?? legacyMonthly,
    annual: env(`LEMONSQUEEZY_VARIANT_ID_${k}_ANNUAL`) ?? legacyAnnual,
  };
}

// Paddle price ids, e.g. PADDLE_PRICE_PRO_MONTHLY / PADDLE_PRICE_PRO_ANNUAL.
// Yearly prices also accept the _YEARLY spelling, which is what Paddle's own
// dashboard calls the billing cycle.
function pricesFor(id: PlanId): Partial<Record<BillingInterval, string>> {
  const k = ENV_KEY[id];
  return {
    monthly: env(`PADDLE_PRICE_${k}_MONTHLY`),
    annual: env(`PADDLE_PRICE_${k}_ANNUAL`) ?? env(`PADDLE_PRICE_${k}_YEARLY`),
  };
}

// The full catalog with resolved ids (regardless of whether purchasable).
export function allPlans(): PlanDef[] {
  return CATALOG.map((p) => ({ ...p, prices: pricesFor(p.id), variants: variantsFor(p.id) }));
}

// Plans offered in the pricing UI — those with at least one purchasable price.
export function getPlans(): PlanDef[] {
  return allPlans().filter((p) => p.prices.monthly || p.prices.annual);
}

export function getPlan(id: PlanId): PlanDef | undefined {
  return allPlans().find((p) => p.id === id);
}

// Limits for a given plan id (used by the enforcement layer). Falls back to the
// smallest paid plan for an unknown/legacy id so we never over-grant.
export function limitsForPlan(id: string | null | undefined): PlanLimits {
  return (id && getPlan(id as PlanId)?.limits) || CATALOG[0].limits;
}

export function findVariant(plan: PlanId, interval: BillingInterval): string | undefined {
  return getPlan(plan)?.variants[interval];
}

// The Paddle price id to check out for a given plan + interval.
export function findPrice(plan: PlanId, interval: BillingInterval): string | undefined {
  return getPlan(plan)?.prices[interval];
}

// Reverse lookup for webhooks: which plan/interval does a variant id belong to?
export function planForVariant(variantId: string): { plan: PlanId; interval: BillingInterval } | null {
  for (const p of allPlans()) {
    for (const interval of ["monthly", "annual"] as const) {
      if (p.variants[interval] === variantId) return { plan: p.id, interval };
    }
  }
  return null;
}

// Reverse lookup for Paddle webhooks: which plan/interval is this price id?
// Returns null for prices that aren't in our catalog (e.g. a plan sold before
// an env change) so callers can decide how to degrade.
export function planForPrice(priceId: string): { plan: PlanId; interval: BillingInterval } | null {
  for (const p of allPlans()) {
    for (const interval of ["monthly", "annual"] as const) {
      if (p.prices[interval] === priceId) return { plan: p.id, interval };
    }
  }
  return null;
}

export function planName(id: string | null | undefined): string {
  return (id && getPlan(id as PlanId)?.name) || "Pro";
}

// Paddle is usable when the server key, the browser token and at least one
// purchasable price are all present. Checkout routes fail closed without this.
export function billingConfigured(): boolean {
  return Boolean(process.env.PADDLE_API_KEY && process.env.PADDLE_CLIENT_TOKEN && getPlans().length > 0);
}
