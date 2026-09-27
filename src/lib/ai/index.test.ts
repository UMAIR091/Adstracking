import { describe, expect, it, beforeEach, vi } from "vitest";

// Launch audit B3: the AI-insights module's graceful contract.
//
// The production failure — reports with no insights, an empty cache, no crash —
// is exactly the shape this module produces when the provider isn't operational:
// generateReportInsights returns null and generateReportInsightsCached returns
// { insights: null, cached: false } WITHOUT touching the database. These tests
// pin that behaviour, plus the fact that a live API error degrades to null
// (never throws, never fabricates), and that a real answer is parsed through.

const h = vi.hoisted(() => ({
  configured: true,
  complete: vi.fn(async (_req: unknown) => "" as string | null),
  createAdmin: vi.fn(),
  cacheRow: null as { insights: unknown } | null,
  inserts: [] as unknown[],
  lookups: [] as unknown[],
}));

vi.mock("./providers/anthropic", () => ({
  AnthropicProvider: class {
    readonly id = "anthropic";
    isConfigured() { return h.configured; }
    complete(req: unknown) { return h.complete(req); }
  },
}));

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: (...a: unknown[]) => h.createAdmin(...a) }));

import crypto from "node:crypto";
import { generateReportInsights, generateReportInsightsCached, aiConfigured } from "./index";
import { SYSTEM } from "./prompt";
import type { InsightsInput, ReportInsights } from "./types";

const INPUT: InsightsInput = {
  clientName: "Acme",
  periodLabel: "Last 14 days",
  gsc: { totals: { clicks: 0, impressions: 86, ctr: 0, position: 18 }, topQueries: [], topPages: [] },
  ga4: null,
  blocks: null,
};

const FULL: ReportInsights = {
  executiveSummary: "Impressions rose 104% on a small base.",
  keyWins: ["Impressions up 104%"],
  issuesDetected: ["Clicks at 0"],
  growthOpportunities: ["Target near-page-one queries"],
  recommendedActions: ["Improve titles"],
};

// A chainable stub of the admin client's ai_insights_cache access.
function cacheClient() {
  const api: Record<string, unknown> = {};
  Object.assign(api, {
    from: () => api,
    select: () => api,
    eq: (_col: string, val: unknown) => { h.lookups.push(val); return api; },
    maybeSingle: async () => ({ data: h.cacheRow }),
    insert: async (row: unknown) => { h.inserts.push(row); return { error: null }; },
  });
  return api;
}

beforeEach(() => {
  h.configured = true;
  h.complete.mockReset();
  h.complete.mockResolvedValue(JSON.stringify(FULL));
  h.cacheRow = null;
  h.inserts = [];
  h.lookups = [];
  h.createAdmin.mockReset();
  h.createAdmin.mockImplementation(() => cacheClient());
});

describe("aiConfigured", () => {
  it("reflects the provider's configuration state", () => {
    h.configured = true;
    expect(aiConfigured()).toBe(true);
    h.configured = false;
    expect(aiConfigured()).toBe(false);
  });
});

describe("generateReportInsights", () => {
  it("returns null and never calls the model when the provider is unconfigured", async () => {
    h.configured = false;

    const out = await generateReportInsights(INPUT);

    expect(out).toBeNull();
    expect(h.complete).not.toHaveBeenCalled();
  });

  it("parses and returns the model's structured answer", async () => {
    const out = await generateReportInsights(INPUT);
    expect(out).toEqual(FULL);
  });

  it("normalizes missing optional groups to arrays", async () => {
    h.complete.mockResolvedValue(JSON.stringify({ executiveSummary: "Only a summary." }));
    const out = await generateReportInsights(INPUT);
    expect(out).toEqual({ executiveSummary: "Only a summary.", keyWins: [], issuesDetected: [], growthOpportunities: [], recommendedActions: [] });
  });

  it("returns null (never throws) when the API call fails", async () => {
    h.complete.mockRejectedValue(new Error("Anthropic 500"));
    await expect(generateReportInsights(INPUT)).resolves.toBeNull();
  });

  it("returns null on a refusal / empty response", async () => {
    h.complete.mockResolvedValue(null);
    await expect(generateReportInsights(INPUT)).resolves.toBeNull();
  });

  it("returns null when the response has no executiveSummary", async () => {
    h.complete.mockResolvedValue(JSON.stringify({ keyWins: ["x"] }));
    await expect(generateReportInsights(INPUT)).resolves.toBeNull();
  });
});

