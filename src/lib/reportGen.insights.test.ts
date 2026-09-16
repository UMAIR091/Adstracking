import { describe, expect, it, beforeEach, vi } from "vitest";

// Launch audit B3: AI insights on a generated report.
//
// The production failure was that reports carried no AI insights and the cache
// stayed empty. The root cause was environmental (the Anthropic provider was
// not operational in prod, so generateReportInsightsCached returned null), but
// these tests pin the code contract createClientReport must keep either way:
//
//   * when the provider returns insights, they are stored on the report;
//   * when it returns null (the prod failure mode, or a live API failure),
//     generation still succeeds and stores insights: null — never a fabricated
//     or fallback object presented as AI-generated;
//   * the AI is only attempted when the plan allows it (Free never calls it).
//
// Nothing here touches Supabase, Google or the real AI — the AI module and the
// plan check are mocked, and a stub DB captures the row that would be inserted.

const h = vi.hoisted(() => ({
  ai: vi.fn(async (..._a: unknown[]) => ({ insights: null as unknown, cached: false })),
  limit: { allowed: true, plan: "pro", limit: null } as Record<string, unknown>,
}));

vi.mock("@/lib/ai", () => ({
  generateReportInsightsCached: (...a: unknown[]) => h.ai(...a),
}));
vi.mock("@/lib/billing/limits", () => ({ checkReportLimit: async () => h.limit }));
vi.mock("@/lib/usage", () => ({
  trackUsage: async () => {},
  reserveReportGeneration: async () => ({ ok: true, periodMonth: "2026-09-01" }),
  releaseReportGeneration: async () => {},
}));

import { createClientReport } from "./reportGen";
import type { ReportInsights } from "./ai";

const NOW = Date.parse("2026-09-16T12:00:00Z");

const SAMPLE: ReportInsights = {
  executiveSummary: "Organic impressions rose 104% on a small base.",
  keyWins: ["Impressions up 104% (42 -> 86)"],
  issuesDetected: ["Clicks remain at 0"],
  growthOpportunities: ["Near-page-one queries worth targeting"],
  recommendedActions: ["Improve titles on high-impression pages"],
};

/** 90 days of Search Console history ending at the settled day (14 Sep 2026). */
function gscDays(count = 90) {
  const out = [];
  for (let i = count - 1; i >= 0; i--) {
    const date = new Date(Date.parse("2026-09-14T00:00:00Z") - i * 86400000).toISOString().slice(0, 10);
    out.push({ date, clicks: 1, impressions: 10, ctr: 0.1, position: 5 });
  }
  return out;
}

type Insert = Record<string, unknown>;

function stubSupabase() {
  const inserted: Insert[] = [];
  const byDate = gscDays();
  const table = (name: string) => {
    const api: Record<string, unknown> = {};
    const self = () => api;
    Object.assign(api, {
      select: self, eq: self, in: self, is: self, order: self,
      maybeSingle: async () => {
        if (name === "clients") return { data: { id: "c1", name: "Acme", archived: false } };
        if (name === "gsc_snapshots") {
          return { data: { data: { totals: { clicks: 0, impressions: 0, ctr: 0, position: 0 }, byDate, topQueries: [{ key: "q" }], topPages: [], topCountries: [], topDevices: [], previousTotals: null, movers: null } } };
        }
        if (name === "ga4_snapshots") return { data: null };
        if (name === "report_templates") return { data: { name: "SEO Report", sections: [] } };
        return { data: null };
      },
      single: async () => ({ data: { id: "r1", share_token: "tok" }, error: null }),
      insert: (row: Insert) => { inserted.push(row); return api; },
      update: self,
    });
    if (name === "data_sources") {
      const q: Record<string, unknown> = {};
      Object.assign(q, {
        select: () => q,
        eq: () => q,
        then: (resolve: (v: { data: unknown[] }) => void) =>
          resolve({ data: [{ id: "ds1", type: "gsc", config: { site_url: "sc-domain:x" } }] }),
      });
      return q;
    }
    if (name === "metric_daily") {
      const q: Record<string, unknown> = {};
      Object.assign(q, {
        select: () => q, eq: () => q, gte: () => q, lte: () => q, order: () => q, range: () => q,
        then: (resolve: (v: { data: unknown[]; error: null }) => void) => resolve({ data: [], error: null }),
      });
      return q;
    }
    return api;
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { client: { from: (n: string) => table(n) } as any, inserted };
}

const generate = async (stub = stubSupabase()) => {
  const res = await createClientReport(stub.client, "a1", "c1", { now: NOW, period: "last_28" });
  return { res, inserted: stub.inserted[0] };
};

const storedInsights = (row: Insert) => (row.data as { insights: ReportInsights | null }).insights;

beforeEach(() => {
  h.ai.mockClear();
  h.ai.mockResolvedValue({ insights: null, cached: false });
  h.limit = { allowed: true, plan: "pro", limit: null };
});

describe("AI insights on a generated report (B3)", () => {
  it("stores the provider's insights on the report when the plan allows AI", async () => {
    h.ai.mockResolvedValue({ insights: SAMPLE, cached: false });

    const { res, inserted } = await generate();

    expect(res.ok).toBe(true);
    expect(h.ai).toHaveBeenCalledTimes(1);
    expect(storedInsights(inserted)).toEqual(SAMPLE);
  });

  it("still generates the report, with insights: null, when the provider returns null", async () => {
    // The exact production failure mode: AI unavailable / call failed -> null.
    h.ai.mockResolvedValue({ insights: null, cached: false });

    const { res, inserted } = await generate();

    expect(res.ok).toBe(true);            // generation is not broken by the AI step
    expect(h.ai).toHaveBeenCalledTimes(1); // AI was attempted on a paid plan
    expect(storedInsights(inserted)).toBeNull(); // no fabricated / fallback insights
  });

  it("never calls the AI on the Free plan and stores null insights", async () => {
    h.limit = { allowed: true, plan: "free", limit: 1 };

    const { res, inserted } = await generate();

    expect(res.ok).toBe(true);
    expect(h.ai).not.toHaveBeenCalled();
    expect(storedInsights(inserted)).toBeNull();
  });
});
