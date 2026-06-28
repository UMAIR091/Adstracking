// Provider-agnostic prompt + JSON schema for report insights. Turning the
// cached metrics into a precise, data-grounded prompt lives here so every
// provider analyzes the data the same way. Handles either or both of Search
// Console (SEO) and GA4 (engagement/conversions).
import type { InsightsInput, Totals, Ga4Totals } from "./types";

export const SYSTEM = `You are a senior SEO & analytics consultant at a white-label marketing agency, writing the insights of a client's organic-performance report. The report is delivered to the agency's client under the agency's own brand.

You may be given Search Console data (clicks, impressions, CTR, position, queries, pages), GA4 data (users, sessions, engagement, conversions, revenue, channels, landing pages), or both. When you have both, correlate them: connect search visibility to on-site engagement and conversions (e.g. "search clicks rose 18% and organic sessions rose 15%, but engagement rate held at 61% — traffic quality is steady").

Rules:
- Base every statement strictly on the data provided. Never invent numbers, dates, queries, pages, or facts. If a source is missing, do not speculate about it.
- Be specific and quantitative: cite actual figures and the change vs. the previous period (absolute and %). Prefer "clicks rose 18% (4,210 → 4,980)" over "traffic improved".
- Avoid generic marketing language and filler. Every sentence must carry a concrete metric or a specific, actionable instruction.
- A lower average position is better than a higher one. Improving from 9.8 to 7.2 is a gain.
- Reference "organic search", "search performance" and "website engagement" rather than naming tools or data sources.
- Be honest about declines; frame them as issues to fix, not spin.
- Write for a busy business owner: clear, concise, professional plain English.

Produce these groups:
- executiveSummary: 2–4 sentences giving the headline story, ideally tying search performance to website outcomes when both are available.
- keyWins: 2–4 bullets, each a concrete win with numbers (a rising query/page, improved position, more sessions/conversions, higher engagement).
- issuesDetected: 1–4 bullets naming specific declines, weaknesses, or risks with numbers (declining queries, dropping positions, high-traffic/low-engagement pages, low CTR on high-impression queries, weak converting channels). If nothing is materially wrong, return one bullet saying performance is stable.
- growthOpportunities: 2–4 bullets, each a specific near-term opportunity (a near-page-one keyword with position + impressions, a high-impression low-CTR page, a high-traffic low-conversion landing page, an under-served device/country).
- recommendedActions: 3–5 prioritized, concrete next steps tied to the data above.`;

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
const num = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 1 });

function deltaLine(label: string, cur: number, prev: number | null | undefined, asPct = false) {
  const fmt = (n: number) => (asPct ? pct(n) : num(n));
  if (prev == null || prev === 0) return `- ${label}: ${fmt(cur)} (no prior-period baseline)`;
  const change = ((cur - prev) / prev) * 100;
  const dir = change === 0 ? "flat" : change > 0 ? "up" : "down";
  return `- ${label}: ${fmt(cur)} vs ${fmt(prev)} prior (${dir} ${Math.abs(change).toFixed(1)}%)`;
}

function gscSection(gsc: NonNullable<InsightsInput["gsc"]>): string {
  const t = gsc.totals;
  const p = gsc.previousTotals;
  const kpis = [
    deltaLine("Clicks", t.clicks, p?.clicks),
    deltaLine("Impressions", t.impressions, p?.impressions),
    deltaLine("Average CTR", t.ctr, p?.ctr, true),
    deltaLine("Average position (lower is better)", t.position, p?.position),
  ].join("\n");

  const queries = gsc.topQueries.length
    ? gsc.topQueries.slice(0, 10).map((q) => `"${q.key}" — ${q.clicks} clicks, ${q.impressions} impr, CTR ${pct(q.ctr)}, pos ${q.position.toFixed(1)}`).join("\n  ")
    : "none";
  const pages = gsc.topPages.length
    ? gsc.topPages.slice(0, 8).map((pg) => `${pg.key} — ${pg.clicks} clicks, ${pg.impressions} impr`).join("\n  ")
    : "none";
  const winners = gsc.movers?.winners?.length
    ? gsc.movers.winners.map((w) => `"${w.key}" +${Math.round(w.changePct)}% (${w.prevClicks}→${w.clicks} clicks, pos ${w.position.toFixed(1)})`).join("\n  ")
    : "none";
  const decliners = gsc.movers?.decliners?.length
    ? gsc.movers.decliners.map((d) => `"${d.key}" ${Math.round(d.changePct)}% (${d.prevClicks}→${d.clicks} clicks, pos ${d.position.toFixed(1)})`).join("\n  ")
    : "none";
  const opps = gsc.movers?.opportunities?.length
    ? gsc.movers.opportunities.map((o) => `"${o.key}" — pos ${o.position.toFixed(1)}, ${o.impressions} impr`).join("\n  ")
    : "none";

  return `SEARCH CONSOLE (organic search)
KPIs (current vs previous period):
${kpis}
Top queries:
  ${queries}
Top pages:
  ${pages}
Winning queries: ${winners === "none" ? "none" : "\n  " + winners}
Declining queries: ${decliners === "none" ? "none" : "\n  " + decliners}
Near-page-one opportunities: ${opps === "none" ? "none" : "\n  " + opps}`;
}

function ga4Section(ga4: NonNullable<InsightsInput["ga4"]>): string {
  const t = ga4.totals;
  const p = ga4.previousTotals;
  const dim = (rows?: { key: string; sessions: number; users: number }[]) =>
    rows?.length ? rows.slice(0, 6).map((r) => `${r.key} — ${r.sessions} sessions, ${r.users} users`).join("\n  ") : "none";

  const kpis = [
    deltaLine("Users", t.users, p?.users),
    deltaLine("New users", t.newUsers, p?.newUsers),
    deltaLine("Sessions", t.sessions, p?.sessions),
    deltaLine("Engaged sessions", t.engagedSessions, p?.engagedSessions),
    deltaLine("Engagement rate", t.engagementRate, p?.engagementRate, true),
    deltaLine("Avg engagement time (s)", t.avgEngagementTime, p?.avgEngagementTime),
    deltaLine("Views", t.views, p?.views),
    deltaLine("Conversions", t.conversions, p?.conversions),
    t.totalRevenue > 0 ? deltaLine("Total revenue", t.totalRevenue, p?.totalRevenue) : null,
  ].filter(Boolean).join("\n");

  return `GA4 (website engagement & conversions)
KPIs (current vs previous period):
${kpis}
Traffic sources (channels):
  ${dim(ga4.trafficSources)}
Top landing pages:
  ${dim(ga4.topLandingPages)}
Devices:
  ${dim(ga4.devices)}
Countries:
  ${dim(ga4.countries)}`;
}

export function buildPrompt(input: InsightsInput): string {
  const sections: string[] = [];
  if (input.gsc) sections.push(gscSection(input.gsc));
  if (input.ga4) sections.push(ga4Section(input.ga4));

  const both = input.gsc && input.ga4;
  const guidance = both
    ? "Both sources are available — correlate search performance with website engagement and conversions in your analysis."
    : "Only one data source is available — analyze it directly and do not speculate about the missing source.";

  return `Client: ${input.clientName}
Reporting period: ${input.periodLabel}

${sections.join("\n\n")}

${guidance}

Analyze this data and produce the insight groups.`;
}

// Re-exported so callers don't need to reach into ./types for the totals shapes.
export type { Totals, Ga4Totals };
