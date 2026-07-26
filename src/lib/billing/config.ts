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
export type BillingInterval = "monthly" | "quarterly";

/** Months in one quarterly billing cycle — the multiplier for every
 *  "works out at per month" and "saving vs paying monthly" calculation. */
export const QUARTER_MONTHS = 3;

/** Every interval the app deals with, in catalog order. */
export const BILLING_INTERVALS: BillingInterval[] = ["monthly", "quarterly"];

// Subscriptions sold before the move to quarterly billing stored "annual" in
// `subscriptions.billing_interval` (a free-text column). The Paddle prices
// those rows point at are the same ids that now carry a 3-month cycle, so the
// legacy value is read as quarterly rather than dropped — otherwise an existing
// customer's billing page would render "—" for their cycle.
export function normalizeInterval(value: string | null | undefined): BillingInterval | null {
  switch ((value ?? "").trim().toLowerCase()) {
    case "monthly":
    case "month":
      return "monthly";
    case "quarterly":
    case "quarter":
    case "annual":
    case "yearly":
    case "year":
      return "quarterly";
    default:
      return null;
  }
}

/** Human label for an interval, used wherever a cycle is named in the UI. */
export function intervalLabel(interval: BillingInterval): string {
  return interval === "quarterly" ? "Every 3 months" : "Monthly";
}

/** The unit a price is quoted per, e.g. "$147/quarter". */
export function intervalUnit(interval: BillingInterval): string {
  return interval === "quarterly" ? "quarter" : "month";
}

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
  // The dormant Lemon Squeezy catalog only ever had monthly and annual
  // variants. Its annual variant is filed under the recurring (now quarterly)
  // slot purely so historical rows still resolve to a plan; no Lemon Squeezy
  // checkout runs any more, so the cycle mismatch is inert.
  return {
    monthly: env(`LEMONSQUEEZY_VARIANT_ID_${k}_MONTHLY`) ?? legacyMonthly,
    quarterly: env(`LEMONSQUEEZY_VARIANT_ID_${k}_ANNUAL`) ?? legacyAnnual,
  };
}

// Paddle price ids. Several naming conventions are accepted so the variables
// can be named whichever way the Paddle dashboard was transcribed:
//   PADDLE_PRO_MONTHLY_PRICE_ID   (plan-first — what this deployment uses)
//   PADDLE_PRICE_PRO_MONTHLY      (prefix-grouped alternative)
//
// The recurring interval is now QUARTERLY. The legacy *_YEARLY_*/_ANNUAL_*
// names are still read as a fallback because this deployment's environment
// keeps them: those variables were repointed at 3-month Paddle prices rather
// than renamed, so dropping the fallback would empty the catalog. A
// *_QUARTERLY_* variable always wins when both are present, so the environment
// can be renamed later with no code change.
function pricesFor(id: PlanId): Partial<Record<BillingInterval, string>> {
  const k = ENV_KEY[id];
  return {
    monthly: env(`PADDLE_${k}_MONTHLY_PRICE_ID`) ?? env(`PADDLE_PRICE_${k}_MONTHLY`),
    quarterly:
      env(`PADDLE_${k}_QUARTERLY_PRICE_ID`) ??
      env(`PADDLE_PRICE_${k}_QUARTERLY`) ??
      env(`PADDLE_${k}_YEARLY_PRICE_ID`) ??
      env(`PADDLE_${k}_ANNUAL_PRICE_ID`) ??
      env(`PADDLE_PRICE_${k}_ANNUAL`) ??
      env(`PADDLE_PRICE_${k}_YEARLY`),
  };
}

// Trial-enabled price ids (optional). Present only once trial prices exist in
// Paddle; without them checkout simply charges immediately, with no trial.
//
// A configured id is a candidate, not a guarantee: an archived price is
// rejected by Paddle at transaction time, so checkout confirms the price is
// still active before using it (see lib/billing/prices.ts usableTrialPriceId).
function trialPricesFor(id: PlanId): Partial<Record<BillingInterval, string>> {
  const k = ENV_KEY[id];
  return {
    monthly: env(`PADDLE_${k}_MONTHLY_TRIAL_PRICE_ID`) ?? env(`PADDLE_PRICE_${k}_MONTHLY_TRIAL`),
    quarterly:
      env(`PADDLE_${k}_QUARTERLY_TRIAL_PRICE_ID`) ??
      env(`PADDLE_PRICE_${k}_QUARTERLY_TRIAL`) ??
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
  return allPlans().some((p) => p.trialPrices.monthly || p.trialPrices.quarterly);
}

/** The trial-enabled price for a plan/interval, when one exists. */
export function findTrialPrice(plan: PlanId, interval: BillingInterval): string | undefined {
  return getPlan(plan)?.trialPrices[interval];
}

// Plans offered in the pricing UI — those with at least one purchasable price.
export function getPlans(): PlanDef[] {
  return allPlans().filter((p) => p.prices.monthly || p.prices.quarterly);
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
    for (const interval of BILLING_INTERVALS) {
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
    for (const interval of BILLING_INTERVALS) {
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
