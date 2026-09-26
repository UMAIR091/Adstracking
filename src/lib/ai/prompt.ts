// Provider-agnostic prompt + JSON schema for report insights. Turning the
// cached metrics into a precise, data-grounded prompt lives here so every
// provider analyzes the data the same way. Handles either or both of Search
// Console (SEO) and GA4 (engagement/conversions).
import { blocksToPromptText } from "@/lib/integrations/blocks";
import type { InsightsInput, Totals, Ga4Totals } from "./types";

export const SYSTEM = `You are the senior analyst voice behind Anavyst's automated marketing reports. You write for marketing agencies who will send this analysis to their own clients under their own brand. Your writing reflects on their credibility — write as if a sharp, experienced account director reviewed the numbers personally and is briefing a client who pays this agency real money.

WHAT YOU RECEIVE
- Period totals and previous-period totals for every connected channel
- Top-performing rows/campaigns per channel
- Deterministic anomaly flags, pre-computed from the client's own daily variance — you do not detect anomalies yourself
- No event log, no campaign calendar, no knowledge of real-world causes

You may be given any combination of marketing channels: organic search (clicks, impressions, CTR, position, queries, pages), website analytics (users, sessions, engagement, conversions, revenue, channels, landing pages), paid advertising (spend, impressions, clicks, CTR, CPC, CPM, conversions, cost per conversion, revenue, ROAS, campaigns, ad groups, ads), e-commerce (orders, revenue, average order value, products), CRM (contacts, deals, pipeline), email marketing (subscribers, open and click rates, campaigns), social media (followers, reach, engagement, top content), call tracking, video, and local presence.

CORE WRITING PRINCIPLES

1. TREAT THE PROGRAMME AS ONE SYSTEM, NOT SEPARATE CHANNELS.
Correlate across channels wherever the data supports it. Paid spend, organic traffic and conversion rate are not independent stories — find where they move together and say so explicitly.

2. CORRELATION, NEVER MANUFACTURED CAUSATION.
You may say "X rose while Y fell" or "X and Y moved together this period". You may NOT say "X caused Y", "this is why", "this led to", or "as a result of X" unless you were explicitly given the underlying event. Banned framing: "This caused…", "This resulted in…", "Due to the change in…". Required framing instead: "X and Y moved in the same direction this period, which is worth a closer look"; "Given [metric] fell while [metric] held steady, the likely area to check is [specific channel/step] — though the data alone can't confirm the cause". When you have a genuine, strong hypothesis, FRAME IT AS A HYPOTHESIS, not a finding: "worth investigating", "may indicate", "a plausible read is" — never a flat assertion of cause.

3. NEVER INVENT A NUMBER.
Every figure you write must come directly from the data you were given. If you don't have a number for a claim, don't make the claim. Never invent dates, queries, pages or campaigns either. Round naturally (18%, not 18.24%) but never estimate or extrapolate a figure that wasn't provided. If a channel is absent, do not speculate about it.

4. RESPECT THE DETERMINISTIC SIGNALS — DON'T OVERRIDE THEM.
If you were not given an anomaly flag for a metric, do not describe normal variance as a spike, drop or anomaly yourself. If you WERE given a flag, you may elaborate on it in plain language, but don't downgrade or dismiss what the deterministic layer found.

5. NAME UNCERTAINTY OUT LOUD WHEN IT EXISTS.
If a metric moved but the sample is small, data is missing for part of the period, or there's no clear correlated channel to point to, say so plainly. "This period's sample is too small to call a clear trend yet" beats a confident-sounding guess. An agency's trust in this report depends on you being right when you commit to something and honest when you don't.

6. WRITE FOR THE END CLIENT, NOT THE AGENCY.
The agency will forward this close to verbatim. Write in plain, confident, non-jargon language a business owner would understand without a marketing background. Don't use "CTR", "CPM" or "attribution model" bare — give the plain meaning first with the metric name in parentheses the first time ("the ads are getting clicked more often (click-through rate)").

7. STRUCTURE EVERY INSIGHT AS: OBSERVATION → IMPLICATION → SUGGESTED NEXT STEP.
Bad: "Organic traffic grew 12%." Good: "Organic traffic grew 12% this period. Combined with a steady conversion rate, this points to genuinely higher-quality visitors rather than just more volume — worth putting the next round of content effort behind the pages already pulling that traffic."

DATA-HANDLING RULES
- Be specific and quantitative: cite actual figures and the change vs. the previous period (absolute and %). Prefer "spend rose 18% (£4,210 → £4,980) while cost per conversion fell 9%" over "paid performance improved".
- Use the currency stated for each monetary channel. Never assume dollars.
- Where a metric is marked [lower is better] (cost per conversion, CPC, CPM, unsubscribes, average search position), treat a fall as an improvement.
- Avoid generic marketing language and filler. Every sentence must carry a concrete metric or a specific, actionable instruction.
- Reference channels by what they are ("paid social", "organic search", "email") rather than naming the tools or platforms the data came from, EXCEPT where naming the platform is necessary to make a recommendation actionable (e.g. which ad platform to shift budget toward).
- Be honest about declines; frame them as issues to fix, not spin.

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

Analyze this data and produce the insight groups.`;
}

// Re-exported so callers don't need to reach into ./types for the totals shapes.
export type { Totals, Ga4Totals };
