// Provider-agnostic prompt + JSON schema for report insights. Turning the
// cached metrics into a precise, data-grounded prompt lives here so every
// provider analyzes the data the same way.
import type { InsightsInput } from "./types";

export const SYSTEM = `You are a senior SEO analyst at a white-label marketing agency, writing the insights of a client's organic-search report. The report is delivered to the agency's client under the agency's own brand.

Rules:
- Base every statement strictly on the data provided. Never invent numbers, dates, queries, pages, or facts.
- Be specific and quantitative: cite the actual figures and the change vs. the previous period (absolute and %). Prefer "clicks rose 18% (4,210 → 4,980)" over "traffic improved".
- Avoid generic marketing language and filler ("leverage synergies", "in today's digital landscape", "crush it"). Every sentence must carry a concrete metric or a specific, actionable instruction.
- A lower average position is better than a higher one. Improving from 9.8 to 7.2 is a gain.
- Reference "organic search" / "search performance" rather than naming tools or data sources.
- Be honest about declines; frame them as issues to fix, not spin.
- Write for a busy business owner: clear, concise, professional plain English.

Produce these groups:
- executiveSummary: 2–4 sentences giving the headline story of the period, anchored in the top one or two metric movements.
- keyWins: 2–4 bullets, each a concrete win (a rising query/page, an improved position, a CTR or click gain) with the numbers.
- issuesDetected: 1–4 bullets naming specific declines, weaknesses, or risks (declining queries, dropping positions, high-impression/low-CTR pages, device or country gaps) with the numbers. If genuinely nothing is wrong, return a single bullet saying performance is stable with no material issues.
- growthOpportunities: 2–4 bullets, each a specific, near-term opportunity (a near-page-one keyword with its position and impressions, an underperforming page, an over-indexed device/country to capitalize on).
- recommendedActions: 3–5 prioritized, concrete next steps the agency will take, each tied to the data above (e.g. "Rewrite the title on /pricing — 12,400 impressions at 1.1% CTR").`;

export const SCHEMA = {
  type: "object",
  properties: {
    executiveSummary: { type: "string" },
    keyWins: { type: "array", items: { type: "string" } },
    issuesDetected: { type: "array", items: { type: "string" } },
    growthOpportunities: { type: "array", items: { type: "string" } },
    recommendedActions: { type: "array", items: { type: "string" } },
  },
  required: ["executiveSummary", "keyWins", "issuesDetected", "growthOpportunities", "recommendedActions"],
  additionalProperties: false,
} as const;

const pct = (v: number) => `${(v * 100).toFixed(2)}%`;

function deltaLine(label: string, cur: number, prev: number | null | undefined, opts: { pct?: boolean; lowerBetter?: boolean } = {}) {
  const fmt = (n: number) => (opts.pct ? pct(n) : n.toLocaleString(undefined, { maximumFractionDigits: 1 }));
  if (prev == null || prev === 0) return `- ${label}: ${fmt(cur)} (no prior-period baseline)`;
  const change = ((cur - prev) / prev) * 100;
  const dir = change === 0 ? "flat" : change > 0 ? "up" : "down";
  return `- ${label}: ${fmt(cur)} vs ${fmt(prev)} prior (${dir} ${Math.abs(change).toFixed(1)}%)`;
}

export function buildPrompt(input: InsightsInput): string {
  const { clientName, periodLabel, totals, previousTotals, topQueries, topPages, topCountries, topDevices, movers } = input;

  const kpis = [
    deltaLine("Clicks", totals.clicks, previousTotals?.clicks),
    deltaLine("Impressions", totals.impressions, previousTotals?.impressions),
    deltaLine("Average CTR", totals.ctr, previousTotals?.ctr, { pct: true }),
    deltaLine("Average position (lower is better)", totals.position, previousTotals?.position, { lowerBetter: true }),
  ].join("\n");

  const queries = topQueries.length
    ? topQueries.slice(0, 10).map((q) => `"${q.key}" — ${q.clicks} clicks, ${q.impressions} impr, CTR ${pct(q.ctr)}, pos ${q.position.toFixed(1)}`).join("\n  ")
    : "none";

  const pages = topPages.length
    ? topPages.slice(0, 8).map((p) => `${p.key} — ${p.clicks} clicks, ${p.impressions} impr, CTR ${pct(p.ctr)}, pos ${p.position.toFixed(1)}`).join("\n  ")
    : "none";

  const countries = topCountries?.length
    ? topCountries.slice(0, 6).map((c) => `${c.key} — ${c.clicks} clicks, ${c.impressions} impr, pos ${c.position.toFixed(1)}`).join("\n  ")
    : "not available";

  const devices = topDevices?.length
    ? topDevices.map((d) => `${d.key} — ${d.clicks} clicks, ${d.impressions} impr, CTR ${pct(d.ctr)}, pos ${d.position.toFixed(1)}`).join("\n  ")
    : "not available";

  const winners = movers?.winners?.length
    ? movers.winners.map((w) => `"${w.key}" +${Math.round(w.changePct)}% (${w.prevClicks}→${w.clicks} clicks, pos ${w.position.toFixed(1)})`).join("\n  ")
    : "none";

  const decliners = movers?.decliners?.length
    ? movers.decliners.map((d) => `"${d.key}" ${Math.round(d.changePct)}% (${d.prevClicks}→${d.clicks} clicks, pos ${d.position.toFixed(1)})`).join("\n  ")
    : "none";

  const opportunities = movers?.opportunities?.length
    ? movers.opportunities.map((o) => `"${o.key}" — pos ${o.position.toFixed(1)}, ${o.impressions} impr, ${o.clicks} clicks`).join("\n  ")
    : "none";

  return `Client: ${clientName}
Reporting period: ${periodLabel}

KPI overview (current vs previous equal-length period):
${kpis}

Top queries (by clicks):
  ${queries}

Top pages (by clicks):
  ${pages}

Top countries:
  ${countries}

Devices:
  ${devices}

Winning queries (biggest growth vs previous period):
  ${winners}

Declining queries (biggest drop vs previous period):
  ${decliners}

Growth-opportunity queries (ranking just off page one with impression volume):
  ${opportunities}

Analyze this data and produce the insight groups.`;
}
