import { describe, expect, it } from "vitest";
import { deriveGsc, deriveGa4, deriveBlock, covers, seriesCoverage, coverageWithin, distinctDaysWithin, MIN_PERIOD_COVERAGE } from "./derive";
import type { GscReportFull, Ga4ReportFull } from "@/lib/google";
import type { ReportBlock } from "@/lib/integrations/blocks";

const gscDay = (date: string, clicks: number, impressions: number, position: number) => ({
  date, clicks, impressions, ctr: impressions ? clicks / impressions : 0, position,
});

const gsc = (days: ReturnType<typeof gscDay>[]): GscReportFull =>
  ({
    totals: { clicks: 9999, impressions: 9999, ctr: 1, position: 1 },
    byDate: days,
    topQueries: [{ key: "shoes", clicks: 10, impressions: 100, ctr: 0.1, position: 3 }],
    topPages: [{ key: "/a", clicks: 5, impressions: 50, ctr: 0.1, position: 4 }],
    topCountries: [], topDevices: [],
    previousTotals: { clicks: 1, impressions: 1, ctr: 1, position: 1 },
    movers: { winners: [{ key: "x", changePct: 50 }], decliners: [], opportunities: [] },
  }) as unknown as GscReportFull;

describe("deriveGsc", () => {
  const data = gsc([
    gscDay("2026-08-01", 10, 100, 5),
    gscDay("2026-08-02", 20, 300, 10),
    gscDay("2026-08-03", 30, 200, 2),
  ]);

  it("sums only the days inside the window", () => {
    const { data: out } = deriveGsc(data, { start: "2026-08-01", end: "2026-08-02" });
    expect(out!.totals.clicks).toBe(30);
    expect(out!.totals.impressions).toBe(400);
    expect(out!.byDate).toHaveLength(2);
  });

  it("recomputes CTR from the summed components, not by averaging days", () => {
    const { data: out } = deriveGsc(data, { start: "2026-08-01", end: "2026-08-02" });
    // 30/400 = 7.5%. Averaging the daily CTRs (10% and 6.67%) would give 8.3%.
    expect(out!.totals.ctr).toBeCloseTo(0.075, 6);
  });

  it("weights average position by impressions", () => {
    const { data: out } = deriveGsc(data, { start: "2026-08-01", end: "2026-08-02" });
    // (5*100 + 10*300) / 400 = 8.75. An unweighted mean would give 7.5.
    expect(out!.totals.position).toBeCloseTo(8.75, 6);
  });

  it("drops period-scoped tables and movers instead of reusing them", () => {
    const { data: out, unavailable } = deriveGsc(data, { start: "2026-08-01", end: "2026-08-02" });
    expect(out!.topQueries).toEqual([]);
    expect(out!.topPages).toEqual([]);
    expect(out!.movers).toBeNull();
    expect(out!.previousTotals).toBeNull();
    expect(unavailable.map((u) => u.section)).toContain("Top queries and pages");
  });

  it("returns nothing when the window has no days at all", () => {
    expect(deriveGsc(data, { start: "2026-09-01", end: "2026-09-30" }).data).toBeNull();
  });
});

describe("deriveGa4", () => {
  const data = {
    totals: { users: 500, newUsers: 400, sessions: 9999, engagedSessions: 7, engagementRate: 0.9, avgEngagementTime: 60, views: 9999, conversions: 12, totalRevenue: 300 },
    byDate: [
      { date: "2026-08-01", users: 100, sessions: 120, views: 300 },
      { date: "2026-08-02", users: 110, sessions: 130, views: 320 },
    ],
    topLandingPages: [{ key: "/a", sessions: 5, users: 4 }],
    trafficSources: [{ key: "Organic Search", sessions: 5, users: 4 }],
    devices: [], countries: [],
    previousTotals: null,
  } as unknown as Ga4ReportFull;

  it("sums sessions and views", () => {
    const { data: out } = deriveGa4(data, { start: "2026-08-01", end: "2026-08-02" });
    expect(out!.totals.sessions).toBe(250);
    expect(out!.totals.views).toBe(620);
  });

  it("never sums daily unique users into a period figure", () => {
    const { data: out, unavailable } = deriveGa4(data, { start: "2026-08-01", end: "2026-08-02" });
    // 100 + 110 = 210 would double-count anyone who visited on both days.
    expect(out!.totals.users).not.toBe(210);
    expect(unavailable.map((u) => u.section)).toContain("Users and new users");
  });

  it("marks engagement, conversions and revenue as unavailable", () => {
    const { data: out, unavailable } = deriveGa4(data, { start: "2026-08-01", end: "2026-08-02" });
    // Carried over unchanged, these would describe the snapshot's window.
    expect(out!.totals.conversions).not.toBe(12);
    expect(out!.totals.totalRevenue).not.toBe(300);
    expect(unavailable.map((u) => u.section)).toContain("Engagement, conversions and revenue");
  });

  it("drops dimension breakdowns", () => {
    const { data: out } = deriveGa4(data, { start: "2026-08-01", end: "2026-08-02" });
    expect(out!.trafficSources).toEqual([]);
    expect(out!.topLandingPages).toEqual([]);
  });
});

