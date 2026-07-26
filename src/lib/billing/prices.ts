// Live pricing, read from Paddle.
//
// No amount is hardcoded anywhere in the app: every surface that shows a price
// reads it from here, and here reads it from the Paddle catalog. That makes it
// impossible to advertise a figure Paddle won't charge — the failure mode of a
// hardcoded table is a silent mismatch at the moment money changes hands.
//
// Results are cached (Next data cache, hourly revalidation) so the public
// pricing page stays fast and doesn't hit Paddle per render. If Paddle is
// unreachable the amounts come back null and callers render a neutral
// placeholder rather than a stale or invented number.
import { unstable_cache } from "next/cache";
import { allPlans, getPlan, BILLING_INTERVALS, QUARTER_MONTHS, type BillingInterval, type PlanId } from "./config";
import { paddle, withRetry } from "./paddle";

export type Money = {
  /** Minor units, exactly as Paddle stores it. */
  amount: number;
  currency: string;
  /** Preformatted for display, e.g. "$49". */
  formatted: string;
};

export type PlanPricing = {
  id: PlanId;
  name: string;
  maxClients: number;
  monthly: Money | null;
  /** Total charged once every 3 months. */
  quarterly: Money | null;
  /** Effective monthly cost when paying quarterly. */
  quarterlyPerMonth: Money | null;
  /** Whole-percent saving of quarterly vs 3x monthly, when both are known. */
  quarterlySavingPct: number | null;
  /** This plan starts with a free trial (from a trial price or the plan price itself). */
  trialAvailable: boolean;
};

