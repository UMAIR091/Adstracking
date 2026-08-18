import { describe, expect, it } from "vitest";
import { canonicalPeriod, periodDayCount, periodLabel, dataCoverage, normalizeReportData, isReportEmpty, REPORT_LAG_DAYS } from "./report";

// The canonical window is the contract between the period a user selects, the
// row stored in the database, the PDF and every UI surface. Before it existed,
// the stored period was derived from whichever dates happened to appear in the
// data, so "Last 28 days" could be filed as a two-day report.
describe("canonicalPeriod", () => {
  const AT = Date.parse("2026-08-16T12:00:00Z");

  it("spans exactly the number of days requested", () => {
    const p = canonicalPeriod(28, AT);
    expect(periodDayCount(p.start, p.end)).toBe(28);
  });

  it("spans 90 days for a 90-day selection", () => {
    const p = canonicalPeriod(90, AT);
    expect(periodDayCount(p.start, p.end)).toBe(90);
  });

  it("ends before today by the provider lag, not on today", () => {
    const p = canonicalPeriod(28, AT);
    // 16 Aug minus the 2-day settlement lag.
    expect(p.end).toBe("2026-08-14");
    expect(REPORT_LAG_DAYS).toBe(2);
  });

  it("is stable regardless of the time of day it is computed", () => {
    const morning = canonicalPeriod(28, Date.parse("2026-08-16T00:30:00Z"));
    const night = canonicalPeriod(28, Date.parse("2026-08-16T23:30:00Z"));
    expect(morning).toEqual(night);
  });
});

describe("periodLabel", () => {
  it("names a single month when the window sits inside one", () => {
    expect(periodLabel("2026-08-01", "2026-08-28")).toBe("Aug 2026");
  });

  it("spans months within a year", () => {
    expect(periodLabel("2026-07-18", "2026-08-14")).toBe("Jul–Aug 2026");
  });

  it("spans a year boundary", () => {
    expect(periodLabel("2025-12-20", "2026-01-16")).toBe("Dec 2025–Jan 2026");
  });

  it("returns null for unusable input rather than a broken label", () => {
    expect(periodLabel(null, "2026-01-16")).toBeNull();
    expect(periodLabel("not-a-date", "2026-01-16")).toBeNull();
  });
});

describe("dataCoverage", () => {
  const day = (date: string) => ({ date, clicks: 1, impressions: 1, ctr: 1, position: 1 });

  it("reports the extent of the data actually present", () => {
    const cov = dataCoverage({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      gsc: { byDate: [day("2026-08-03"), day("2026-08-01")] } as any,
      ga4: null,
      blocks: [],
    });
    expect(cov).toEqual({ start: "2026-08-01", end: "2026-08-03" });
  });

  it("is null when no source returned dated rows", () => {
    expect(dataCoverage({ gsc: null, ga4: null, blocks: [] })).toBeNull();
  });
});

describe("periodDayCount", () => {
  it("counts both endpoints", () => {
    expect(periodDayCount("2026-08-01", "2026-08-01")).toBe(1);
    expect(periodDayCount("2026-08-01", "2026-08-28")).toBe(28);
  });

  it("returns 0 for a reversed or unparseable range", () => {
    expect(periodDayCount("2026-08-28", "2026-08-01")).toBe(0);
    expect(periodDayCount("", "2026-08-01")).toBe(0);
  });
});

// Regenerating a report's insights rewrote reports.data from a four-field
// literal — { gsc, ga4, insights, insightsHash } — so `blocks` and `meta` were
// dropped on every regenerate. A Meta-Ads-only report came back empty, and any
// report lost the type, period label and coverage notes it was generated with.
// The route now spreads the normalized payload; this pins what that has to
// preserve.
describe("regenerating insights preserves the rest of the report", () => {
  const stored = {
    gsc: null,
    ga4: null,
    blocks: [
      {
        sourceId: "meta_ads", sourceName: "Meta Ads", category: "paid", currency: "USD",
        kpis: [{ label: "Spend", value: 4200, previous: 3780, format: "currency" }],
        series: [], tables: [], notes: [],
      },
    ],
    insights: { executiveSummary: "old" },
    insightsHash: "stale",
    meta: {
      periodDays: 31,
      requested: { start: "2026-07-01", end: "2026-07-31" },
      coverage: { start: "2026-07-01", end: "2026-07-31" },
      reportType: "paid",
      sourceIds: ["meta_ads"],
      periodLabel: "July 2026",
    },
  };

  it("carries blocks and meta through the update the route writes", () => {
    const data = normalizeReportData(stored);
    const insights = { executiveSummary: "new" } as never;
    const written = { ...data, insights, insightsHash: "fresh" };

    expect(written.blocks).toHaveLength(1);
    expect(written.blocks[0].sourceId).toBe("meta_ads");
    expect(written.meta?.reportType).toBe("paid");
    expect(written.meta?.periodLabel).toBe("July 2026");
    expect(written.meta?.coverage).toEqual(stored.meta.coverage);
    expect(written.insights).toEqual({ executiveSummary: "new" });
    expect(written.insightsHash).toBe("fresh");
  });

  it("would have emptied a channel-only report under the old write", () => {
    const data = normalizeReportData(stored);
    // The literal the route used to write.
    const old = { gsc: data.gsc, ga4: data.ga4, insights: data.insights, insightsHash: "fresh" };
    const reread = normalizeReportData(old);
    expect(reread.blocks).toHaveLength(0);
    expect(reread.meta).toBeUndefined();
    expect(isReportEmpty(reread)).toBe(true);
  });
});
