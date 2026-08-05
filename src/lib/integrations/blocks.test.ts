import { describe, it, expect } from "vitest";
import { snapshotToBlock, snapshotsToBlocks, formatBlockValue, blocksToPromptText } from "./blocks";

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
