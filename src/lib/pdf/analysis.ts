// Derived analytics for the executive dashboard and forecast sections. Pure,
// deterministic functions over the cached report snapshot — no AI calls, no
// fabricated numbers: everything here is arithmetic on real data, labeled as
// projection where it projects.
import type { GscReportFull, Ga4ReportFull } from "@/lib/google";
import { deltaPct } from "./format";

// ── Overall performance score (0–100) ────────────────────────────────────────
// Weighted average of period-over-period movement across the key metrics,
// centered on 50 (= flat period). Purely a readability device for executives;
// the underlying deltas are all shown next to it.
export type Score = { score: number; label: string };

export function performanceScore(gsc: GscReportFull | null, ga4: Ga4ReportFull | null): Score | null {
  const parts: { delta: number; weight: number }[] = [];
  const push = (cur: number, prev: number | null | undefined, weight: number, lowerBetter = false) => {
    const d = deltaPct(cur, prev);
    if (d == null) return;
    parts.push({ delta: Math.max(-60, Math.min(60, lowerBetter ? -d : d)), weight });
  };
  if (gsc) {
    push(gsc.totals.clicks, gsc.previousTotals?.clicks, 1.0);
    push(gsc.totals.impressions, gsc.previousTotals?.impressions, 0.5);
    push(gsc.totals.ctr, gsc.previousTotals?.ctr, 0.7);
    push(gsc.totals.position, gsc.previousTotals?.position, 0.7, true);
  }
  if (ga4) {
    push(ga4.totals.sessions, ga4.previousTotals?.sessions, 1.0);
    push(ga4.totals.users, ga4.previousTotals?.users, 0.8);
    push(ga4.totals.engagementRate, ga4.previousTotals?.engagementRate, 0.7);
    push(ga4.totals.conversions, ga4.previousTotals?.conversions, 1.3);
    if (ga4.totals.totalRevenue > 0) push(ga4.totals.totalRevenue, ga4.previousTotals?.totalRevenue, 1.5);
  }
  if (parts.length < 2) return null;
  const wsum = parts.reduce((a, p) => a + p.weight, 0);
  const avg = parts.reduce((a, p) => a + p.delta * p.weight, 0) / wsum;
  const score = Math.round(Math.max(4, Math.min(98, 50 + avg * 0.9)));
  const label = score >= 75 ? "Excellent" : score >= 60 ? "Strong" : score >= 45 ? "Steady" : score >= 30 ? "Mixed" : "Needs attention";
  return { score, label };
}

// ── Dashboard tiles: best channel / biggest opportunity / biggest risk ───────
export type Tile = { title: string; value: string; sub: string };

export function bestChannel(ga4: Ga4ReportFull | null): Tile | null {
  const src = ga4?.trafficSources?.[0];
  if (!src || src.sessions <= 0) return null;
  const total = ga4!.trafficSources!.reduce((a, t) => a + t.sessions, 0) || 1;
  return {
    title: "Best Performing Channel",
    value: src.key,
    sub: `${Math.round((src.sessions / total) * 100)}% of sessions (${src.sessions.toLocaleString("en-US")})`,
  };
}

export function biggestOpportunity(gsc: GscReportFull | null, aiOpportunities: string[]): Tile | null {
  const opp = gsc?.movers?.opportunities?.[0];
  if (opp) {
    return {
      title: "Biggest Opportunity",
      value: `“${opp.key}”`,
      sub: `Position ${opp.position.toFixed(1)} with ${opp.impressions.toLocaleString("en-US")} impressions — just off page one`,
    };
  }
  if (aiOpportunities.length > 0) {
    return { title: "Biggest Opportunity", value: firstClause(aiOpportunities[0], 44), sub: rest(aiOpportunities[0], 90) };
  }
  return null;
}

export function biggestRisk(gsc: GscReportFull | null, aiIssues: string[]): Tile | null {
  const dec = gsc?.movers?.decliners?.[0];
  if (dec && dec.changePct < -10) {
    return {
      title: "Biggest Risk",
      value: `“${dec.key}”`,
      sub: `Clicks down ${Math.abs(dec.changePct).toFixed(0)}% vs the previous period`,
    };
  }
  if (aiIssues.length > 0) {
    return { title: "Biggest Risk", value: firstClause(aiIssues[0], 44), sub: rest(aiIssues[0], 90) };
  }
  return null;
}

// ── Insight card parsing ─────────────────────────────────────────────────────
// AI insights are stored as plain sentences. For scannable cards, split each
// into a short lead (first clause/sentence) and the remaining explanation.
export type InsightCardData = { lead: string; body: string };

function splitAt(s: string): number {
  // Prefer sentence end, then em-dash, then comma — earliest reasonable break.
  const candidates = [s.indexOf(". "), s.indexOf(" — "), s.indexOf("; ")].filter((i) => i > 20 && i < 90);
  if (candidates.length > 0) return Math.min(...candidates);
  return -1;
}

export function toInsightCard(s: string): InsightCardData {
  const i = splitAt(s);
  if (i === -1) return { lead: s, body: "" };
  const sep = s.slice(i, i + 3);
  const lead = s.slice(0, i + (sep.startsWith(".") || sep.startsWith(";") ? 1 : 0)).trim();
  const body = s.slice(i + (sep.startsWith(" — ") ? 3 : 2)).trim();
  return { lead, body };
}

function firstClause(s: string, max: number): string {
  const i = splitAt(s);
  const head = i === -1 ? s : s.slice(0, i);
  return head.length > max ? `${head.slice(0, max - 1)}…` : head;
}

