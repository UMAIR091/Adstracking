import { describe, expect, it } from "vitest";
import { inferReportType, suggestReportTitle, reportTypeLabel, isReportType, coverBadgeLabel } from "./types";

// The headline complaint this fixes: every report was titled "SEO Report",
// because "seo" was the default template and nothing looked at the data.
describe("inferReportType", () => {
  it("calls an ads-only report Paid Media, not SEO", () => {
    expect(inferReportType(["meta_ads", "tiktok_ads"])).toBe("paid");
  });

  it("recognises a Search-Console-only report as SEO", () => {
    expect(inferReportType(["gsc"])).toBe("seo");
  });

  it("groups SEO tools with Search Console", () => {
    expect(inferReportType(["gsc", "ahrefs", "semrush"])).toBe("seo");
  });

  it("recognises a GA4-only report as Website Analytics", () => {
    expect(inferReportType(["ga4"])).toBe("analytics");
  });

  it("calls a mix of families Cross-Channel", () => {
    expect(inferReportType(["gsc", "meta_ads"])).toBe("cross_channel");
    expect(inferReportType(["ga4", "shopify", "meta_ads"])).toBe("cross_channel");
  });

  it("falls back to Custom for a single non-standard family", () => {
    expect(inferReportType(["shopify"])).toBe("custom");
  });

  it("falls back to Custom when nothing contributed", () => {
    expect(inferReportType([])).toBe("custom");
  });
});

describe("suggestReportTitle", () => {
  it("names the client, the type and the window", () => {
    expect(
      suggestReportTitle({ clientName: "Acme Running Co", type: "paid", periodLabel: "Jul–Aug 2026" })
    ).toBe("Acme Running Co — Paid Media Report · Jul–Aug 2026");
  });

  it("omits the period when there isn't one", () => {
    expect(suggestReportTitle({ clientName: "Acme", type: "seo", periodLabel: null })).toBe(
      "Acme — SEO Report"
    );
  });

  it("uses the cross-channel label for multi-family reports", () => {
    expect(
      suggestReportTitle({ clientName: "Acme", type: "cross_channel", periodLabel: "Aug 2026" })
    ).toBe("Acme — Cross-Channel Report · Aug 2026");
  });
});

describe("reportTypeLabel", () => {
  it("maps stored ids to display labels", () => {
    expect(reportTypeLabel("paid")).toBe("Paid Media");
    expect(reportTypeLabel("cross_channel")).toBe("Cross-Channel");
  });

  it("returns null for reports generated before types existed", () => {
    expect(reportTypeLabel(null)).toBeNull();
    expect(reportTypeLabel("nonsense")).toBeNull();
  });
});

describe("isReportType", () => {
  it("accepts only the known types", () => {
    expect(isReportType("seo")).toBe(true);
    expect(isReportType("paid")).toBe(true);
    expect(isReportType("")).toBe(false);
    expect(isReportType("SEO")).toBe(false);
  });
});

// The badge is the line a client reads first. Both renderers now call this, so
// a cross-channel report can no longer be stamped "SEO Report" in one place and
// labelled correctly in another.
describe("coverBadgeLabel", () => {
  it("uses the stored report type over the connected channels", () => {
    expect(coverBadgeLabel("cross_channel", ["Search Console"])).toBe("Cross-Channel Report");
    expect(coverBadgeLabel("paid", ["Meta Ads"])).toBe("Paid Media Report");
  });

  it("never calls an ads-only report an SEO report", () => {
    expect(coverBadgeLabel(null, ["Meta Ads"])).toBe("Meta Ads Report");
    expect(coverBadgeLabel(null, ["Meta Ads", "TikTok Ads"])).toBe("Meta Ads + TikTok Ads Report");
  });

  it("falls back to the channels for reports predating types", () => {
    expect(coverBadgeLabel(null, ["Search Console", "Analytics"])).toBe("Search Console + Analytics Report");
  });

  it("calls three or more channels cross-channel", () => {
    expect(coverBadgeLabel(null, ["Search Console", "Analytics", "Meta Ads"])).toBe("Cross-Channel Report");
  });

  it("stays neutral when nothing is connected", () => {
    expect(coverBadgeLabel(null, [])).toBe("Performance Report");
  });

  it("ignores an unrecognised stored type rather than printing it raw", () => {
    expect(coverBadgeLabel("nonsense", ["Meta Ads"])).toBe("Meta Ads Report");
  });
});
