// AI insights — public entry point. Orchestrates provider selection, prompting,
// and response validation. Report generation imports only from here.
//
// Adding a provider: implement AIProvider (see ./providers/anthropic.ts),
// register it in PROVIDERS below, and select it at runtime with AI_PROVIDER.
import crypto from "node:crypto";
import { AnthropicProvider } from "./providers/anthropic";
import { SYSTEM, SCHEMA, buildPrompt } from "./prompt";
import { createAdminClient } from "@/lib/supabase/admin";
import type { AIProvider, InsightsInput, ReportInsights } from "./types";

export type { InsightsInput, ReportInsights, Totals } from "./types";

const PROVIDERS: Record<string, () => AIProvider> = {
  anthropic: () => new AnthropicProvider(),
};

function getProvider(): AIProvider {
  const id = (process.env.AI_PROVIDER || "anthropic").toLowerCase();
  return (PROVIDERS[id] ?? PROVIDERS.anthropic)();
}

const toStringArray = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.trim().length > 0) : [];

// Whether AI insights are switched on (a configured, selected provider). When
// false, report generation proceeds without an insights section — no errors.
export function aiConfigured(): boolean {
  return getProvider().isConfigured();
}

// Generates structured report insights from cached metrics. Returns null if AI
// is unconfigured or the call fails — callers must treat insights as optional
// and never block report generation on them.
export async function generateReportInsights(input: InsightsInput): Promise<ReportInsights | null> {
  const provider = getProvider();
  if (!provider.isConfigured()) return null;

  try {
    const text = await provider.complete({ system: SYSTEM, prompt: buildPrompt(input), schema: SCHEMA });
    if (!text) return null;

    const parsed = JSON.parse(text) as Partial<ReportInsights>;
    if (!parsed.executiveSummary) return null;

    return {
      executiveSummary: parsed.executiveSummary,
      keyWins: toStringArray(parsed.keyWins),
      issuesDetected: toStringArray(parsed.issuesDetected),
      growthOpportunities: toStringArray(parsed.growthOpportunities),
      recommendedActions: toStringArray(parsed.recommendedActions),
    };
  } catch (err) {
    // Never fail report generation because of the AI step.
    console.error("AI insights generation failed:", (err as Error).message);
    return null;
  }
}

// Cache-aware wrapper (audit #11). The model input is deterministic in the
// cached snapshot, so re-generating a report whose data hasn't changed (e.g. a
// schedule re-running before the next sync) would spend tokens for an identical
// answer. Keyed on a hash of the exact model input. Returns `cached` so callers
// meter AI usage only when the model actually ran. Best-effort: any cache error
// falls back to a live generation.
export async function generateReportInsightsCached(
  input: InsightsInput
): Promise<{ insights: ReportInsights | null; cached: boolean }> {
  if (!getProvider().isConfigured()) return { insights: null, cached: false };

  const key = crypto.createHash("sha256").update(JSON.stringify(input)).digest("hex");
  const admin = createAdminClient();

  try {
    const { data } = await admin.from("ai_insights_cache").select("insights").eq("cache_key", key).maybeSingle();
    if (data?.insights) return { insights: data.insights as ReportInsights, cached: true };
  } catch {
    /* cache miss/unavailable — fall through to live generation */
  }

  const insights = await generateReportInsights(input);
  if (insights) {
    try {
      await admin.from("ai_insights_cache").insert({ cache_key: key, insights });
    } catch {
      /* ignore duplicate-key races / missing table */
    }
  }
  return { insights, cached: false };
}
