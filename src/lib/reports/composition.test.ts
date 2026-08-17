import { describe, expect, it } from "vitest";
import { assessComposition, blockUnits, MIN_TREND_POINTS } from "./composition";
import type { GscReportFull, Ga4ReportFull } from "@/lib/google";
import type { ReportBlock } from "@/lib/integrations/blocks";

// The point of this module: page composition must follow the DATA, not a shape
// that happened to match one test account. These pin the cases the previous
// boolean got wrong.

const series = (n: number) => Array.from({ length: n }, (_, i) => ({ date: `2026-07-${String(i + 1).padStart(2, "0")}`, value: i }));

const block = (over: Partial<ReportBlock> = {}): ReportBlock =>
  ({
    sourceId: "meta_ads", sourceName: "Meta Ads", category: "paid", currency: "USD",
    kpis: [{ label: "Spend", value: 100, previous: null, format: "currency" }],
    series: [], tables: [], notes: [],
    ...over,
  }) as unknown as ReportBlock;

const gscRich = {
  totals: { clicks: 1, impressions: 1, ctr: 1, position: 1 },
  byDate: series(31).map((p) => ({ date: p.date, clicks: 1, impressions: 1, ctr: 1, position: 1 })),
  topQueries: [{ key: "a" }], topPages: [{ key: "b" }],
  topCountries: [{ key: "c" }], topDevices: [{ key: "d" }],
  movers: { winners: [{ key: "w" }], decliners: [], opportunities: [{ key: "o" }] },
  previousTotals: null,
} as unknown as GscReportFull;

const gscThin = {
  totals: { clicks: 0, impressions: 2, ctr: 0, position: 6.5 },
  byDate: [{ date: "2026-07-30", clicks: 0, impressions: 1, ctr: 0, position: 6.5 }],
  topQueries: [], topPages: [], topCountries: [], topDevices: [], movers: null, previousTotals: null,
} as unknown as GscReportFull;

describe("blockUnits", () => {
  it("counts a KPI group, qualifying charts and populated tables", () => {
    const b = block({
      series: [{ label: "Spend", format: "currency", points: series(31) }] as ReportBlock["series"],
      tables: [{ title: "Campaigns", columns: [], rows: [{}] }] as unknown as ReportBlock["tables"],
    });
    expect(blockUnits(b)).toBe(3);
  });

  it("does not count a chart with too few points to be one", () => {
    const b = block({ series: [{ label: "Spend", format: "currency", points: series(MIN_TREND_POINTS - 1) }] as ReportBlock["series"] });
    expect(blockUnits(b)).toBe(1); // KPIs only
  });

  it("does not count a KPI row that is entirely uncalculable", () => {
    const b = block({ kpis: [{ label: "ROAS", value: null, previous: null, format: "number" }] as ReportBlock["kpis"] });
    expect(blockUnits(b)).toBe(0);
  });

  it("does not count an empty table", () => {
    const b = block({ tables: [{ title: "Campaigns", columns: [], rows: [] }] as unknown as ReportBlock["tables"] });
    expect(blockUnits(b)).toBe(1);
  });
});

describe("assessComposition", () => {
  it("calls a one-thin-source report minimal", () => {
    const c = assessComposition({ gsc: gscThin, ga4: null, blocks: [] });
    expect(c.density).toBe("minimal");
    expect(c.flowSummary).toBe(true);
  });

  it("calls a single source with substantial data more than minimal", () => {
    // The case the old boolean got wrong: lots of Search Console data and no
    // other channel was treated as sparse.
    const c = assessComposition({ gsc: gscRich, ga4: null, blocks: [] });
    expect(c.density).not.toBe("minimal");
    expect(c.flowSummary).toBe(false);
  });

  it("calls several rich channels substantial", () => {
    const heavy = block({
      series: [{ label: "Spend", format: "currency", points: series(31) }] as ReportBlock["series"],
      tables: [{ title: "Campaigns", columns: [], rows: [{}] }] as unknown as ReportBlock["tables"],
    });
    const c = assessComposition({
      gsc: gscRich, ga4: null,
      blocks: [heavy, { ...heavy, sourceId: "tiktok_ads", sourceName: "TikTok Ads" }],
    });
    expect(c.density).toBe("substantial");
    expect(c.flowSummary).toBe(false);
  });

  it("orders channels by weight so the richest leads", () => {
    const thin = block({ sourceId: "instagram", sourceName: "Instagram" });
    const heavy = block({
      sourceId: "meta_ads", sourceName: "Meta Ads",
      series: [{ label: "Spend", format: "currency", points: series(31) }] as ReportBlock["series"],
      tables: [{ title: "Campaigns", columns: [], rows: [{}] }] as unknown as ReportBlock["tables"],
    });
    const c = assessComposition({ gsc: null, ga4: null, blocks: [thin, heavy] });
    expect(c.channels[0].sourceName).toBe("Meta Ads");
    expect(c.channels[0].standalone).toBe(true);
    expect(c.channels[1].standalone).toBe(false);
  });

  it("drops channels that contribute nothing renderable", () => {
    const empty = block({ sourceId: "x", sourceName: "X", kpis: [] as ReportBlock["kpis"] });
    const c = assessComposition({ gsc: null, ga4: null, blocks: [empty] });
    expect(c.channels).toEqual([]);
  });

  it("counts the interpretation layer as real content", () => {
    const without = assessComposition({ gsc: gscThin, ga4: null, blocks: [] });
    const with_ = assessComposition({ gsc: gscThin, ga4: null, blocks: [], insightUnits: 6 });
    expect(with_.units).toBeGreaterThan(without.units);
    expect(with_.density).not.toBe("minimal");
  });

  it("reports nothing for a report with no data at all", () => {
    const c = assessComposition({ gsc: null, ga4: null, blocks: [] });
    expect(c.units).toBe(0);
    expect(c.density).toBe("minimal");
  });

  it("counts GA4 revenue as an extra section only when there is revenue", () => {
    const base = { users: 1, newUsers: 1, sessions: 1, engagedSessions: 1, engagementRate: 1, avgEngagementTime: 1, views: 1, conversions: 1 };
    const withRev = { totals: { ...base, totalRevenue: 500 }, byDate: [], trafficSources: [], topLandingPages: [], devices: [], countries: [] } as unknown as Ga4ReportFull;
    const noRev = { totals: { ...base, totalRevenue: 0 }, byDate: [], trafficSources: [], topLandingPages: [], devices: [], countries: [] } as unknown as Ga4ReportFull;
    expect(assessComposition({ gsc: null, ga4: withRev, blocks: [] }).units)
      .toBeGreaterThan(assessComposition({ gsc: null, ga4: noRev, blocks: [] }).units);
  });
});
