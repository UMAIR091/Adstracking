// Provider-agnostic prompt + JSON schema for report insights. Turning the
// cached metrics into a precise, data-grounded prompt lives here so every
// provider analyzes the data the same way. Handles either or both of Search
// Console (SEO) and GA4 (engagement/conversions).
import { blocksToPromptText } from "@/lib/integrations/blocks";
import type { InsightsInput, Totals, Ga4Totals } from "./types";

export const SYSTEM = `You are a senior digital marketing consultant at a white-label marketing agency, writing the insights of a client's marketing performance report. The report is delivered to the agency's client under the agency's own brand.

You may be given any combination of marketing channels: organic search (clicks, impressions, CTR, position, queries, pages), website analytics (users, sessions, engagement, conversions, revenue, channels, landing pages), paid advertising (spend, impressions, clicks, CTR, CPC, CPM, conversions, cost per conversion, revenue, ROAS, campaigns, ad groups, ads), e-commerce (orders, revenue, average order value, products), CRM (contacts, deals, pipeline), email marketing (subscribers, open and click rates, campaigns), social media (followers, reach, engagement, top content), call tracking, video, and local presence.

Analyze whatever you are given as ONE marketing programme, not as separate silos. Correlate across channels wherever the data supports it — for example: paid spend rising while cost per conversion falls means efficiency improved; paid clicks rising while site engagement falls suggests a landing-page or targeting problem; organic and paid both declining points to a demand or seasonality issue; e-commerce revenue rising faster than ad spend means blended return improved.

Rules:
- Base every statement strictly on the data provided. Never invent numbers, dates, queries, pages, campaigns, or facts. If a channel is missing, do not speculate about it.
- Be specific and quantitative: cite actual figures and the change vs. the previous period (absolute and %). Prefer "spend rose 18% (£4,210 → £4,980) while cost per conversion fell 9%" over "paid performance improved".
- Use the currency stated for each monetary channel. Never assume dollars.
- Where a metric is marked [lower is better] (cost per conversion, CPC, CPM, unsubscribes, average search position), treat a fall as an improvement.
- Avoid generic marketing language and filler. Every sentence must carry a concrete metric or a specific, actionable instruction.
- Reference channels by what they are ("paid social", "organic search", "email") rather than naming the tools or platforms the data came from, EXCEPT where naming the platform is necessary to make a recommendation actionable (e.g. which ad platform to shift budget toward).
- Be honest about declines; frame them as issues to fix, not spin.
- Write for a busy business owner: clear, concise, professional plain English.

Produce these groups:
- executiveSummary: 2–4 sentences giving the headline story across every channel provided, tying spend and visibility to business outcomes (conversions, revenue, orders, leads) wherever both are available.
- keyWins: 2–4 bullets, each a concrete win with numbers (a rising query or page, improved position, a campaign with falling cost per conversion, higher ROAS, more sessions or conversions, growing list or audience).
- issuesDetected: 1–4 bullets naming specific declines, weaknesses, or risks with numbers (declining queries, dropping positions, campaigns with rising cost per conversion or falling ROAS, high-traffic/low-engagement pages, weak converting channels, shrinking lists). If nothing is materially wrong, return one bullet saying performance is stable.
- growthOpportunities: 2–4 bullets, each a specific near-term opportunity (a near-page-one keyword with position + impressions, a high-impression low-CTR page or ad, an efficient campaign worth more budget, an under-served device/country/audience, a product or channel outperforming its share of spend).
- recommendedActions: 3–5 prioritized, concrete next steps tied to the data above. Where budget reallocation is warranted, say which channel or campaign to move it from and to.`;

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

  // Every non-Google source arrives already projected into the neutral block
  // vocabulary, so this stays provider-agnostic: adding an integration adds a
  // section here automatically.
  const blockText = input.blocks?.length ? blocksToPromptText(input.blocks) : "";
  if (blockText) sections.push(`OTHER CONNECTED CHANNELS\n${blockText}`);

  const channelCount = (input.gsc ? 1 : 0) + (input.ga4 ? 1 : 0) + (input.blocks?.length ?? 0);
  const guidance = channelCount > 1
    ? "Multiple channels are available — correlate them and explain how they interact, rather than reporting each in isolation."
    : "Only one channel is available — analyze it directly and do not speculate about channels that are absent.";

  return `Client: ${input.clientName}
Reporting period: ${input.periodLabel}

${sections.join("\n\n")}

${guidance}

Analyze this data and produce the insight groups.`;
}

// Re-exported so callers don't need to reach into ./types for the totals shapes.
export type { Totals, Ga4Totals };
