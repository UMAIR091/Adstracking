import Anthropic from "@anthropic-ai/sdk";

// AI-generated executive summaries for reports. Pure helper — no DB access.
// Calls Claude to turn raw Search Console metrics into a plain-English,
// client-ready summary with highlights and recommendations.
//
// Defaults to Claude Opus 4.8 (the most capable model); override with AI_MODEL
// (e.g. "claude-sonnet-4-6" or "claude-haiku-4-5") to trade some quality for cost.
const MODEL = process.env.AI_MODEL || "claude-opus-4-8";

type Totals = { clicks: number; impressions: number; ctr: number; position: number };

export type InsightsInput = {
  clientName: string;
  periodLabel: string;
  totals: Totals;
  previousTotals?: Totals | null;
  topQueries: { key: string; clicks: number; impressions: number; position: number }[];
  topPages: { key: string; clicks: number }[];
};

export type ReportInsights = {
  summary: string;
  highlights: string[];
  recommendations: string[];
};

// Whether AI summaries are switched on. When false, report generation proceeds
// without an insights section — no errors, just no AI.
export function aiConfigured(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}

const SYSTEM = `You are a senior marketing analyst at a white-label agency, writing the executive-summary section of a client's SEO report. The report is delivered to the agency's client under the agency's own brand.

Rules:
- Write in clear, professional plain English for a business owner who is not technical.
- Base every statement strictly on the data provided. Never invent numbers, dates, or facts.
- Be specific — reference the actual figures (and the change vs. the previous period when given).
- Be encouraging but honest about declines; if something dropped, say so and frame it constructively.
- Refer to "organic search" or "search performance" rather than naming tools.
- Remember a lower average position is better than a higher one.

Produce:
- summary: a 2–4 sentence paragraph giving the headline story of the period.
- highlights: 3–5 short bullet points, each referencing a concrete metric or query/page.
- recommendations: 2–3 concrete, actionable next steps the agency can take next period.`;

const SCHEMA = {
  type: "object",
  properties: {
    summary: { type: "string" },
    highlights: { type: "array", items: { type: "string" } },
    recommendations: { type: "array", items: { type: "string" } },
  },
  required: ["summary", "highlights", "recommendations"],
  additionalProperties: false,
} as const;

function buildPrompt(input: InsightsInput): string {
  const { clientName, periodLabel, totals, previousTotals, topQueries, topPages } = input;
  const pct = (v: number) => `${(v * 100).toFixed(2)}%`;

  const current = [
    `- Clicks: ${totals.clicks}`,
    `- Impressions: ${totals.impressions}`,
    `- Average CTR: ${pct(totals.ctr)}`,
    `- Average position: ${totals.position.toFixed(1)}`,
  ].join("\n");

  const previous = previousTotals
    ? [
        `Search performance — previous period (for comparison):`,
        `- Clicks: ${previousTotals.clicks}`,
        `- Impressions: ${previousTotals.impressions}`,
        `- Average CTR: ${pct(previousTotals.ctr)}`,
        `- Average position: ${previousTotals.position.toFixed(1)}`,
      ].join("\n")
    : "No previous-period data is available for comparison.";

  const queries = topQueries.length
    ? topQueries
        .slice(0, 10)
        .map((q) => `"${q.key}" — ${q.clicks} clicks, avg position ${q.position.toFixed(1)}`)
        .join("; ")
    : "none";

  const pages = topPages.length
    ? topPages.slice(0, 8).map((p) => `${p.key} — ${p.clicks} clicks`).join("; ")
    : "none";

  return `Client: ${clientName}
Reporting period: ${periodLabel}

Search performance — current period:
${current}

${previous}

Top queries (by clicks): ${queries}

Top pages (by clicks): ${pages}

Write the executive summary.`;
}

// Generates report insights. Returns null if AI is not configured or the call
// fails — callers should treat insights as optional and never block on them.
export async function generateReportInsights(input: InsightsInput): Promise<ReportInsights | null> {
  if (!aiConfigured()) return null;

  try {
    const client = new Anthropic();
    const res = await client.messages.create({
      model: MODEL,
      max_tokens: 4096,
      thinking: { type: "adaptive" },
      output_config: {
        effort: "medium",
        format: { type: "json_schema", schema: SCHEMA },
      },
      system: SYSTEM,
      messages: [{ role: "user", content: buildPrompt(input) }],
    });

    if (res.stop_reason === "refusal") return null;

    const text = res.content.find((b): b is Anthropic.TextBlock => b.type === "text")?.text;
    if (!text) return null;

    const parsed = JSON.parse(text) as ReportInsights;
    if (!parsed.summary) return null;
    return {
      summary: parsed.summary,
      highlights: Array.isArray(parsed.highlights) ? parsed.highlights : [],
      recommendations: Array.isArray(parsed.recommendations) ? parsed.recommendations : [],
    };
  } catch (err) {
    // Never fail report generation because of the AI step.
    console.error("AI insights generation failed:", (err as Error).message);
    return null;
  }
}
