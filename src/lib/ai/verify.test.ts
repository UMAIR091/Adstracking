import { describe, expect, it } from "vitest";
import { numbersIn, unsupportedNumbers, verifyInsights } from "./verify";
import { buildPrompt } from "./prompt";
import type { InsightsInput } from "./types";

// The prompt these tests check against is built by the real prompt builder,
// so they also pin that every figure the model is told it may cite is
// actually printed in what it receives.
const INPUT: InsightsInput = {
  clientName: "Acme",
  periodLabel: "September 2026 — 2026-09-01 to 2026-09-30 (30 days)",
  gsc: {
    totals: { clicks: 4980, impressions: 120_400, ctr: 0.04136, position: 8.4 },
    previousTotals: { clicks: 4210, impressions: 98_000, ctr: 0.04296, position: 9.1 },
    topQueries: [{ key: "running shoes", clicks: 820, impressions: 9100, ctr: 0.0901, position: 3.2 }],
    topPages: [],
  },
  ga4: null,
  blocks: [
    {
      sourceId: "google_ads", sourceName: "Google Ads", category: "paid", currency: "GBP",
      kpis: [
        { label: "Spend", value: 4980, previous: 4210, format: "currency" },
        { label: "Cost per conversion", value: 41.5, previous: 45.6, format: "currency", lowerBetter: true },
      ],
      series: [], tables: [], notes: [],
    },
  ],
};
const PROMPT = buildPrompt(INPUT);
const allowed = numbersIn(PROMPT).map((t) => t.value);

describe("numbersIn", () => {
  it("reads currency, thousands separators, decimals, percentages and k/m suffixes", () => {
    expect(numbersIn("£4,210 then 18.2% and 4.2k and 1.5 million").map((t) => t.value)).toEqual([4210, 18.2, 4200, 1_500_000]);
  });

  it("ignores dates, quarters and years", () => {
    expect(numbersIn("From 2026-09-01 to 30 Sep 2026, versus Q2 2026 and in 2025.")).toEqual([]);
  });
});

describe("unsupportedNumbers", () => {
  it("accepts figures printed in the prompt, and natural roundings of them", () => {
    expect(unsupportedNumbers("Clicks rose 18% (4,210 → 4,980).", allowed)).toEqual([]);
    expect(unsupportedNumbers("Spend rose to £4,980, up £770.", allowed)).toEqual([]);
    expect(unsupportedNumbers("Impressions reached about 120k.", allowed)).toEqual([]);
    expect(unsupportedNumbers("Average position improved to 8.4.", allowed)).toEqual([]);
    expect(unsupportedNumbers("Nearly 5,000 clicks.", allowed)).toEqual([]);
  });

  it("rejects a figure that is not in the data", () => {
    expect(unsupportedNumbers("Clicks rose 25%.", allowed)).toEqual(["25%"]);
    // (3.7% WOULD pass: it is the printed CTR change. 6.3% is in nothing.)
    expect(unsupportedNumbers("Conversion rate reached 6.3%.", allowed)).toEqual(["6.3%"]);
  });

  it("does not let coarse rounding pass a different figure", () => {
    // 4,600 is not a two-significant-figure rounding of 4,980 or 4,210.
    expect(unsupportedNumbers("About 4,600 clicks.", allowed)).toEqual(["4,600"]);
    // 100% is not a rounding of any percentage here.
    expect(unsupportedNumbers("CTR improved 100%.", allowed)).toEqual(["100%"]);
  });

  it("allows small counts that name how many of something", () => {
    expect(unsupportedNumbers("Two of the top 3 queries sit on page 1.", allowed)).toEqual([]);
  });
});

describe("verifyInsights", () => {
  it("keeps supported sentences and removes unsupported ones, recording what it removed", () => {
    const out = verifyInsights(
      {
        executiveSummary: "Organic clicks rose 18% to 4,980 while spend held at £4,980.",
        keyWins: ["Clicks rose 18% (4,210 → 4,980).", "Revenue grew 40%."],
        issuesDetected: [],
        growthOpportunities: ['"running shoes" ranks at position 3.2 with 9,100 impressions.'],
        recommendedActions: ["Shift 15% of budget to search."],
      },
      PROMPT
    );
    expect(out.executiveSummary).toBe("Organic clicks rose 18% to 4,980 while spend held at £4,980.");
    expect(out.keyWins).toEqual(["Clicks rose 18% (4,210 → 4,980)."]);
    expect(out.growthOpportunities).toHaveLength(1);
    expect(out.recommendedActions).toEqual([]);
    expect(out.verification).toEqual({ removedClaims: 2, summaryRemoved: false, unsupported: ["40%", "15%"] });
  });

  it("drops an unsupported summary so the report falls back to its computed one", () => {
    const out = verifyInsights(
      { executiveSummary: "Traffic doubled to 10,000 visits.", keyWins: [], issuesDetected: [], growthOpportunities: [], recommendedActions: [] },
      PROMPT
    );
    expect(out.executiveSummary).toBe("");
    expect(out.verification!.summaryRemoved).toBe(true);
  });

  it("removes outright causal claims the data cannot support", () => {
    const out = verifyInsights(
      { executiveSummary: "Clicks rose 18%.", keyWins: ["The new campaign caused clicks to rise 18%."], issuesDetected: [], growthOpportunities: [], recommendedActions: [] },
      PROMPT
    );
    expect(out.keyWins).toEqual([]);
    expect(out.verification!.unsupported).toContain("(causal claim)");
  });
});
