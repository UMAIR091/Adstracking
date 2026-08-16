import { describe, expect, it } from "vitest";
import { inferReportType, suggestReportTitle, reportTypeLabel, isReportType } from "./types";

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