function rest(s: string, max: number): string {
  const i = splitAt(s);
  const tail = i === -1 ? "" : s.slice(i + 2).trim();
  const t = tail || s;
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

// ── Recommended-action metadata (rank-derived, not fabricated) ───────────────
// The AI returns actions already ordered by priority; surface that ordering as
// explicit priority levels, classify the focus area from the action text, and
// map that focus to an expected-impact level (revenue/conversion work carries
// the most business weight). Priority = urgency/order; impact = business lever —
// deliberately independent so the two badges add information rather than repeat.
export type Level = "High" | "Medium" | "Low";
export type ActionMeta = { priority: Level; impact: Level; focus: string };

const FOCUS_IMPACT: Record<string, Level> = {
  Revenue: "High",
  Conversion: "High",
  "SEO & Content": "Medium",
  Advertising: "Medium",
  "Site Experience": "Medium",
  Growth: "Low",
};

export function actionMeta(text: string, index: number, total: number): ActionMeta {
  const priority: Level = index === 0 ? "High" : index < Math.min(3, total - 1) ? "Medium" : "Low";
  const t = text.toLowerCase();
  const focus =
    /revenue|sale|checkout|cart|purchas|pric/.test(t) ? "Revenue" :
    /convert|conversion|lead|form|cta|signup|email|newsletter|flow/.test(t) ? "Conversion" :
    /rank|keyword|seo|search|meta |title tag|backlink|interlink|content|blog|guide|page one/.test(t) ? "SEO & Content" :
    /speed|layout|mobile|tablet|ux|bug|fix|render/.test(t) ? "Site Experience" :
    /ad |ads|campaign|social|paid/.test(t) ? "Advertising" :
    "Growth";
  return { priority, impact: FOCUS_IMPACT[focus] ?? "Medium", focus };
}

// ── Forecast (linear trend projection) ───────────────────────────────────────
// Ordinary least squares over the daily series, projected over the next window
// of equal length. Confidence maps from R². Requires ≥ 14 days of data.
type Fit = { projected: number; growthPct: number; r2: number };

function linProject(values: number[]): Fit | null {
  const n = values.length;
  if (n < 14) return null;
  const xs = values.map((_, i) => i);
  const mx = (n - 1) / 2;
  const my = values.reduce((a, b) => a + b, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) {
    sxy += (xs[i] - mx) * (values[i] - my);
    sxx += (xs[i] - mx) ** 2;
    syy += (values[i] - my) ** 2;
  }
  if (sxx === 0 || syy === 0) return null;
  const b = sxy / sxx;
  const a = my - b * mx;
  let projected = 0;
  for (let x = n; x < 2 * n; x++) projected += Math.max(0, a + b * x);
  const current = values.reduce((s, v) => s + v, 0);
  if (current <= 0) return null;
  const r2 = (sxy * sxy) / (sxx * syy);
  return { projected, growthPct: ((projected - current) / current) * 100, r2 };
}

export type Forecast = {
  days: number;
  confidence: "High" | "Moderate" | "Low";
  items: { label: string; icon: string; current: number; projected: number; growthPct: number }[];
  narrative: string;
};

export function buildForecast(gsc: GscReportFull | null, ga4: Ga4ReportFull | null): Forecast | null {
  const items: Forecast["items"] = [];
  const r2s: number[] = [];
  const days = Math.max(gsc?.byDate?.length ?? 0, ga4?.byDate?.length ?? 0);

  const sessionsFit = ga4 ? linProject(ga4.byDate.map((d) => d.sessions)) : null;
  if (sessionsFit && ga4) {
    items.push({ label: "Traffic (sessions)", icon: "activity", current: ga4.totals.sessions, projected: sessionsFit.projected, growthPct: sessionsFit.growthPct });
    r2s.push(sessionsFit.r2);
    // Conversions & revenue follow sessions at the current period's rates —
    // a rate-based projection, not an independent trend.
    if (ga4.totals.sessions > 0 && ga4.totals.conversions > 0) {
      const rate = ga4.totals.conversions / ga4.totals.sessions;
      items.push({ label: "Conversions", icon: "checkCircle", current: ga4.totals.conversions, projected: sessionsFit.projected * rate, growthPct: sessionsFit.growthPct });
    }
    if (ga4.totals.sessions > 0 && ga4.totals.totalRevenue > 0) {
      const perSession = ga4.totals.totalRevenue / ga4.totals.sessions;
      items.push({ label: "Revenue", icon: "dollar", current: ga4.totals.totalRevenue, projected: sessionsFit.projected * perSession, growthPct: sessionsFit.growthPct });
    }
  }
  const clicksFit = gsc ? linProject(gsc.byDate.map((d) => d.clicks)) : null;
  if (clicksFit && gsc) {
    items.push({ label: "Organic clicks", icon: "clicks", current: gsc.totals.clicks, projected: clicksFit.projected, growthPct: clicksFit.growthPct });
    r2s.push(clicksFit.r2);
  }
  if (items.length === 0) return null;

  const avgR2 = r2s.reduce((a, b) => a + b, 0) / r2s.length;
  const confidence = avgR2 >= 0.55 ? "High" : avgR2 >= 0.25 ? "Moderate" : "Low";
  const lead = items[0];
  const dir = lead.growthPct >= 1 ? "an upward" : lead.growthPct <= -1 ? "a downward" : "a flat";
  const narrative =
    `Projection based on the linear trend of the last ${days} days of data, extended over the next ${days} days. ` +
    `The current trajectory is ${dir} trend${Math.abs(lead.growthPct) >= 1 ? ` of about ${Math.abs(lead.growthPct).toFixed(0)}%` : ""}. ` +
    `Confidence is ${confidence.toLowerCase()} (based on how consistently the daily data follows the trend). ` +
    `Projections assume current conditions continue and are not a guarantee of results.`;
  return { days, confidence, items, narrative };
}
