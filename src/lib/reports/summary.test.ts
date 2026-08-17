import { describe, expect, it } from "vitest";
import { buildExecutiveSummary } from "./summary";
import type { GscReportFull, Ga4ReportFull } from "@/lib/google";
import type { ReportBlock } from "@/lib/integrations/blocks";

const PERIOD = { start: "2026-07-01", end: "2026-07-31" };

const base = {
  clientName: "Acme Running Co.",
  period: PERIOD,
  gsc: null as GscReportFull | null,
  ga4: null as Ga4ReportFull | null,
  blocks: [] as ReportBlock[],
};

const gsc = (over: Partial<GscReportFull> = {}): GscReportFull =>
  ({
    totals: { clicks: 14841, impressions: 302371, ctr: 0.049, position: 9.8 },
    previousTotals: { clicks: 11968, impressions: 269974, ctr: 0.044, position: 11.4 },
    topQueries: [], topPages: [], topCountries: [], topDevices: [], byDate: [], movers: null,
    ...over,
  }) as unknown as GscReportFull;

const ga4 = (over: Record<string, unknown> = {}): Ga4ReportFull =>
  ({
    totals: {
      users: 22000, newUsers: 15000, sessions: 31000, engagedSessions: 21080,
      engagementRate: 0.68, avgEngagementTime: 96, views: 74000, conversions: 640, totalRevenue: 48000,
    },
    previousTotals: {
      users: 18900, newUsers: 13000, sessions: 27000, engagedSessions: 17280,
      engagementRate: 0.64, avgEngagementTime: 91, views: 65000, conversions: 520, totalRevenue: 40000,
    },
    byDate: [], topLandingPages: [], trafficSources: [], devices: [], countries: [],
    ...over,
  }) as unknown as Ga4ReportFull;

// Formats follow the labels the projection layer assigns, so a currency KPI
// renders with its symbol here exactly as it does in the report.
const CURRENCY_LABELS = new Set(["spend", "revenue", "cost per conversion", "cpc", "cpm"]);

const paid = (kpis: { label: string; value: number | null; previous?: number | null }[], over: Partial<ReportBlock> = {}): ReportBlock =>
  ({
    sourceId: "meta_ads", sourceName: "Meta Ads", category: "paid", currency: "USD",
    kpis: kpis.map((k) => ({
      previous: null,
      format: CURRENCY_LABELS.has(k.label.toLowerCase()) ? ("currency" as const) : ("number" as const),
      ...k,
    })),
    series: [], tables: [], notes: [],
    ...over,
  }) as unknown as ReportBlock;

