import { describe, expect, it } from "vitest";
import { buildVerdict, periodHeadlineLabel } from "./verdict";
import type { GscReportFull, Ga4ReportFull } from "@/lib/google";
import type { ReportBlock, BlockKpi, BlockFormat } from "@/lib/integrations/blocks";

const kpi = (
  label: string,
  value: number | null,
  previous: number | null = null,
  format: BlockFormat = "number",
): BlockKpi => ({ label, value, previous, format });

const block = (over: Partial<ReportBlock> = {}): ReportBlock => ({
  sourceId: "meta_ads",
  sourceName: "Meta Ads",
  category: "paid",
  currency: "USD",
  kpis: [],
  series: [],
  tables: [],
  notes: [],
  ...over,
});

const ga4 = (totals: Record<string, number>, previous?: Record<string, number>): Ga4ReportFull =>
  ({
    totals: { users: 0, sessions: 0, conversions: 0, totalRevenue: 0, ...totals },
    previousTotals: previous ? { users: 0, sessions: 0, conversions: 0, totalRevenue: 0, ...previous } : undefined,
    byDate: [], topLandingPages: [], trafficSources: [], devices: [], countries: [],
  }) as unknown as Ga4ReportFull;

const gsc = (clicks: number, prevClicks?: number): GscReportFull =>
  ({
    totals: { clicks, impressions: clicks * 20, ctr: 0.05, position: 9 },
    previousTotals: prevClicks == null ? undefined : { clicks: prevClicks, impressions: prevClicks * 20, ctr: 0.05, position: 9 },
    topQueries: [], topPages: [], topCountries: [], topDevices: [], byDate: [], movers: null,
  }) as unknown as GscReportFull;

// A clean calendar month, so the headline noun resolves to "September".
const base = {
  period: { start: "2026-09-01", end: "2026-09-30" },
  gsc: null, ga4: null, blocks: [] as ReportBlock[],
};

