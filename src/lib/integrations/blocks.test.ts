import { describe, it, expect } from "vitest";
import { snapshotToBlock, snapshotsToBlocks, formatBlockValue, blocksToPromptText, aggregatePaidSnapshots } from "./blocks";

// The projection layer is what carries every integration into the PDF, the AI
// prompt and the client report. Its contract is shape-based, so these tests
// assert on SHAPES rather than on provider ids — a new provider returning a
// known shape must work with no change here.

const adsSnapshot = {
  platform: "tiktok_ads",
  currency: "GBP",
  totals: { spend: 1000, impressions: 50000, clicks: 500, ctr: 0.01, cpc: 2, cpm: 20, conversions: 25, costPerConversion: 40, revenue: 3000, roas: 3 },
  previousTotals: { spend: 800, impressions: 40000, clicks: 400, ctr: 0.01, cpc: 2, cpm: 20, conversions: 20, costPerConversion: 40, revenue: 2000, roas: 2.5 },
  byDate: [
    { date: "2026-08-01", spend: 500, impressions: 25000, clicks: 250, conversions: 12 },
    { date: "2026-08-02", spend: 500, impressions: 25000, clicks: 250, conversions: 13 },
  ],
  topCampaigns: [{ name: "Summer", spend: 600, impressions: 30000, clicks: 300, ctr: 0.01, conversions: 15 }],
  topAdGroups: [{ name: "Broad", spend: 400, impressions: 20000, clicks: 200, ctr: 0.01, conversions: 10 }],
  topAds: [{ name: "Video A", spend: 250, impressions: 12000, clicks: 120, ctr: 0.01, conversions: 6 }],
};

describe("snapshotToBlock — shape detection", () => {
  it("projects an ads snapshot with its own currency, not a hardcoded one", () => {
    const block = snapshotToBlock("tiktok_ads", adsSnapshot);
    expect(block).not.toBeNull();
    expect(block!.category).toBe("paid");
    expect(block!.currency).toBe("GBP");
    expect(block!.sourceName).toBe("TikTok Ads");
  });

  it("exposes ROAS and CPM as KPIs", () => {
    const labels = snapshotToBlock("tiktok_ads", adsSnapshot)!.kpis.map((k) => k.label);
    expect(labels).toContain("ROAS");
    expect(labels).toContain("CPM");
    expect(labels).toContain("Revenue");
  });

  it("marks cost metrics as lower-is-better so deltas render correctly", () => {
    const cpa = snapshotToBlock("tiktok_ads", adsSnapshot)!.kpis.find((k) => k.label === "Cost per conversion");
    expect(cpa?.lowerBetter).toBe(true);
  });

  it("projects campaign, ad group and ad breakdowns into tables", () => {
    const titles = snapshotToBlock("tiktok_ads", adsSnapshot)!.tables.map((t) => t.title);
    expect(titles).toEqual(["Top campaigns", "Top ad groups", "Top ads"]);
  });

  it("drops KPIs that are zero with no prior value", () => {
    const bare = { ...adsSnapshot, totals: { ...adsSnapshot.totals, revenue: 0, roas: 0 }, previousTotals: null };
    const labels = snapshotToBlock("meta_ads", bare)!.kpis.map((k) => k.label);
    expect(labels).not.toContain("ROAS");
    expect(labels).toContain("Spend");
  });

  it("detects commerce, crm and email shapes without provider hints", () => {
    expect(snapshotToBlock("shopify", { currency: "USD", totals: { orders: 10, revenue: 500, avgOrderValue: 50, customers: 8 } })!.category).toBe("commerce");
    expect(snapshotToBlock("hubspot", { totals: { newContacts: 5, newDeals: 2, wonDeals: 1, wonRevenue: 100 } })!.category).toBe("crm");
    expect(snapshotToBlock("mailchimp", { totals: { subscribers: 100, openRate: 0.4, clickRate: 0.1 } })!.category).toBe("email");
  });

  it("never assumes USD when the platform did not report a currency", () => {
    const noCurrency = { ...adsSnapshot, currency: "" };
    expect(snapshotToBlock("meta_ads", noCurrency)!.currency).toBeNull();
    const missingField = { totals: adsSnapshot.totals, previousTotals: null, byDate: [], topCampaigns: [] };
    expect(snapshotToBlock("meta_ads", missingField)!.currency).toBeNull();
  });

  it("returns null for an unrecognized shape rather than rendering something wrong", () => {
    expect(snapshotToBlock("mystery", { totals: { somethingElse: 1 } })).toBeNull();
    expect(snapshotToBlock("mystery", null)).toBeNull();
    expect(snapshotToBlock(null, adsSnapshot)).toBeNull();
  });
});

