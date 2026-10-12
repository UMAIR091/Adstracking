import { describe, expect, it } from "vitest";
import {
  archiveRowsToSeries,
  comparisonWindows,
  dedupeByDate,
  deriveBlock,
  deriveGa4,
  deriveGsc,
  mergeByDate,
  mergeSeries,
  GA4_DAILY_UNAVAILABLE,
} from "./derive";
import type { GscReportFull, Ga4ReportFull } from "@/lib/google";
import type { ReportBlock } from "@/lib/integrations/blocks";

// Deterministic fixtures: every day carries the same figures, so any window's
// totals are simply its length, and a wrong window or a double-counted day is
// visible as a wrong number.
function days(from: string, to: string) {
  const out: string[] = [];
  for (let t = Date.parse(`${from}T00:00:00Z`); t <= Date.parse(`${to}T00:00:00Z`); t += 86_400_000) {
    out.push(new Date(t).toISOString().slice(0, 10));
  }
  return out;
}

const gsc = (from: string, to: string, perDay = { clicks: 1, impressions: 10, position: 5 }): GscReportFull => ({
  totals: { clicks: 0, impressions: 0, ctr: 0, position: 0 },
  topQueries: [], topPages: [], topCountries: [], topDevices: [],
  byDate: days(from, to).map((date) => ({ date, clicks: perDay.clicks, impressions: perDay.impressions, ctr: perDay.clicks / perDay.impressions, position: perDay.position })),
  previousTotals: null,
  movers: null,
});

const ga4 = (from: string, to: string): Ga4ReportFull => ({
  totals: { users: 999, newUsers: 999, sessions: 0, engagedSessions: 999, engagementRate: 0.9, avgEngagementTime: 99, views: 0, conversions: 999, totalRevenue: 999 },
  byDate: days(from, to).map((date) => ({ date, users: 3, sessions: 2, views: 4 })),
  topLandingPages: [], trafficSources: [], devices: [], countries: [],
  previousTotals: null,
});

const adsBlock = (from: string, to: string): ReportBlock => ({
  sourceId: "google_ads",
  sourceName: "Google Ads",
  category: "paid",
  currency: "USD",
  kpis: [],
  tables: [],
  notes: [],
  series: [
    { label: "Spend", format: "currency", points: days(from, to).map((date) => ({ date, value: 10 })) },
    { label: "Clicks", format: "number", points: days(from, to).map((date) => ({ date, value: 5 })) },
    { label: "Impressions", format: "number", points: days(from, to).map((date) => ({ date, value: 100 })) },
  ],
});

const SEPT = { start: "2026-09-01", end: "2026-09-30" };
const AUG = { start: "2026-08-01", end: "2026-08-31" };

describe("comparisonWindows", () => {
  it("allows a comparison when history spans both windows", () => {
    expect(comparisonWindows(days("2026-07-15", "2026-09-30"), SEPT, AUG)).toEqual({ current: SEPT, previous: AUG });
  });

  it("refuses when history starts after the previous window does", () => {
    // History from 10 Aug: the first nine days of August are unknown, not zero.
    expect(comparisonWindows(days("2026-08-10", "2026-09-30"), SEPT, AUG)).toBeNull();
  });

  it("cuts the previous window to the same length when the newest data lags", () => {
    // Data stops on 28 Sep — 28 days of September against 28 days of August.
    const w = comparisonWindows(days("2026-07-01", "2026-09-28"), SEPT, AUG);
    expect(w).toEqual({ current: { start: "2026-09-01", end: "2026-09-28" }, previous: { start: "2026-08-01", end: "2026-08-28" } });
  });

  it("refuses when the newest data trails the period end by more than the lag", () => {
    expect(comparisonWindows(days("2026-07-01", "2026-09-20"), SEPT, AUG)).toBeNull();
  });

  it("refuses with no history", () => {
    expect(comparisonWindows([], SEPT, AUG)).toBeNull();
  });
});

