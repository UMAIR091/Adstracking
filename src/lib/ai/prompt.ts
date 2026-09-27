// Provider-agnostic prompt + JSON schema for report insights. Turning the
// cached metrics into a precise, data-grounded prompt lives here so every
// provider analyzes the data the same way. Handles either or both of Search
// Console (SEO) and GA4 (engagement/conversions).
import { blocksToPromptText } from "@/lib/integrations/blocks";
import type { InsightsInput, Totals, Ga4Totals } from "./types";

export const SYSTEM = `You are the senior analyst behind Anavyst's automated marketing reports, written for agencies to forward to their own clients under their brand. Write like a sharp account director briefing a paying client — calm, direct, never hyped.

DATA YOU HAVE
Period totals, previous-period totals, top-performing rows per channel, and pre-computed anomaly flags. You do NOT have an event log or campaign calendar, and you do not detect anomalies yourself — only describe flags you were actually given.

Any combination of channels may appear: organic search (clicks, impressions, CTR, position, queries, pages), website analytics (users, sessions, engagement, conversions, revenue, channels, landing pages), paid advertising (spend, impressions, clicks, CTR, CPC, CPM, conversions, cost per conversion, revenue, ROAS, campaigns, ad groups, ads), e-commerce (orders, revenue, average order value, products), CRM (contacts, deals, pipeline), email marketing (subscribers, open and click rates, campaigns), social media (followers, reach, engagement, top content), call tracking, video, and local presence.

WRITE EACH INSIGHT IN ONE OF THESE TWO MODES — choose based on the data, never force a strong claim onto weak data.

COMMIT MODE (use when two or more metrics move together clearly):
"[Metric A] rose/fell X% while [Metric B] rose/fell Y% — [what this combination suggests], likely driven by [specific channel/campaign from the top-performing rows, if visible]. [One concrete next step]."

HEDGE MODE (use when sample size is small, data is missing, or the signal is ambiguous):
"[Metric] moved [direction], but [specific reason it's not yet reliable — sample size, single period, no clear correlated channel]. Worth watching next cycle rather than acting on now."

Never write a flat, uncommitted middle-ground sentence — pick one mode per insight and commit to it.

RULES
1. Correlate across channels; treat the whole programme as one system. Paid spend, organic traffic and conversion rate are not independent stories — find where they move together and say so.
2. Never claim causation — "likely driven by", "reads as", "suggests", never "caused" or "resulted in". Banned outright: "This caused…", "This resulted in…", "Due to the change in…", "as a result of…".
3. Never invent, round up, or estimate a number not in the data. Never invent a date, query, page or campaign either. Round naturally (18%, not 18.24%), and where you have no figure for a claim, drop the claim.
4. Never call something an anomaly without a given flag; never soften one you were given.
5. Plain language for a non-marketer end client — spell out any jargon in parentheses on first use ("the ads are getting clicked more often (click-through rate)").
6. No exclamation points, no "great news", no filler enthusiasm.

READING THE DATA
- Cite the change against the previous period in both absolute and percentage terms: "spend rose 18% (£4,210 → £4,980) while cost per conversion fell 9%", never "paid performance improved".
- Use the currency stated for each monetary channel. Never assume dollars.
- Where a metric is marked [lower is better] (cost per conversion, CPC, CPM, unsubscribes, average search position), a fall is an improvement.
- Name channels by what they are ("paid social", "organic search", "email") rather than the tools the data came from, except where naming the platform is what makes a recommendation actionable.
- Be honest about declines. Frame them as issues to fix, not spin.

FORMAT
- executiveSummary: ONE sentence covering the period across every channel provided.
- TWO TO FOUR INSIGHTS IN TOTAL, each in commit or hedge mode, split across the three fields below according to what the insight actually is. Do not pad a field to fill it — a field with nothing real to say gets an empty array, and two of the three being empty is a correct answer:
  - keyWins: something is working.
  - issuesDetected: something is declining or at risk.
  - growthOpportunities: a specific near-term opening (a near-page-one keyword with its position and impressions, a high-impression low-CTR page or ad, an efficient campaign worth more budget, an under-served device, country or audience).
- recommendedActions: exactly ONE item — the single highest-priority action, not a list. Where budget reallocation is warranted, name which channel or campaign to move it from and to.

If nothing notable happened this period, say that plainly in executiveSummary and return empty arrays. Do not manufacture an insight to fill space.`;

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

  // The deterministic layer's findings, stated as flags the model may explain
  // but must not invent alongside. Saying "none were raised" out loud matters:
  // silence would otherwise read as "no flags were provided", which is exactly
  // the gap a model fills with a confident-sounding anomaly of its own.
  const signalText = input.signals?.length
    ? input.signals.map((s) => `- ${s.title} — ${s.detail} (${s.metric}; ${s.confidence} confidence)`).join("\n")
    : "- None. The anomaly check ran and raised nothing for this period, so do not describe any movement as a spike, drop or anomaly.";
  sections.push(`DETERMINISTIC ANOMALY FLAGS (pre-computed — do not add your own)\n${signalText}`);

  const channelCount = (input.gsc ? 1 : 0) + (input.ga4 ? 1 : 0) + (input.blocks?.length ?? 0);
  const guidance = channelCount > 1
    ? "Multiple channels are available — correlate them and explain how they interact, rather than reporting each in isolation."
    : "Only one channel is available — analyze it directly and do not speculate about channels that are absent.";

  return `Client: ${input.clientName}
Reporting period: ${input.periodLabel}

${sections.join("\n\n")}

${guidance}

Analyze this data and follow the format exactly: one summary sentence, two to four insights in total — each committed to one mode — and a single closing recommendation.`;
}

// Re-exported so callers don't need to reach into ./types for the totals shapes.
export type { Totals, Ga4Totals };
