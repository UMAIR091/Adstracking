import { describe, expect, it } from "vitest";
import { buildPrompt, deltaLine } from "./prompt";
import { blocksToPromptText } from "@/lib/integrations/blocks";
import { toInsightsInput, assembleReport } from "@/lib/report";
import type { InsightsInput } from "./types";
import type { Ga4ReportFull } from "@/lib/google";

// What the model is given about the limits of the data: every change printed
// in both percentage and absolute terms (so it never needs arithmetic of its
// own), unmeasured metrics named rather than zeroed, and the report's data
// quality notes stated before it writes.

describe("deltaLine", () => {
  it("prints both the percentage and the absolute change", () => {
    expect(deltaLine("Clicks", 4980, 4210)).toBe("- Clicks: 4,980 vs 4,210 prior (up 18.3%, up 770)");
    expect(deltaLine("CTR", 0.04, 0.05, true)).toBe("- CTR: 4.00% vs 5.00% prior (down 20.0%, down 1.00 percentage points)");
  });

  it("treats a prior of zero as a real baseline with no percentage change", () => {
    expect(deltaLine("Conversions", 5, 0)).toBe("- Conversions: 5 vs 0 prior (new this period, up 5; no percentage change from zero)");
    expect(deltaLine("Conversions", 0, 0)).toBe("- Conversions: 0 vs 0 prior (unchanged)");
  });

  it("says there is no baseline only when there is none", () => {
    expect(deltaLine("Clicks", 10, null)).toBe("- Clicks: 10 (no prior-period baseline)");
  });
});

describe("blocksToPromptText", () => {
  it("prints the absolute change beside the percentage", () => {
    const text = blocksToPromptText([
      { sourceId: "google_ads", sourceName: "Google Ads", category: "paid", currency: "USD", series: [], tables: [], notes: [],
        kpis: [{ label: "Spend", value: 1200, previous: 1000, format: "currency" }, { label: "Conversions", value: 4, previous: 0, format: "number" }] },
    ]);
    expect(text).toContain("- Spend: 1,200 vs 1,000 prior (+20.0%, +200)");
    expect(text).toContain("- Conversions: 4 vs 0 prior (new this period; no percentage change from zero)");
  });
});

const ga4Rebuilt: Ga4ReportFull = {
  totals: { users: 0, newUsers: 0, sessions: 600, engagedSessions: 0, engagementRate: 0, avgEngagementTime: 0, views: 900, conversions: 0, totalRevenue: 0 },
  previousTotals: null,
  byDate: [],
  topLandingPages: [], trafficSources: [], devices: [], countries: [],
  unavailableMetrics: ["users", "newUsers", "engagedSessions", "engagementRate", "avgEngagementTime", "conversions", "totalRevenue"],
};

describe("unmeasured GA4 totals never reach the model as zeros", () => {
  const input: InsightsInput = { clientName: "Acme", periodLabel: "September 2026", gsc: null, ga4: { ...ga4Rebuilt }, blocks: null };
  const prompt = buildPrompt(input);

  it("omits them from the figures", () => {
    expect(prompt).toContain("- Sessions: 600");
    expect(prompt).not.toMatch(/- Conversions: 0/);
    expect(prompt).not.toMatch(/- Users: 0/);
  });

  it("names them as not available", () => {
    expect(prompt).toContain("Not available for this period (no value — do not mention or estimate): Users, New users, Engaged sessions, Engagement rate, Avg engagement time (s), Conversions");
  });
});

describe("the report's data-quality notes reach the model", () => {
  it("states excluded sources and per-platform windows in a DATA QUALITY section", () => {
    const data = assembleReport(null, ga4Rebuilt, null, [], {
      periodDays: 30,
      requested: { start: "2026-09-01", end: "2026-09-30" },
      coverage: null,
      sources: [
        { type: "ga4", name: "Google Analytics 4", included: true, state: "ok", window: { start: "2026-09-01", end: "2026-09-30" }, syncedAt: null, connection: "connected" },
        { type: "meta_ads", name: "Meta Ads", included: false, state: "no_data", window: null, lastDataDate: "2026-08-22", syncedAt: "2026-08-29T06:38:00Z", connection: "revoked" },
      ],
      unavailable: [{ section: "Users and new users", reason: "These count unique people." }],
    });
    const prompt = buildPrompt(toInsightsInput(data, "Acme", "September 2026"));
    expect(prompt).toContain("DATA QUALITY (limits of the data above — respect every one)");
    expect(prompt).toContain("- Meta Ads is not included: it has no data recorded between 2026-09-01 and 2026-09-30 (its data ends 2026-08-22), and its connection has been revoked — reconnect it to include it again.");
    expect(prompt).toContain("- Users and new users: These count unique people.");
  });

  it("adds no section when there is nothing to say", () => {
    const prompt = buildPrompt({ clientName: "Acme", periodLabel: "x", gsc: null, ga4: null, blocks: null, dataQuality: [] });
    expect(prompt).not.toContain("DATA QUALITY");
  });
});
