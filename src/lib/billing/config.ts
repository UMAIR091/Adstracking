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

// ── Trial ────────────────────────────────────────────────────
// Paid plans can carry a short trial. Paddle attaches trials to the *price*,
// not to the checkout, so a trial requires a second price per plan/interval
// carrying trialPeriod. Checkout picks the trial price only for customers who
// have never consumed one (see lib/billing/trial.ts), which is what keeps the
// offer strictly once-per-customer.
export const PAID_TRIAL_DAYS = 3;

// ── Paid plans (identical features; differ only by client cap + price) ──
// NOTE: amounts deliberately live in Paddle, not here. Anything that displays
// a price reads it from lib/billing/prices.ts, so the app can never advertise
// a number Paddle won't charge.
export type PlanDef = {
  id: PlanId;
  name: string;
  limits: PlanLimits;
  /** Paddle price ids (pri_…) — the checkout source of truth. */
  prices: Partial<Record<BillingInterval, string>>;
  /** Trial-enabled Paddle price ids, used for a customer's first paid plan. */
  trialPrices: Partial<Record<BillingInterval, string>>;
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

// Limits and ordering are static; amounts come from Paddle and the provider
// ids from the environment. `rank` orders the plans (smallest cap first) so
// upgrade/downgrade direction never depends on a hardcoded price.
const CATALOG: Omit<PlanDef, "variants" | "prices" | "trialPrices">[] = [
  { id: "pro", name: "Pro", limits: { maxClients: 5, maxIntegrationsPerClient: UNLIMITED, maxReports: UNLIMITED } },
  { id: "pro_plus", name: "Pro Plus", limits: { maxClients: 10, maxIntegrationsPerClient: UNLIMITED, maxReports: UNLIMITED } },
  { id: "growth", name: "Growth", limits: { maxClients: 25, maxIntegrationsPerClient: UNLIMITED, maxReports: UNLIMITED } },
  { id: "agency", name: "Agency", limits: { maxClients: 100, maxIntegrationsPerClient: UNLIMITED, maxReports: UNLIMITED } },
];

/** Catalog order, used to tell an upgrade from a downgrade. */
export function planRank(id: string | null | undefined): number {
  const i = CATALOG.findIndex((p) => p.id === id);
  return i === -1 ? -1 : i;
}

// Client-safe plan metadata (no env reads, no amounts) for the marketing UI.
// Amounts are fetched from Paddle by lib/billing/prices.ts and passed in
// alongside this, so no price literal exists anywhere in the codebase.
export const PLAN_DISPLAY: { id: PlanId; name: string; maxClients: number }[] =
  CATALOG.map((p) => ({ id: p.id, name: p.name, maxClients: p.limits.maxClients }));

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

// Paddle price ids. Two naming conventions are accepted so the variables can
// be named whichever way the Paddle dashboard was transcribed:
//   PADDLE_PRO_MONTHLY_PRICE_ID   (plan-first — what this deployment uses)
//   PADDLE_PRICE_PRO_MONTHLY      (prefix-grouped alternative)
// "YEARLY" and "ANNUAL" are interchangeable; Paddle's UI says yearly, our
// billing interval is called annual.
function pricesFor(id: PlanId): Partial<Record<BillingInterval, string>> {
  const k = ENV_KEY[id];
  return {
    monthly: env(`PADDLE_${k}_MONTHLY_PRICE_ID`) ?? env(`PADDLE_PRICE_${k}_MONTHLY`),
    annual:
      env(`PADDLE_${k}_YEARLY_PRICE_ID`) ??
      env(`PADDLE_${k}_ANNUAL_PRICE_ID`) ??
      env(`PADDLE_PRICE_${k}_ANNUAL`) ??
      env(`PADDLE_PRICE_${k}_YEARLY`),
  };
}

// Trial-enabled price ids (optional). Present only once trial prices exist in
// Paddle; without them checkout simply charges immediately, with no trial.
function trialPricesFor(id: PlanId): Partial<Record<BillingInterval, string>> {
  const k = ENV_KEY[id];
  return {
    monthly: env(`PADDLE_${k}_MONTHLY_TRIAL_PRICE_ID`) ?? env(`PADDLE_PRICE_${k}_MONTHLY_TRIAL`),
    annual:
      env(`PADDLE_${k}_YEARLY_TRIAL_PRICE_ID`) ??
      env(`PADDLE_${k}_ANNUAL_TRIAL_PRICE_ID`) ??
      env(`PADDLE_PRICE_${k}_ANNUAL_TRIAL`),
  };
}

// The full catalog with resolved ids (regardless of whether purchasable).
export function allPlans(): PlanDef[] {
  return CATALOG.map((p) => ({
    ...p,
    prices: pricesFor(p.id),
    trialPrices: trialPricesFor(p.id),
    variants: variantsFor(p.id),
  }));
}

/** True once at least one trial-enabled price is configured. */
export function trialPricingConfigured(): boolean {
  return allPlans().some((p) => p.trialPrices.monthly || p.trialPrices.annual);
}

/** The trial-enabled price for a plan/interval, when one exists. */
export function findTrialPrice(plan: PlanId, interval: BillingInterval): string | undefined {
  return getPlan(plan)?.trialPrices[interval];
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
// Matches both the standard and the trial-enabled price, so a subscription
// started on a trial still resolves to the right plan. Returns null for prices
// that aren't in our catalog (e.g. a plan sold before an env change) so callers
// can decide how to degrade.
export function planForPrice(priceId: string): { plan: PlanId; interval: BillingInterval; trial: boolean } | null {
  for (const p of allPlans()) {
    for (const interval of ["monthly", "annual"] as const) {
      if (p.prices[interval] === priceId) return { plan: p.id, interval, trial: false };
      if (p.trialPrices[interval] === priceId) return { plan: p.id, interval, trial: true };
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