describe("buildExecutiveSummary", () => {
  it("summarises a Google report with its comparison", () => {
    const { text, limited } = buildExecutiveSummary({ ...base, gsc: gsc(), ga4: ga4() });
    expect(limited).toBe(false);
    expect(text).toMatch(/organic search delivered 14,841 clicks/);
    expect(text).toMatch(/31,000 sessions from 22,000 users/);
    expect(text).toMatch(/largest measured movement/);
  });

  // The defect this module exists for: a paid-media report reached the summary
  // slot and was told a summary was impossible, while holding real figures.
  it("summarises a paid-media-only report, which used to get no summary at all", () => {
    const { text, limited } = buildExecutiveSummary({
      ...base,
      blocks: [paid([
        { label: "Spend", value: 4200, previous: 3780 },
        { label: "Clicks", value: 3100 },
        { label: "Conversions", value: 120 },
      ], { currency: "USD" })],
    });
    expect(limited).toBe(false);
    expect(text).toMatch(/Meta Ads recorded/);
    expect(text).toMatch(/\$4,200 spend/);
    expect(text).toMatch(/120 conversions/);
  });

  it("still produces a summary with no previous period to compare against", () => {
    const { text } = buildExecutiveSummary({
      ...base,
      gsc: gsc({ previousTotals: null }),
    });
    expect(text).toMatch(/organic search delivered 14,841 clicks/);
    expect(text).toMatch(/no previous-period baseline/);
    // And never implies a comparison it doesn't have.
    expect(text).not.toMatch(/vs\.? the previous period/);
  });

  it("names the largest contribution when there is no baseline", () => {
    const { text } = buildExecutiveSummary({
      ...base,
      ga4: ga4({
        previousTotals: null,
        trafficSources: [
          { key: "Organic Search", sessions: 15000, users: 11200 },
          { key: "Paid Search", sessions: 8000, users: 6900 },
        ],
      }),
    });
    expect(text).toMatch(/Organic Search was the largest source of traffic/);
    expect(text).toMatch(/65% of sessions/);
  });

  it("carries the highest-priority action as the thing to watch", () => {
    const { text } = buildExecutiveSummary({
      ...base,
      gsc: gsc(),
      watch: {
        action: "Confirm conversion tracking is firing for Meta Ads.",
        because: "Meta Ads recorded $228 of spend and no conversions in this period.",
      },
    });
    expect(text).toMatch(/Most worth attention: Meta Ads recorded \$228 of spend and no conversions/);
    expect(text).toMatch(/Confirm conversion tracking is firing/);
  });

  it("says a lower-is-better improvement is an improvement", () => {
    const { text } = buildExecutiveSummary({
      ...base,
      blocks: [paid([
        { label: "Spend", value: 4200, previous: 4180 },
        { label: "Cost per conversion", value: 35, previous: 42 },
      ], { kpis: [] })],
    });
    // Rebuilt with lowerBetter set, which the projection layer supplies.
    const withFlag = buildExecutiveSummary({
      ...base,
      blocks: [{
        ...paid([]),
        kpis: [
          { label: "Spend", value: 4200, previous: 4180, format: "currency" },
          { label: "Cost per conversion", value: 35, previous: 42, format: "currency", lowerBetter: true },
        ],
      } as unknown as ReportBlock],
    });
    expect(withFlag.text).toMatch(/cost per conversion/i);
    expect(withFlag.text).toMatch(/an improvement/);
    expect(text).toBeTruthy();
  });

  it("skips a KPI that is not calculable rather than reading it as zero", () => {
    const { text } = buildExecutiveSummary({
      ...base,
      blocks: [paid([
        { label: "Spend", value: 228 },
        { label: "CPC", value: null },
      ])],
    });
    expect(text).toMatch(/\$228 spend/);
    expect(text).not.toMatch(/cpc/i);
    // The em dash the formatter uses for "not calculable" never reaches prose.
    expect(text).not.toMatch(/— \w+ (?:cpc|per click)/i);
    expect(text).not.toMatch(/\s—\s(?:cpc|spend|conversions)\b/i);
  });

  it("says so plainly when there is genuinely nothing measured", () => {
    const { text, limited } = buildExecutiveSummary(base);
    expect(limited).toBe(true);
    expect(text).toMatch(/No performance data was recorded for Acme Running Co\./);
    expect(text).toMatch(/nothing to interpret/);
  });

  it("says so plainly when there are figures but nothing to read into them", () => {
    const { text, limited } = buildExecutiveSummary({
      ...base,
      blocks: [paid([{ label: "Impressions", value: 1295 }])],
    });
    expect(limited).toBe(true);
    expect(text).toMatch(/1,295 impressions/);
    expect(text).toMatch(/not yet enough measured activity/);
  });

  it("never returns an empty summary", () => {
    for (const input of [base, { ...base, gsc: gsc() }, { ...base, blocks: [paid([])] }]) {
      expect(buildExecutiveSummary(input).text.length).toBeGreaterThan(40);
    }
  });

  it("keeps the sentence readable when many channels are connected", () => {
    const blocks = ["meta_ads", "tiktok_ads", "google_ads", "linkedin_ads", "pinterest_ads"].map((id) =>
      paid([{ label: "Spend", value: 100 }], { sourceId: id, sourceName: id }),
    );
    const { text } = buildExecutiveSummary({ ...base, blocks });
    expect(text).toMatch(/2 further connected channels are detailed in the sections below/);
  });
});
