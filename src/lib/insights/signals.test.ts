import { describe, it, expect } from "vitest";
import { detectSignals, withContext, type Signal } from "./signals";
import type { GscReportFull, Ga4ReportFull } from "@/lib/google";

const day = (date: string, clicks: number) => ({ date, clicks, impressions: clicks * 20, ctr: 0.05, position: 12 });

// A flat 28-day series: every day identical, so any spike we add is the only
// thing that can register as an anomaly.
const flatSeries = (clicks = 100, days = 28) =>
  Array.from({ length: days }, (_, i) => day(`2026-07-${String(i + 1).padStart(2, "0")}`, clicks));

const gsc = (over: Partial<GscReportFull> = {}): GscReportFull =>
  ({
    totals: { clicks: 2800, impressions: 56000, ctr: 0.05, position: 12 },
    topQueries: [], topPages: [], topCountries: [], topDevices: [],
    byDate: flatSeries(),
    previousTotals: null,
    movers: null,
    ...over,
  }) as GscReportFull;

const kinds = (s: Signal[]) => s.map((x) => x.kind);

describe("never invents data", () => {
  it("returns nothing when both sources are absent", () => {
    expect(detectSignals(null, null)).toEqual([]);
    expect(detectSignals(undefined, undefined)).toEqual([]);
  });

  it("emits no keyword signals when movers are missing", () => {
    const out = detectSignals(gsc({ movers: null }), null);
    expect(kinds(out)).not.toContain("winning_keyword");
    expect(kinds(out)).not.toContain("declining_keyword");
    expect(kinds(out)).not.toContain("opportunity");
  });

  it("emits no winning-page signal when there are no pages", () => {
    expect(kinds(detectSignals(gsc({ topPages: [] }), null))).not.toContain("winning_page");
  });

  it("quotes only figures present in the input", () => {
    const out = detectSignals(
      gsc({ movers: { winners: [{ key: "blue widgets", clicks: 900, prevClicks: 600, changePct: 50, position: 4.2 }], decliners: [], opportunities: [] } }),
      null
    );
    const w = out.find((s) => s.kind === "winning_keyword")!;
    expect(w.detail).toContain("600");
    expect(w.detail).toContain("900");
    expect(w.detail).toContain("4.2");
    expect(w.metric).toBe("+50%");
  });
});

describe("anomaly detection is statistical, not editorial", () => {
  it("finds a genuine spike against the site's own variance", () => {
    const series = flatSeries(100);
    series[20] = day("2026-07-21", 900); // far outside normal
    const out = detectSignals(gsc({ byDate: series }), null);
    const spike = out.find((s) => s.kind === "traffic_spike");
    expect(spike).toBeDefined();
    expect(spike!.detail).toContain("900");
    expect(spike!.detail).toMatch(/standard deviations/);
  });

  it("reports a dip as a drop, not a spike", () => {
    const series = flatSeries(100);
    series[10] = day("2026-07-11", 2);
    expect(kinds(detectSignals(gsc({ byDate: series }), null))).toContain("traffic_drop");
  });

  it("stays silent on a flat series — no anomaly to find", () => {
    expect(kinds(detectSignals(gsc({ byDate: flatSeries(100) }), null))).not.toContain("traffic_spike");
  });

  it("refuses to call an anomaly on fewer than 14 days", () => {
    // Same dramatic outlier, too little history to know it's unusual.
    const short = flatSeries(100, 10);
    short[5] = day("2026-07-06", 900);
    const out = detectSignals(gsc({ byDate: short }), null);
    expect(kinds(out)).not.toContain("traffic_spike");
    expect(kinds(out)).not.toContain("traffic_drop");
  });
});

