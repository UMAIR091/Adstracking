import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchPinterestAdsReport, listPinterestAdAccounts } from "./pinterest";

// Pinterest ad data has never been read in production (no ad accounts can be
// opened from Pakistan), so these replay the response shapes from Pinterest's
// v5 reference: analytics endpoints return a bare JSON array of rows keyed by
// DATE / CAMPAIGN_ID plus the requested columns; lists return { items, bookmark }.

type Route = (url: URL) => { status?: number; body: unknown };

function serve(route: Route) {
  const calls: URL[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string) => {
      const url = new URL(input);
      calls.push(url);
      const { status = 200, body } = route(url);
      return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
    })
  );
  return calls;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

const ACCOUNT = "549755885175";

// Two rows per window: its first and last day, so totals are easy to check.
function analyticsRows(url: URL, withRevenue: boolean) {
  const row = (date: string, spend: number) => ({
    DATE: date,
    AD_ACCOUNT_ID: ACCOUNT,
    SPEND_IN_DOLLAR: spend,
    IMPRESSION_1: 1000,
    CLICKTHROUGH_1: 25,
    TOTAL_CONVERSIONS: 2,
    ...(withRevenue ? { TOTAL_CONVERSIONS_VALUE_IN_MICRO_DOLLAR: 30_000_000 } : {}),
  });
  return [row(url.searchParams.get("start_date")!, 10), row(url.searchParams.get("end_date")!, 15.5)];
}

function adsRoute(opts: { revenue: boolean }): Route {
  return (url) => {
    const p = url.pathname.replace("/v5", "");
    if (p === `/ad_accounts/${ACCOUNT}`) return { body: { id: ACCOUNT, currency: "EUR" } };
    if (p === `/ad_accounts/${ACCOUNT}/analytics`) {
      const asksRevenue = url.searchParams.get("columns")!.includes("TOTAL_CONVERSIONS_VALUE_IN_MICRO_DOLLAR");
      if (asksRevenue && !opts.revenue) return { status: 400, body: { code: 1, message: "Invalid column" } };
      return { body: analyticsRows(url, opts.revenue) };
    }
    if (p === `/ad_accounts/${ACCOUNT}/campaigns`) {
      return { body: { items: [{ id: "c1", name: "Autumn catalog" }, { id: "c2", name: "Brand" }], bookmark: null } };
    }
    if (p === `/ad_accounts/${ACCOUNT}/campaigns/analytics`) {
      return {
        body: [
          { CAMPAIGN_ID: "c2", SPEND_IN_DOLLAR: 5, IMPRESSION_1: 400, CLICKTHROUGH_1: 4, TOTAL_CONVERSIONS: 0 },
          { CAMPAIGN_ID: "c1", SPEND_IN_DOLLAR: 20.5, IMPRESSION_1: 1600, CLICKTHROUGH_1: 46, TOTAL_CONVERSIONS: 4 },
        ],
      };
    }
    return { status: 404, body: { message: `unexpected ${p}` } };
  };
}

describe("Pinterest Ads report", () => {
  it("totals daily rows, keeps the account currency and ranks campaigns by spend", async () => {
    const calls = serve(adsRoute({ revenue: true }));
    const r = await fetchPinterestAdsReport("token", ACCOUNT, 30);

    expect(r.platform).toBe("pinterest_ads");
    expect(r.currency).toBe("EUR");
    expect(r.byDate).toHaveLength(30);
    expect(r.totals.spend).toBeCloseTo(25.5);
    expect(r.totals.impressions).toBe(2000);
    expect(r.totals.clicks).toBe(50);
    expect(r.totals.conversions).toBe(4);
    expect(r.totals.revenue).toBeCloseTo(60); // 2 × 30,000,000 micro-dollars
    expect(r.previousTotals?.spend).toBeCloseTo(25.5);
    expect(r.topCampaigns.map((c) => c.name)).toEqual(["Autumn catalog", "Brand"]);

    // Every analytics request is a DAY-granularity read with the expected columns.
    const daily = calls.find((u) => u.pathname.endsWith(`/ad_accounts/${ACCOUNT}/analytics`))!;
    expect(daily.searchParams.get("granularity")).toBe("DAY");
    expect(daily.searchParams.get("columns")!.split(",")).toEqual(
      expect.arrayContaining(["SPEND_IN_DOLLAR", "IMPRESSION_1", "CLICKTHROUGH_1", "TOTAL_CONVERSIONS"])
    );
  });

  it("drops the revenue column, not the report, when Pinterest rejects it", async () => {
    serve(adsRoute({ revenue: false }));
    const r = await fetchPinterestAdsReport("token", ACCOUNT, 7);
    expect(r.totals.spend).toBeCloseTo(25.5);
    expect(r.totals.revenue).toBe(0);
  });
});

describe("Pinterest ad account list", () => {
  it("follows the bookmark across pages", async () => {
    serve((url) =>
      url.searchParams.get("bookmark") === "p2"
        ? { body: { items: [{ id: "2", name: "Second" }], bookmark: null } }
        : { body: { items: [{ id: "1", name: "First" }], bookmark: "p2" } }
    );
    expect(await listPinterestAdAccounts("token")).toEqual([
      { id: "1", name: "First" },
      { id: "2", name: "Second" },
    ]);
  });

  it("returns an empty list for a user with no ad accounts", async () => {
    serve(() => ({ body: { items: [], bookmark: null } }));
    expect(await listPinterestAdAccounts("token")).toEqual([]);
  });
});