describe("generateReportInsightsCached", () => {
  it("returns null WITHOUT touching the database when unconfigured (the production failure path)", async () => {
    h.configured = false;

    const out = await generateReportInsightsCached(INPUT);

    expect(out).toEqual({ insights: null, cached: false });
    expect(h.createAdmin).not.toHaveBeenCalled(); // no cache read, no write
    expect(h.complete).not.toHaveBeenCalled();
  });

  it("returns a cached answer without calling the model", async () => {
    h.cacheRow = { insights: FULL };

    const out = await generateReportInsightsCached(INPUT);

    expect(out).toEqual({ insights: FULL, cached: true });
    expect(h.complete).not.toHaveBeenCalled();
  });

  it("generates on a cache miss and writes the result to the cache", async () => {
    h.cacheRow = null;

    const out = await generateReportInsightsCached(INPUT);

    expect(out).toEqual({ insights: FULL, cached: false });
    expect(h.complete).toHaveBeenCalledTimes(1);
    expect(h.inserts).toHaveLength(1);
    expect((h.inserts[0] as { insights: ReportInsights }).insights).toEqual(FULL);
  });

  it("does not write the cache when generation yields null", async () => {
    h.complete.mockResolvedValue(null);

    const out = await generateReportInsightsCached(INPUT);

    expect(out).toEqual({ insights: null, cached: false });
    expect(h.inserts).toHaveLength(0);
  });
});

describe("the cache key covers the prompt, not just the data", () => {
  // Keyed on the input alone, editing SYSTEM changed nothing for any client
  // whose metrics hadn't moved: they kept being served prose written under the
  // old instructions, with nothing in the report to show it. Rewriting the
  // prompt has to retire the answers it produced.
  const keyOf = (...parts: string[]) => {
    const hash = crypto.createHash("sha256");
    for (const p of parts) hash.update(p);
    return hash.digest("hex");
  };

  it("hashes SYSTEM alongside the input", async () => {
    await generateReportInsightsCached(INPUT);

    expect(h.lookups).toEqual([keyOf(SYSTEM, "\u0000", JSON.stringify(INPUT))]);
  });

  it("is not the data hash on its own", async () => {
    await generateReportInsightsCached(INPUT);

    expect(h.lookups[0]).not.toBe(keyOf(JSON.stringify(INPUT)));
  });

  it("writes the row back under the same key it looked up", async () => {
    await generateReportInsightsCached(INPUT);

    expect((h.inserts[0] as { cache_key: string }).cache_key).toBe(h.lookups[0]);
  });
});

describe("the cache wrapper honours the never-throw contract", () => {
  // createAdminClient() sat outside the try. It is createClient(url!, key!),
  // which throws when SUPABASE_SERVICE_ROLE_KEY is missing — so a config gap
  // made this wrapper throw instead of degrading. It escaped createClientReport
  // after the report allowance had been reserved and before the row was
  // inserted, so the release never ran and a trial agency lost a generation.
  it("still returns insights when the admin client cannot be constructed", async () => {
    h.createAdmin.mockImplementation(() => {
      throw new Error("supabaseKey is required.");
    });

    const result = await generateReportInsightsCached(INPUT);

    expect(result).toEqual({ insights: FULL, cached: false });
    expect(h.complete).toHaveBeenCalledTimes(1);
  });

  it("does not attempt a cache write when there is no admin client", async () => {
    h.createAdmin.mockImplementation(() => {
      throw new Error("supabaseKey is required.");
    });

    await generateReportInsightsCached(INPUT);

    expect(h.inserts).toEqual([]);
  });
});
