import { describe, expect, it } from "vitest";
import { buildExecutiveSummary } from "./summary";
import { detectSignals } from "@/lib/insights/signals";
import { gscWindows, ga4Windows, type Ga4ReportFull } from "@/lib/google";
import { dayCount, addDays } from "./periods";

// A GA4 window rebuilt from daily rows has no user, engagement, conversion or
// revenue figures. Those fields read 0 only because the type is numeric; no
// summary sentence or anomaly flag may present them as measured zeros.

const rebuilt: Ga4ReportFull = {
  totals: { users: 0, newUsers: 0, sessions: 600, engagedSessions: 0, engagementRate: 0, avgEngagementTime: 0, views: 900, conversions: 0, totalRevenue: 0 },
  previousTotals: null,
  byDate: [],
  topLandingPages: [], trafficSources: [], devices: [], countries: [],
  unavailableMetrics: ["users", "newUsers", "engagedSessions", "engagementRate", "avgEngagementTime", "conversions", "totalRevenue"],
};

describe("summaries and signals skip unmeasured GA4 totals", () => {
  it("the executive summary states sessions without claiming 0 users", () => {
    const text = buildExecutiveSummary({ clientName: "Acme", period: { start: "2026-09-01", end: "2026-09-30" }, gsc: null, ga4: rebuilt, blocks: [] }).text;
    expect(text).toContain("600 sessions");
    expect(text).not.toMatch(/from 0 users/);
    expect(text).not.toMatch(/convert/i);
  });

  it("no 'sessions aren't converting' flag is raised when conversions weren't measured", () => {
    const flags = detectSignals(null, rebuilt);
    expect(flags.find((f) => f.kind === "conversion_opportunity")).toBeUndefined();
  });

  it("the same flag still fires on a measured zero", () => {
    const measured = { ...rebuilt, unavailableMetrics: undefined };
    expect(detectSignals(null, measured).find((f) => f.kind === "conversion_opportunity")).toBeDefined();
  });
});

describe("snapshot windows are equal length and contiguous", () => {
  it.each([7, 28, 90])("Search Console, %i days", (n) => {
    const w = gscWindows(n);
    expect(dayCount(w.start, w.end)).toBe(n);
    expect(dayCount(w.prevStart, w.prevEnd)).toBe(n);
    expect(addDays(w.prevEnd, 1)).toBe(w.start);
  });

  it.each([7, 28, 90])("GA4, %i days", (n) => {
    const w = ga4Windows(n);
    expect(dayCount(w.start, w.end)).toBe(n);
    expect(dayCount(w.prevStart, w.prevEnd)).toBe(n);
    expect(addDays(w.prevEnd, 1)).toBe(w.start);
  });
});