function format(amountMinor: number, currency: string): string {
  const value = amountMinor / 100;
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      // Whole amounts read better without ".00" on a pricing page.
      minimumFractionDigits: value % 1 === 0 ? 0 : 2,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${value} ${currency}`;
  }
}

const money = (amountMinor: number, currency: string): Money => ({
  amount: amountMinor,
  currency,
  formatted: format(amountMinor, currency),
});

export type PriceRow = {
  amount: number;
  currency: string;
  /** Paddle lifecycle state. An `archived` price is rejected at checkout. */
  active: boolean;
  /** The price itself carries a trial period, so any checkout on it starts free. */
  hasTrial: boolean;
};

export type PriceIndex = {
  prices: Record<string, PriceRow>;
  /** False when any configured price failed to resolve — see the note below. */
  complete: boolean;
};

// Fetches every configured price and indexes it by id.
//
// Each price is fetched individually rather than through prices.list(). The
// list endpoint returns a *stateful* collection: calling next() a second time
// advances the cursor instead of repeating the request, so wrapping it in a
// retry silently yields a partial page. That shipped once and left two plans
// priced "—" on production for an hour. Independent gets have no shared
// cursor, retry cleanly, and confine any failure to a single price.
async function fetchPriceIndex(): Promise<PriceIndex> {
  const ids = new Set<string>();
  for (const p of allPlans()) {
    for (const iv of BILLING_INTERVALS) {
      if (p.prices[iv]) ids.add(p.prices[iv]!);
      if (p.trialPrices[iv]) ids.add(p.trialPrices[iv]!);
    }
  }
  if (ids.size === 0) return { prices: {}, complete: true };

  const results = await Promise.all(
    Array.from(ids).map(async (id) => {
      try {
        const price = await withRetry(() => paddle().prices.get(id));
        const amount = Number(price.unitPrice?.amount ?? NaN);
        if (!Number.isFinite(amount)) return null;
        return [
          id,
          {
            amount,
            currency: price.unitPrice?.currencyCode ?? "USD",
            active: price.status === "active",
            hasTrial: Boolean(price.trialPeriod),
          } satisfies PriceRow,
        ] as const;
      } catch (err) {
        console.error(`Paddle price ${id} failed to load: ${(err as Error).message}`);
        return null;
      }
    })
  );

  const prices: Record<string, PriceRow> = {};
  for (const row of results) if (row) prices[row[0]] = row[1];

  return { prices, complete: Object.keys(prices).length === ids.size };
}

// Cached across requests; revalidates hourly. Prices change rarely, and a
// stale-by-an-hour figure is still a figure Paddle will honour.
const cachedPriceIndex = unstable_cache(
  async (): Promise<PriceIndex> => {
    try {
      return await fetchPriceIndex();
    } catch (err) {
      console.error("Paddle price fetch failed:", (err as Error).message);
      return { prices: {}, complete: false };
    }
  },
  ["paddle-price-index"],
  { revalidate: 3600, tags: ["paddle-prices"] }
);

// A partial catalog must never be served from cache: doing so pins a page
// showing "—" for some plans until the entry expires. If the cached result is
// incomplete we pay for one live refetch instead, which is bounded (a handful
// of small requests) and only happens while genuinely degraded.
async function priceIndex(): Promise<PriceIndex> {
  // unstable_cache requires a Next request context; outside one (scripts,
  // tests) fall through to a direct fetch rather than throwing.
  let cached: PriceIndex;
  try {
    cached = await cachedPriceIndex();
  } catch {
    return fetchPriceIndex();
  }
  if (cached.complete) return cached;

  console.warn("Paddle price cache is incomplete — refetching live.");
  try {
    const fresh = await fetchPriceIndex();
    // Prefer whichever resolved more prices; never regress on a flaky retry.
    return Object.keys(fresh.prices).length >= Object.keys(cached.prices).length ? fresh : cached;
  } catch {
    return cached;
  }
}

// Pricing for every plan that has at least one purchasable price.
export async function getPlanPricing(): Promise<PlanPricing[]> {
  const { prices: index } = await priceIndex();

  return allPlans()
    .filter((p) => p.prices.monthly || p.prices.quarterly)
    .map((p) => {
      const lookup = (iv: BillingInterval): Money | null => {
        const id = p.prices[iv];
        const row = id ? index[id] : undefined;
        return row ? money(row.amount, row.currency) : null;
      };

      const monthly = lookup("monthly");
      const quarterly = lookup("quarterly");

      // Derived from the two real amounts — never from a discount constant.
      // Rounded to whole currency units: this is an illustrative "works out at"
      // figure, and the exact quarterly total is always shown beside it.
      const quarterlyPerMonth = quarterly
        ? money(Math.round(quarterly.amount / QUARTER_MONTHS / 100) * 100, quarterly.currency)
        : null;
      const quarterlySavingPct =
        monthly && quarterly && monthly.amount > 0
          ? Math.round((1 - quarterly.amount / (monthly.amount * QUARTER_MONTHS)) * 100)
          : null;

      // A trial is offered when a usable trial price exists OR when the plan's
      // own price carries a trial period. Both are read from the live catalog,
      // so the badge can't advertise a free trial that checkout won't start.
      const trialAvailable = BILLING_INTERVALS.some((iv) => {
        const trialRow = p.trialPrices[iv] ? index[p.trialPrices[iv]!] : undefined;
        const standardRow = p.prices[iv] ? index[p.prices[iv]!] : undefined;
        return Boolean((trialRow?.active && trialRow.hasTrial) || standardRow?.hasTrial);
      });

      return {
        id: p.id,
        name: p.name,
        maxClients: p.limits.maxClients,
        monthly,
        quarterly,
        quarterlyPerMonth,
        quarterlySavingPct,
        trialAvailable,
      };
    });
}

// The headline saving shown on the billing toggle — the smallest across plans,
// so the advertised number is one every plan actually meets or beats.
export function headlineSavingPct(plans: PlanPricing[]): number | null {
  const values = plans.map((p) => p.quarterlySavingPct).filter((v): v is number => v != null && v > 0);
  return values.length ? Math.min(...values) : null;
}

// The trial price to check out, or null when there isn't a usable one.
//
// A configured trial price id is only a candidate: Paddle rejects an archived
// price when the transaction is created, which would turn "start your trial"
// into a hard checkout failure. Confirming against the live catalog means an
// archived or stale trial price degrades to charging normally instead — and if
// the plan's standard price carries its own trial period, the customer still
// starts free. Returns null if the catalog can't be read, which is the safe
// direction: bill correctly rather than fail to sell.
export async function usableTrialPriceId(
  plan: PlanId,
  interval: BillingInterval
): Promise<string | null> {
  const id = getPlan(plan)?.trialPrices[interval];
  if (!id) return null;
  try {
    const { prices } = await priceIndex();
    const row = prices[id];
    if (!row) return null;
    if (!row.active) {
      console.warn(`Paddle trial price ${id} (${plan}/${interval}) is archived — checking out the standard price.`);
      return null;
    }
    return row.hasTrial ? id : null;
  } catch (err) {
    console.error(`Trial price check failed for ${plan}/${interval}:`, (err as Error).message);
    return null;
  }
}

/** True when a checkout on this plan's standard price starts with a free trial. */
export async function standardPriceStartsTrial(
  plan: PlanId,
  interval: BillingInterval
): Promise<boolean> {
  const id = getPlan(plan)?.prices[interval];
  if (!id) return false;
  try {
    const { prices } = await priceIndex();
    return Boolean(prices[id]?.hasTrial);
  } catch {
    return false;
  }
}