describe("confidence is earned, not asserted", () => {
  const winner = (clicks: number, prevClicks: number, changePct: number) =>
    detectSignals(
      gsc({ movers: { winners: [{ key: "q", clicks, prevClicks, changePct, position: 5 }], decliners: [], opportunities: [] } }),
      null
    ).find((s) => s.kind === "winning_keyword")!;

  it("rates a large sample with a real move as high confidence", () => {
    expect(winner(900, 600, 50).confidence).toBe("high");
  });

  it("rates a tiny sample as low confidence however dramatic the swing", () => {
    // 4 clicks from 1 is +300%, and means nothing.
    const s = winner(4, 1, 300);
    expect(s.confidence).toBe("low");
    expect(s.confidenceReason).toMatch(/too small/i);
  });

  it("always explains its reasoning", () => {
    for (const s of detectSignals(
      gsc({
        topPages: [{ key: "/pricing", clicks: 800, impressions: 9000, ctr: 0.08, position: 3 }],
        movers: { winners: [{ key: "a", clicks: 700, prevClicks: 400, changePct: 75, position: 3 }], decliners: [], opportunities: [] },
      }),
      null
    )) {
      expect(s.confidenceReason.length).toBeGreaterThan(10);
      expect(["high", "medium", "low"]).toContain(s.confidence);
    }
  });

  it("grades a 3-sigma spike higher than a 2-sigma one", () => {
    const mk = (peak: number) => {
      const s = flatSeries(100);
      s[7] = day("2026-07-08", peak);
      return detectSignals(gsc({ byDate: s }), null).find((x) => x.kind === "traffic_spike");
    };
    expect(mk(2000)?.confidence).toBe("high");
  });
});

describe("GA4 conversion signal", () => {
  const ga4 = (sessions: number, conversions: number): Ga4ReportFull =>
    ({ totals: { users: 0, newUsers: 0, sessions, engagedSessions: 0, engagementRate: 0, avgEngagementTime: 0, views: 0, conversions, totalRevenue: 0 }, previousTotals: null, byDate: [] }) as unknown as Ga4ReportFull;

  it("reports a real conversion rate", () => {
    const s = detectSignals(null, ga4(1000, 50)).find((x) => x.kind === "conversion_opportunity")!;
    expect(s.metric).toBe("5.0%");
    expect(s.detail).toContain("1,000");
  });

  it("flags zero conversions as possibly a tracking gap, not a failure", () => {
    const s = detectSignals(null, ga4(1000, 0)).find((x) => x.kind === "conversion_opportunity")!;
    expect(s.detail).toMatch(/aren't configured|no recorded conversions/i);
  });

  it("says nothing when there are no sessions at all", () => {
    expect(detectSignals(null, ga4(0, 0))).toEqual([]);
  });
});

describe("ranking and presentation", () => {
  it("respects the requested limit", () => {
    const rich = gsc({
      topPages: [{ key: "/a", clicks: 900, impressions: 9000, ctr: 0.1, position: 2 }],
      movers: {
        winners: [
          { key: "w1", clicks: 800, prevClicks: 400, changePct: 100, position: 3 },
          { key: "w2", clicks: 700, prevClicks: 350, changePct: 100, position: 4 },
        ],
        decliners: [
          { key: "d1", clicks: 100, prevClicks: 800, changePct: -87, position: 9 },
          { key: "d2", clicks: 90, prevClicks: 700, changePct: -87, position: 11 },
        ],
        opportunities: [{ key: "o1", clicks: 20, impressions: 8000, position: 11.5 }],
      },
    });
    expect(detectSignals(rich, null, 3)).toHaveLength(3);
    expect(detectSignals(rich, null, 6).length).toBeLessThanOrEqual(6);
  });

  it("tags signals with their client for workspace-wide views", () => {
    const out = withContext(detectSignals(gsc({ topPages: [{ key: "/x", clicks: 500, impressions: 5000, ctr: 0.1, position: 3 }] }), null), "Acme Ltd");
    expect(out.length).toBeGreaterThan(0);
    for (const s of out) expect(s.context).toBe("Acme Ltd");
  });
});