describe("deriveBlock", () => {
  const block: ReportBlock = {
    sourceId: "meta_ads", sourceName: "Meta Ads", category: "paid", currency: "USD",
    kpis: [{ label: "ROAS", value: 4, previous: null, format: "number" }],
    series: [
      { label: "Spend", format: "currency", points: [
        { date: "2026-08-01", value: 100 }, { date: "2026-08-02", value: 150 }, { date: "2026-08-09", value: 999 },
      ] },
      { label: "Clicks", format: "number", points: [
        { date: "2026-08-01", value: 40 }, { date: "2026-08-02", value: 60 }, { date: "2026-08-09", value: 999 },
      ] },
      { label: "Impressions", format: "number", points: [
        { date: "2026-08-01", value: 1000 }, { date: "2026-08-02", value: 1000 }, { date: "2026-08-09", value: 999 },
      ] },
    ],
    tables: [{ title: "Top campaigns", columns: [], rows: [{}] }],
    notes: [],
  } as unknown as ReportBlock;

  const w = { start: "2026-08-01", end: "2026-08-02" };

  it("sums each series inside the window only", () => {
    const { data: out } = deriveBlock(block, w);
    const kpi = (l: string) => out!.kpis.find((k) => k.label === l)?.value;
    expect(kpi("Spend")).toBe(250);
    expect(kpi("Clicks")).toBe(100);
  });

  it("recomputes ratios from the summed components", () => {
    const { data: out } = deriveBlock(block, w);
    const kpi = (l: string) => out!.kpis.find((k) => k.label === l)?.value;
    expect(kpi("CPC")).toBeCloseTo(2.5, 6); // 250 / 100
    expect(kpi("CTR")).toBeCloseTo(0.05, 6); // 100 / 2000
  });

  it("drops KPIs whose components aren't in the daily series", () => {
    // ROAS needs revenue, which this block doesn't record daily.
    const { data: out } = deriveBlock(block, w);
    expect(out!.kpis.find((k) => k.label === "ROAS")).toBeUndefined();
  });

  it("drops per-period tables and says why", () => {
    const { data: out, unavailable } = deriveBlock(block, w);
    expect(out!.tables).toEqual([]);
    expect(unavailable[0].section).toMatch(/Meta Ads/);
  });

  it("returns a null ratio rather than zero when the denominator is empty", () => {
    const noClicks: ReportBlock = {
      ...block,
      series: [
        { label: "Spend", format: "currency", points: [{ date: "2026-08-01", value: 50 }] },
        { label: "Clicks", format: "number", points: [{ date: "2026-08-01", value: 0 }] },
      ],
    } as unknown as ReportBlock;
    const { data: out } = deriveBlock(noClicks, { start: "2026-08-01", end: "2026-08-01" });
    expect(out!.kpis.find((k) => k.label === "CPC")?.value).toBeNull();
  });
});

describe("coverage", () => {
  it("detects whether cached data spans the requested window", () => {
    const have = seriesCoverage(["2026-06-20", "2026-09-14"]);
    expect(covers(have, { start: "2026-08-01", end: "2026-08-31" })).toBe(true);
    // Before the cache starts — cannot be served.
    expect(covers(have, { start: "2026-05-01", end: "2026-05-31" })).toBe(false);
    expect(covers(null, { start: "2026-08-01", end: "2026-08-31" })).toBe(false);
  });

  it("counts how many days of the window are actually present", () => {
    const c = coverageWithin(["2026-08-01", "2026-08-02", "2026-09-01"], { start: "2026-08-01", end: "2026-08-31" });
    expect(c.covered).toBe(2);
    expect(c.requested).toBe(31);
    expect(c.range).toEqual({ start: "2026-08-01", end: "2026-08-02" });
  });

  // What gates report generation, so the row-vs-day distinction matters: the
  // input is every source's dates concatenated, and several sources reporting
  // the same date cover ONE day between them.
  describe("distinctDaysWithin", () => {
    const AUG = { start: "2026-08-01", end: "2026-08-31" };

    it("counts a date once however many sources reported it", () => {
      const threeSourcesSameTwoDays = [
        "2026-08-01", "2026-08-02",
        "2026-08-01", "2026-08-02",
        "2026-08-01", "2026-08-02",
      ];
      expect(distinctDaysWithin(threeSourcesSameTwoDays, AUG)).toBe(2);
      // The un-deduped count would be 6 — enough to make three sources holding
      // two days each look like a fifth of the month.
      expect(coverageWithin(threeSourcesSameTwoDays, AUG).covered).toBe(6);
    });

    it("ignores dates outside the window", () => {
      expect(distinctDaysWithin(["2026-07-31", "2026-08-05", "2026-09-01"], AUG)).toBe(1);
    });

    it("is zero for no dates at all", () => {
      expect(distinctDaysWithin([], AUG)).toBe(0);
    });
  });

  it("sets the materiality bar at half the requested period", () => {
    // Pinned because report generation refuses below it — a silent change here
    // would change which reports exist.
    expect(MIN_PERIOD_COVERAGE).toBe(0.5);
  });
});
