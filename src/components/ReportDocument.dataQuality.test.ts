import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

// What the client actually reads, rendered: a GA4 window rebuilt from daily
// rows must show "—" for the totals it could not measure (never "0"), and the
// report must name a source it left out and why.

vi.mock("@/lib/reportFonts", () => ({ reportFonts: { className: "", variable: "" } }));

import { ReportDocument } from "./ReportDocument";

const data = {
  gsc: null,
  ga4: {
    totals: { users: 0, newUsers: 0, sessions: 600, engagedSessions: 0, engagementRate: 0, avgEngagementTime: 0, views: 900, conversions: 0, totalRevenue: 0 },
    previousTotals: { users: 0, newUsers: 0, sessions: 500, engagedSessions: 0, engagementRate: 0, avgEngagementTime: 0, views: 800, conversions: 0, totalRevenue: 0 },
    byDate: Array.from({ length: 30 }, (_, i) => ({ date: `2026-09-${String(i + 1).padStart(2, "0")}`, users: 0, sessions: 20, views: 30 })),
    topLandingPages: [], trafficSources: [], devices: [], countries: [],
    unavailableMetrics: ["users", "newUsers", "engagedSessions", "engagementRate", "avgEngagementTime", "conversions", "totalRevenue"],
  },
  blocks: [],
  insights: null,
  meta: {
    periodDays: 30,
    requested: { start: "2026-09-01", end: "2026-09-30" },
    coverage: { start: "2026-09-01", end: "2026-09-30" },
    periodPreset: "previous_month",
    periodKind: "calendar",
    periodLabel: "September 2026",
    sources: [
      { type: "ga4", name: "Google Analytics 4", included: true, state: "ok", window: { start: "2026-09-01", end: "2026-09-30" }, syncedAt: null, connection: "connected" },
      { type: "meta_ads", name: "Meta Ads", included: false, state: "no_data", window: null, lastDataDate: "2026-08-22", syncedAt: "2026-08-29T06:38:00Z", connection: "revoked" },
    ],
    unavailable: [{ section: "Users and new users", reason: "These count unique people." }],
  },
};

const html = renderToStaticMarkup(
  createElement(ReportDocument, {
    branding: { name: "Agency", logo_url: null, brand_color: "#0F7A6C", website: null, footer_text: null },
    clientName: "Acme",
    title: "Acme — September 2026",
    period: { start: "2026-09-01", end: "2026-09-30" },
    data,
  } as Parameters<typeof ReportDocument>[0])
);
const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

describe("the rendered report", () => {
  it("shows unmeasured GA4 totals as not available, not zero", () => {
    expect(text).toMatch(/Users —/);
    expect(text).toMatch(/Conversions —/);
    expect(text).not.toMatch(/Users 0 /);
    expect(text).toContain("600");
  });

  it("names the source it left out and why", () => {
    expect(text).toContain("Meta Ads is not included: it has no data recorded between 2026-09-01 and 2026-09-30 (its data ends 2026-08-22)");
  });

  it("never claims sessions aren't converting when conversions weren't measured", () => {
    expect(text).not.toMatch(/aren.t converting/i);
    expect(text).not.toMatch(/Conversion rate 0/);
  });
});
