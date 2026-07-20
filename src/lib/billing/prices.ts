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
import { allPlans, type BillingInterval, type PlanId } from "./config";
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
  annual: Money | null;
  /** Effective monthly cost when paying annually. */
  annualPerMonth: Money | null;
  /** Whole-percent saving of annual vs 12x monthly, when both are known. */
  annualSavingPct: number | null;
  /** A trial-enabled price exists for this plan. */
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

export type PriceIndex = {
  prices: Record<string, { amount: number; currency: string }>;
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
    for (const iv of ["monthly", "annual"] as const) {
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
        return [id, { amount, currency: price.unitPrice?.currencyCode ?? "USD" }] as const;
      } catch (err) {
        console.error(`Paddle price ${id} failed to load: ${(err as Error).message}`);
        return null;
      }
    })
  );

  const prices: Record<string, { amount: number; currency: string }> = {};
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
    .filter((p) => p.prices.monthly || p.prices.annual)
    .map((p) => {
      const lookup = (iv: BillingInterval): Money | null => {
        const id = p.prices[iv];
        const row = id ? index[id] : undefined;
        return row ? money(row.amount, row.currency) : null;
      };

      const monthly = lookup("monthly");
      const annual = lookup("annual");

      // Derived from the two real amounts — never from a discount constant.
      // Rounded to whole currency units: this is an illustrative "works out at"
      // figure, and the exact yearly total is always shown beside it.
      const annualPerMonth = annual
        ? money(Math.round(annual.amount / 12 / 100) * 100, annual.currency)
        : null;
      const annualSavingPct =
        monthly && annual && monthly.amount > 0
          ? Math.round((1 - annual.amount / (monthly.amount * 12)) * 100)
          : null;

      return {
        id: p.id,
        name: p.name,
        maxClients: p.limits.maxClients,
        monthly,
        annual,
        annualPerMonth,
        annualSavingPct,
        trialAvailable: Boolean(p.trialPrices.monthly || p.trialPrices.annual),
      };
    });
}

// The headline saving shown on the billing toggle — the smallest across plans,
// so the advertised number is one every plan actually meets or beats.
export function headlineSavingPct(plans: PlanPricing[]): number | null {
  const values = plans.map((p) => p.annualSavingPct).filter((v): v is number => v != null && v > 0);
  return values.length ? Math.min(...values) : null;
}