describe("buildVerdict", () => {
  it("leads with money in and money out, expressed per single unit of currency", () => {
    const v = buildVerdict({
      ...base,
      blocks: [
        block({
          kpis: [kpi("Spend", 4200, 4000, "currency"), kpi("Revenue", 18400, 15200, "currency")],
        }),
      ],
    })!;

    expect(v.lines[0]).toContain("4,200");
    expect(v.lines[0]).toContain("18,400");
    // The point of the whole exercise: a sentence, not a ratio to decode.
    expect(v.lines[0]).toMatch(/back for every/);
    expect(v.lines[0]).not.toMatch(/roas/i);
    expect(v.lines[0]).not.toMatch(/\dx/);
  });

  it("compares return per unit spent, not raw revenue", () => {
    // Revenue doubled, but so did spend — the money did not work harder, and
    // a report that called this a win would be misleading.
    const v = buildVerdict({
      ...base,
      blocks: [
        block({ kpis: [kpi("Spend", 8000, 4000, "currency"), kpi("Revenue", 16000, 8000, "currency")] }),
      ],
    })!;

    expect(v.comparison).toBeNull();
    expect(v.tone).toBe("mixed");
    expect(v.headline).toMatch(/held steady/);
  });

  it("calls a period good only when efficiency actually improved", () => {
    const v = buildVerdict({
      ...base,
      blocks: [
        block({ kpis: [kpi("Spend", 4000, 4000, "currency"), kpi("Revenue", 20000, 12000, "currency")] }),
      ],
    })!;

    expect(v.tone).toBe("good");
    expect(v.headline).toBe("September went well.");
    expect(v.comparisonGood).toBe(true);
    expect(v.comparison).toMatch(/^Up from/);
  });

  it("flags a decline rather than dressing it up", () => {
    const v = buildVerdict({
      ...base,
      blocks: [
        block({ kpis: [kpi("Spend", 6000, 4000, "currency"), kpi("Revenue", 9000, 12000, "currency")] }),
      ],
    })!;

    expect(v.tone).toBe("attention");
    expect(v.headline).toBe("September needs attention.");
    expect(v.comparisonGood).toBe(false);
    expect(v.comparison).toMatch(/^Down from/);
  });

  it("states no verdict when there is no baseline to judge against", () => {
    const v = buildVerdict({
      ...base,
      blocks: [block({ kpis: [kpi("Spend", 4200, null, "currency"), kpi("Revenue", 18400, null, "currency")] })],
    })!;

    expect(v.tone).toBe("neutral");
    expect(v.headline).toBe("September at a glance.");
    expect(v.comparison).toBeNull();
    // The figures are still reported — simple never means less data.
    expect(v.lines[0]).toContain("18,400");
  });

  it("falls back to outcomes when no revenue is tracked, and prices them", () => {
    const v = buildVerdict({
      ...base,
      blocks: [block({ kpis: [kpi("Spend", 3200, null, "currency"), kpi("Leads", 200, 160)] })],
    })!;

    expect(v.lines[0]).toMatch(/200 results/);
    expect(v.lines[1]).toMatch(/each/);
    expect(v.comparison).toMatch(/40 more/);
    expect(v.comparisonGood).toBe(true);
  });

  it("falls back to visitors when nothing else is measured", () => {
    const v = buildVerdict({ ...base, ga4: ga4({ sessions: 31000 }, { sessions: 27000 }) })!;

    expect(v.lines[0]).toMatch(/31,000 people visited your website/);
    expect(v.comparison).toMatch(/Up 15%/);
  });

  it("uses search clicks when there is no analytics at all", () => {
    const v = buildVerdict({ ...base, gsc: gsc(14841, 11968) })!;
    expect(v.lines[0]).toMatch(/found you through Google search/);
  });

  it("returns null rather than inventing a headline over an empty report", () => {
    expect(buildVerdict({ ...base, blocks: [block({ kpis: [kpi("Spend", null, null, "currency")] })] })).toBeNull();
  });

  it("treats a null KPI as not calculable, never as zero", () => {
    // Revenue is null (no denominator), so the money rung must not fire and
    // claim the business earned nothing.
    const v = buildVerdict({
      ...base,
      blocks: [block({ kpis: [kpi("Spend", 4200, null, "currency"), kpi("Revenue", null, null, "currency")] })],
      ga4: ga4({ sessions: 900 }),
    })!;

    expect(v.lines[0]).not.toMatch(/brought in/);
    expect(v.lines[0]).toMatch(/900 people visited/);
  });

  it("refuses to add up totals across mixed currencies", () => {
    const v = buildVerdict({
      ...base,
      blocks: [
        block({ currency: "USD", kpis: [kpi("Spend", 4000, null, "currency"), kpi("Revenue", 16000, null, "currency")] }),
        block({ sourceId: "tiktok_ads", sourceName: "TikTok Ads", currency: "EUR", kpis: [kpi("Spend", 3000, null, "currency")] }),
      ],
    })!;

    expect(v.lines.some((l) => /different currency/.test(l))).toBe(true);
  });

  it("does not double count analytics revenue against platform revenue", () => {
    const v = buildVerdict({
      ...base,
      blocks: [block({ kpis: [kpi("Spend", 1000, null, "currency"), kpi("Revenue", 5000, null, "currency")] })],
      ga4: ga4({ totalRevenue: 5000 }),
    })!;

    expect(v.lines[0]).toContain("5,000");
    expect(v.lines[0]).not.toContain("10,000");
  });

  it("carries through the one action, and omits it when there isn't one", () => {
    const withAction = buildVerdict({
      ...base,
      blocks: [block({ kpis: [kpi("Spend", 4000, null, "currency"), kpi("Revenue", 16000, null, "currency")] })],
      watch: { action: "Shift budget to the Retargeting campaign", because: "it converts at half the cost" },
    })!;
    expect(withAction.action).toBe("Shift budget to the Retargeting campaign");

    const without = buildVerdict({
      ...base,
      blocks: [block({ kpis: [kpi("Spend", 4000, null, "currency"), kpi("Revenue", 16000, null, "currency")] })],
    })!;
    expect(without.action).toBeNull();
  });
});

describe("periodHeadlineLabel", () => {
  it("names a clean calendar month", () => {
    expect(periodHeadlineLabel("2026-09-01", "2026-09-30")).toBe("September");
    expect(periodHeadlineLabel("2026-02-01", "2026-02-28")).toBe("February");
  });

  it("handles a leap February", () => {
    expect(periodHeadlineLabel("2028-02-01", "2028-02-29")).toBe("February");
  });

  it("refuses to round a rolling window to the nearest month", () => {
    // Calling 12 Aug – 9 Sep "September" would be a small lie, so it doesn't.
    expect(periodHeadlineLabel("2026-08-12", "2026-09-09")).toBe("This period");
    expect(periodHeadlineLabel("2026-09-01", "2026-09-28")).toBe("This period");
    expect(periodHeadlineLabel("2026-09-02", "2026-09-30")).toBe("This period");
  });

  it("falls back on unparseable or missing input", () => {
    expect(periodHeadlineLabel(null, null)).toBe("This period");
    expect(periodHeadlineLabel("last-28-days", "")).toBe("This period");
  });
});
