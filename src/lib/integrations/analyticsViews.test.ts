import { describe, it, expect } from "vitest";
import { hasAnalyticsView, groupForIntegration } from "./analyticsViews";
import { aggregatePaidSnapshots } from "./blocks";

// Performance renders a source only when it has a view AND a real snapshot, and
// only ever combines sources inside the same metric group. These tests pin both
// rules down, including the exact GSC + Meta pairing this was reported against.

describe("hasAnalyticsView", () => {
  it("covers the integrations that were previously dropped by the stale page gate", () => {
    for (const id of ["microsoft_ads", "woocommerce", "stripe", "mailchimp", "klaviyo", "callrail", "ahrefs", "semrush"]) {
      expect(hasAnalyticsView(id), id).toBe(true);
    }
  });

  it("covers the long-standing sources too", () => {
    for (const id of ["gsc", "ga4", "meta_ads", "tiktok_ads", "pinterest_ads", "instagram", "shopify", "hubspot"]) {
      expect(hasAnalyticsView(id), id).toBe(true);
    }
  });

  it("is false for an unknown id", () => {
    expect(hasAnalyticsView("not_an_integration")).toBe(false);
    expect(hasAnalyticsView(null)).toBe(false);
  });
});

describe("groupForIntegration", () => {
  it("puts Search Console with the SEO tools, not with ads or analytics", () => {
    expect(groupForIntegration("gsc")).toBe("seo");
    expect(groupForIntegration("ahrefs")).toBe("seo");
    expect(groupForIntegration("semrush")).toBe("seo");
    expect(groupForIntegration("moz")).toBe("seo");
  });

  it("puts every ad platform in the paid group", () => {
    for (const id of ["meta_ads", "google_ads", "tiktok_ads", "linkedin_ads", "microsoft_ads", "pinterest_ads", "snapchat_ads", "reddit_ads", "amazon_ads", "x_ads"]) {
      expect(groupForIntegration(id), id).toBe("paid");
    }
  });

  it("keeps website analytics separate from SEO — sessions are not search clicks", () => {
    expect(groupForIntegration("ga4")).toBe("analytics");
    expect(groupForIntegration("adobe_analytics")).toBe("analytics");
  });

  it("separates commerce, CRM, email, social and calls", () => {
    expect(groupForIntegration("shopify")).toBe("commerce");
    expect(groupForIntegration("hubspot")).toBe("crm");
    expect(groupForIntegration("mailchimp")).toBe("email");
    expect(groupForIntegration("instagram")).toBe("social");
    expect(groupForIntegration("callrail")).toBe("calls");
  });
});

describe("GSC + Meta together (the reported case)", () => {
  const gscSnapshot = { totals: { clicks: 120, impressions: 4000, ctr: 0.03, position: 12.4 }, byDate: [], topQueries: [], topPages: [] };
  const metaSnapshot = {
    currency: "PKR",
    totals: { spend: 5000, impressions: 90000, clicks: 700, ctr: 0.0078, cpc: 7.1, cpm: 55, conversions: 30, costPerConversion: 166, revenue: 0, roas: 0 },
    previousTotals: null, byDate: [], topCampaigns: [],
  };

  it("both render — neither is excluded from Performance", () => {
    expect(hasAnalyticsView("gsc")).toBe(true);
    expect(hasAnalyticsView("meta_ads")).toBe(true);
  });

  it("lands them in different groups so their metrics never share a chart", () => {
    expect(groupForIntegration("gsc")).toBe("seo");
    expect(groupForIntegration("meta_ads")).toBe("paid");
    expect(groupForIntegration("gsc")).not.toBe(groupForIntegration("meta_ads"));
  });

  it("never sums Search Console clicks into the paid-media total", () => {
    const agg = aggregatePaidSnapshots([
      { type: "gsc", snapshot: gscSnapshot },
      { type: "meta_ads", snapshot: metaSnapshot },
    ]);
    // Only one paid source, so there is no cross-platform total at all — and
    // critically, GSC's 120 clicks never became part of one.
    expect(agg).toBeNull();
  });

  it("combines Meta with a second ad platform, still excluding GSC", () => {
    const tiktok = { ...metaSnapshot, totals: { ...metaSnapshot.totals, spend: 1000, clicks: 300, impressions: 10000, conversions: 5 } };
    const agg = aggregatePaidSnapshots([
      { type: "gsc", snapshot: gscSnapshot },
      { type: "meta_ads", snapshot: metaSnapshot },
      { type: "tiktok_ads", snapshot: tiktok },
    ])!;
    expect(agg.sourceNames).toEqual(["Meta Ads", "TikTok Ads"]);
    expect(agg.clicks).toBe(1000); // 700 + 300 — not 1120
    expect(agg.spend).toBe(6000);
    expect(agg.currency).toBe("PKR"); // the account's real currency, not USD
  });
});