describe("snapshotsToBlocks", () => {
  it("orders paid media before commerce and drops empty snapshots", () => {
    const blocks = snapshotsToBlocks([
      { type: "shopify", snapshot: { currency: "USD", totals: { orders: 10, revenue: 500, avgOrderValue: 50, customers: 8 } } },
      { type: "tiktok_ads", snapshot: adsSnapshot },
      { type: "broken", snapshot: undefined },
    ]);
    expect(blocks.map((b) => b.sourceId)).toEqual(["tiktok_ads", "shopify"]);
  });
});

describe("aggregatePaidSnapshots", () => {
  const paid = (currency: string, spend: number, impressions: number, clicks: number, conversions: number, revenue = 0) => ({
    currency,
    totals: { spend, impressions, clicks, conversions, revenue, ctr: 0, cpc: 0, cpm: 0, costPerConversion: 0, roas: 0 },
    previousTotals: null, byDate: [], topCampaigns: [],
  });

  it("returns null for fewer than two paid sources", () => {
    expect(aggregatePaidSnapshots([{ type: "tiktok_ads", snapshot: adsSnapshot }])).toBeNull();
    expect(aggregatePaidSnapshots([])).toBeNull();
  });

  it("never merges non-paid sources — GA4 sessions and Search Console clicks stay out", () => {
    const result = aggregatePaidSnapshots([
      { type: "tiktok_ads", snapshot: paid("USD", 100, 1000, 100, 10) },
      { type: "meta_ads", snapshot: paid("USD", 100, 1000, 100, 10) },
      // Neither of these is category "paid", so neither may contribute.
      { type: "ga4", snapshot: { totals: { sessions: 9999, users: 9999 } } },
      { type: "shopify", snapshot: { currency: "USD", totals: { orders: 50, revenue: 5000, avgOrderValue: 100, customers: 40 } } },
    ]);
    expect(result).not.toBeNull();
    expect(result!.sourceNames).toEqual(["TikTok Ads", "Meta Ads"]);
    expect(result!.clicks).toBe(200); // 100 + 100, not polluted by sessions or orders
    expect(result!.spend).toBe(200);
  });

  it("sums additive metrics across ad platforms", () => {
    const r = aggregatePaidSnapshots([
      { type: "tiktok_ads", snapshot: paid("USD", 100, 4000, 200, 10, 500) },
      { type: "meta_ads", snapshot: paid("USD", 300, 6000, 300, 20, 1500) },
    ])!;
    expect(r.spend).toBe(400);
    expect(r.impressions).toBe(10000);
    expect(r.clicks).toBe(500);
    expect(r.conversions).toBe(30);
    expect(r.revenue).toBe(2000);
  });

  it("recomputes ratios from the summed components rather than averaging them", () => {
    const r = aggregatePaidSnapshots([
      { type: "tiktok_ads", snapshot: paid("USD", 100, 4000, 200, 10, 500) },
      { type: "meta_ads", snapshot: paid("USD", 300, 6000, 300, 20, 1500) },
    ])!;
    expect(r.ctr).toBeCloseTo(500 / 10000);        // not (0.05 + 0.05) / 2
    expect(r.cpc).toBeCloseTo(400 / 500);
    expect(r.cpm).toBeCloseTo((400 / 10000) * 1000);
    expect(r.costPerConversion).toBeCloseTo(400 / 30);
    expect(r.roas).toBeCloseTo(2000 / 400);
  });

  it("refuses a shared currency when accounts disagree, so spend is not summed misleadingly", () => {
    const r = aggregatePaidSnapshots([
      { type: "tiktok_ads", snapshot: paid("USD", 100, 1000, 100, 10) },
      { type: "meta_ads", snapshot: paid("PKR", 100, 1000, 100, 10) },
    ])!;
    expect(r.currency).toBeNull();
    // Non-monetary counts remain valid and are still combined.
    expect(r.clicks).toBe(200);
  });

  it("refuses a shared currency when any account's currency is unknown", () => {
    const r = aggregatePaidSnapshots([
      { type: "tiktok_ads", snapshot: paid("USD", 100, 1000, 100, 10) },
      // Unknown must not be assumed to match the others.
      { type: "meta_ads", snapshot: paid("", 100, 1000, 100, 10) },
    ])!;
    expect(r.currency).toBeNull();
    expect(r.clicks).toBe(200);
  });

  it("keeps the currency when every account agrees", () => {
    const r = aggregatePaidSnapshots([
      { type: "tiktok_ads", snapshot: paid("GBP", 100, 1000, 100, 10) },
      { type: "meta_ads", snapshot: paid("GBP", 100, 1000, 100, 10) },
    ])!;
    expect(r.currency).toBe("GBP");
  });

  // Previously these asserted 0, which is what the UI then displayed: "CPC $0"
  // for an account that had no clicks at all. A rate with no denominator is not
  // zero, it is unknown, and null is what renders as "—".
  it("reports derived metrics as null when the denominator is zero", () => {
    const r = aggregatePaidSnapshots([
      { type: "tiktok_ads", snapshot: paid("USD", 0, 0, 0, 0) },
      { type: "meta_ads", snapshot: paid("USD", 0, 0, 0, 0) },
    ])!;
    expect(r.ctr).toBeNull();
    expect(r.cpc).toBeNull();
    expect(r.cpm).toBeNull();
    expect(r.costPerConversion).toBeNull();
    expect(r.roas).toBeNull();
  });

  it("still reports a real measured zero as zero", () => {
    // Spend and impressions happened; clicks did not. CTR is a genuine 0%,
    // while CPC has no denominator and stays unknown.
    const r = aggregatePaidSnapshots([
      { type: "tiktok_ads", snapshot: paid("USD", 50, 1000, 0, 0) },
      { type: "meta_ads", snapshot: paid("USD", 50, 1000, 0, 0) },
    ])!;
    expect(r.ctr).toBe(0);
    expect(r.cpc).toBeNull();
  });
});