describe("previous-period figures for rebuilt windows", () => {
  it("Search Console gets previous totals from the same daily rows", () => {
    const full = gsc("2026-07-15", "2026-09-30");
    const { data } = deriveGsc(full, SEPT, comparisonWindows(days("2026-07-15", "2026-09-30"), SEPT, AUG));
    expect(data!.totals.clicks).toBe(30);
    expect(data!.previousTotals).toEqual({ clicks: 31, impressions: 310, ctr: 0.1, position: 5 });
    expect(data!.previousWindow).toEqual(AUG);
    expect(data!.window).toEqual(SEPT);
  });

  it("a lagging source is compared like for like, never a short month against a full one", () => {
    const full = gsc("2026-07-01", "2026-09-28");
    const cmp = comparisonWindows(days("2026-07-01", "2026-09-28"), SEPT, AUG);
    const { data } = deriveGsc(full, SEPT, cmp);
    expect(data!.totals.clicks).toBe(28);
    expect(data!.previousTotals!.clicks).toBe(28);
  });

  it("without an approved comparison there are no previous totals", () => {
    const { data } = deriveGsc(gsc("2026-09-01", "2026-09-30"), SEPT, null);
    expect(data!.previousTotals).toBeNull();
  });

  it("days with no Search Console row inside the history count as zero, not unknown", () => {
    // Search Console omits zero days: drop every other August day.
    const full = gsc("2026-07-15", "2026-09-30");
    full.byDate = full.byDate.filter((d) => !(d.date.startsWith("2026-08") && Number(d.date.slice(8)) % 2 === 0));
    const dates = full.byDate.map((d) => d.date);
    const { data } = deriveGsc(full, SEPT, comparisonWindows(dates, SEPT, AUG));
    expect(data!.previousTotals!.clicks).toBe(16); // the odd days of August
  });

  it("GA4 compares sessions and views only, and marks the rest unavailable", () => {
    const full = ga4("2026-07-15", "2026-09-30");
    const { data } = deriveGa4(full, SEPT, comparisonWindows(days("2026-07-15", "2026-09-30"), SEPT, AUG));
    expect(data!.totals.sessions).toBe(60);
    expect(data!.totals.views).toBe(120);
    expect(data!.previousTotals!.sessions).toBe(62);
    expect(data!.unavailableMetrics).toEqual(GA4_DAILY_UNAVAILABLE);
    // The snapshot's 999s belong to another window and must not leak through.
    expect(data!.totals.users).toBe(0);
    expect(data!.totals.conversions).toBe(0);
  });

  it("channel blocks get previous figures and recomputed ratios", () => {
    const block = adsBlock("2026-07-15", "2026-09-30");
    const { data } = deriveBlock(block, SEPT, comparisonWindows(days("2026-07-15", "2026-09-30"), SEPT, AUG));
    const kpi = (label: string) => data!.kpis.find((k) => k.label === label)!;
    expect(kpi("Spend")).toMatchObject({ value: 300, previous: 310 });
    expect(kpi("Clicks")).toMatchObject({ value: 150, previous: 155 });
    expect(kpi("CPC")).toMatchObject({ value: 2, previous: 2, lowerBetter: true });
    expect(kpi("CTR")).toMatchObject({ value: 0.05, previous: 0.05 });
  });
});

describe("duplicate days are counted once", () => {
  it("dedupeByDate keeps the last row for a date, sorted", () => {
    const rows = [
      { date: "2026-09-02", v: 1 },
      { date: "2026-09-01", v: 1 },
      { date: "2026-09-02", v: 7 },
    ];
    expect(dedupeByDate(rows)).toEqual([{ date: "2026-09-01", v: 1 }, { date: "2026-09-02", v: 7 }]);
  });

  it("a day present twice in a snapshot is not summed twice", () => {
    const full = gsc("2026-09-01", "2026-09-30");
    full.byDate.push({ ...full.byDate[0] });
    const { data } = deriveGsc(full, SEPT);
    expect(data!.totals.clicks).toBe(30);
  });

  it("a day in a block series twice is not summed twice", () => {
    const block = adsBlock("2026-09-01", "2026-09-30");
    block.series[0].points.push({ date: "2026-09-15", value: 10 });
    const { data } = deriveBlock(block, SEPT);
    expect(data!.kpis.find((k) => k.label === "Spend")!.value).toBe(300);
  });

  it("merging the archive under a snapshot counts an overlapping day once, the snapshot winning", () => {
    const archive = [{ date: "2026-09-01", clicks: 5 }, { date: "2026-08-31", clicks: 2 }];
    const snapshot = [{ date: "2026-09-01", clicks: 6 }];
    expect(mergeByDate(archive, snapshot)).toEqual([{ date: "2026-08-31", clicks: 2 }, { date: "2026-09-01", clicks: 6 }]);
  });

  it("mergeSeries merges by label, overlay winning per date", () => {
    const merged = mergeSeries(
      [{ label: "Spend", format: "currency", points: [{ date: "2026-09-01", value: 1 }, { date: "2026-09-02", value: 2 }] }],
      [{ label: "spend", format: "currency", points: [{ date: "2026-09-02", value: 9 }] }]
    );
    expect(merged).toHaveLength(1);
    expect(merged[0].points).toEqual([{ date: "2026-09-01", value: 1 }, { date: "2026-09-02", value: 9 }]);
  });
});

describe("archive rows are read per data source", () => {
  it("archiveRowsToSeries builds one source's series without another's days", () => {
    const rows = [
      { date: "2026-09-01", provider: "google_ads", data_source_id: "a", metrics: { spend: 10, clicks: 1 } },
      { date: "2026-09-01", provider: "google_ads", data_source_id: "b", metrics: { spend: 99, clicks: 9 } },
    ];
    const series = archiveRowsToSeries(rows.filter((r) => r.data_source_id === "a"));
    expect(series.find((sr) => sr.label === "Spend")!.points).toEqual([{ date: "2026-09-01", value: 10 }]);
  });
});
