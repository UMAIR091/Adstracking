import { describe, expect, it } from "vitest";
import { buildOverview } from "./overview";

// The overview's whole purpose is to summarise across channels WITHOUT
// inventing a total that doesn't exist. These tests pin the two things that
// make it trustworthy: what it combines, and what it refuses to combine.
const ads = (currency: string, spend: number, impressions: number, clicks: number, conversions: number) => ({
  platform: "meta_ads",
  currency,
  totals: { spend, impressions, clicks, conversions, revenue: 0, ctr: 0, cpc: 0, cpm: 0, costPerConversion: 0, roas: 0 },
  byDate: [],
  topCampaigns: [],
});

const src = (id: string, name: string, group: string, snapshot: unknown) =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ({ id, name, group: group as any, snapshot });

describe("buildOverview", () => {
  it("sums paid spend across platforms that share a currency", () => {
    const out = buildOverview([
      src("meta_ads", "Meta Ads", "paid", ads("USD", 100, 1000, 50, 5)),
      src("tiktok_ads", "TikTok Ads", "paid", ads("USD", 150, 2000, 70, 3)),
    ]);
    const spend = out.find((m) => m.label === "Ad spend");
    expect(spend?.value).toBe("$250");
    expect(out.find((m) => m.label === "Ad clicks")?.value).toBe("120");
    expect(out.find((m) => m.label === "Conversions")?.value).toBe("8");
  });

  it("refuses to sum spend across different currencies", () => {
    const out = buildOverview([
      src("meta_ads", "Meta Ads", "paid", ads("USD", 100, 1000, 50, 5)),
      src("tiktok_ads", "TikTok Ads", "paid", ads("PKR", 150, 2000, 70, 3)),
    ]);
    const spend = out.find((m) => m.label === "Ad spend");
    expect(spend?.value).toBeNull();
    expect(spend?.source).toMatch(/not combined/i);
    // Counts are still valid across currencies — only money is withheld.
    expect(out.find((m) => m.label === "Ad clicks")?.value).toBe("120");
  });

  it("never merges organic clicks into ad clicks", () => {
    const out = buildOverview([
      src("meta_ads", "Meta Ads", "paid", ads("USD", 100, 1000, 50, 5)),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      src("gsc", "Google Search Console", "seo", { totals: { clicks: 900, impressions: 20000, ctr: 0.045 } } as any),
    ]);
    expect(out.find((m) => m.label === "Ad clicks")?.value).toBe("50");
    expect(out.find((m) => m.label === "Organic clicks")?.value).toBe("900");
    // Two separate figures, each attributed to its own source.
    expect(out.find((m) => m.label === "Organic clicks")?.source).toBe("Google Search Console");
  });

  it("withholds a rate that has no denominator", () => {
    const out = buildOverview([
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      src("gsc", "Google Search Console", "seo", { totals: { clicks: 0, impressions: 0, ctr: 0 } } as any),
    ]);
    expect(out.find((m) => m.label === "Organic CTR")?.value).toBeNull();
  });

  it("recomputes email open rate from summed components", () => {
    const out = buildOverview([
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      src("mailchimp", "Mailchimp", "email", { totals: { emailsSent: 1000, opens: 250 } } as any),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      src("klaviyo", "Klaviyo", "email", { totals: { emailsSent: 1000, opens: 150 } } as any),
    ]);
    // 400/2000 = 20%, not the average of 25% and 15% (which happens to match
    // here, but would not for uneven list sizes).
    expect(out.find((m) => m.label === "Open rate")?.value).toBe("20.0%");
    expect(out.find((m) => m.label === "Emails sent")?.value).toBe("2,000");
  });

  it("returns nothing when no sources are connected", () => {
    expect(buildOverview([])).toEqual([]);
  });
});