describe("formatBlockValue", () => {
  it("uses the block's currency symbol", () => {
    expect(formatBlockValue(1000, "currency", "GBP")).toBe("£1,000");
    expect(formatBlockValue(1000, "currency", "USD")).toBe("$1,000");
  });

  it("falls back to the ISO code for currencies with no symbol", () => {
    expect(formatBlockValue(50, "currency", "SEK")).toBe("SEK 50");
  });

  it("formats percentages, durations and positions", () => {
    expect(formatBlockValue(0.0123, "percent")).toBe("1.2%");
    expect(formatBlockValue(90, "duration")).toBe("1m 30s");
    expect(formatBlockValue(7.25, "position")).toBe("7.3");
  });
});

describe("blocksToPromptText", () => {
  it("gives the model labelled figures, deltas and the currency", () => {
    const text = blocksToPromptText(snapshotsToBlocks([{ type: "tiktok_ads", snapshot: adsSnapshot }]));
    expect(text).toContain("## TikTok Ads (amounts in GBP)");
    expect(text).toContain("Spend:");
    expect(text).toContain("+25.0%"); // 1000 vs 800
    expect(text).toContain("[lower is better]");
    expect(text).toContain("Top campaigns:");
  });

  it("returns an empty string when nothing is connected", () => {
    expect(blocksToPromptText([])).toBe("");
  });
});
