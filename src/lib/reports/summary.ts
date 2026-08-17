// The deterministic executive summary.
//
// The previous behaviour was to show the AI's paragraph when it existed and,
// when it didn't, a near-empty apology — "a written summary needs a full period
// of data to compare against". That is the wrong trade twice over: a report
// with real spend, clicks and conversions in it was told there was nothing to
// say, and a paid-media-only report (no Search Console, no Analytics) never
// reached the summary at all because it lived inside a Google-gated page.
//
// A summary is possible from current-period figures alone. A comparison makes
// it richer; its absence does not make it impossible. So this builds one from
// whatever is measured, and answers the three questions a client actually has:
//
//   What happened?          — the figures each connected channel recorded.
//   What matters most?      — the largest measured movement, or, with no
//                             baseline, the largest measured contribution.
//   What should I watch?    — the highest-priority evidence-backed action,
//                             carrying the measurement that prompted it.
//
// The honesty rules from the rest of the interpretation layer hold: every
// figure here is read from the snapshot, nothing is computed that the report
// doesn't already show, a KPI that is null (not calculable) is skipped rather
// than read as zero, and when there genuinely isn't enough to interpret the
// summary says exactly that instead of implying otherwise.
import type { GscReportFull, Ga4ReportFull } from "@/lib/google";
import type { ReportBlock, BlockKpi } from "@/lib/integrations/blocks";
import { formatBlockValue } from "@/lib/integrations/blocks";

const fmt = (n: number) => Math.round(n).toLocaleString("en-US");
const pct1 = (n: number) => `${(n * 100).toFixed(1)}%`;

/** "2026-07-01" → "Jul 1, 2026". Unparseable input passes through. */
function fmtDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? "");
  if (!m) return iso ?? "";
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])).toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric", timeZone: "UTC",
  });
}

function deltaPct(cur: number | null | undefined, prev: number | null | undefined): number | null {
  if (cur == null || prev == null || !Number.isFinite(cur) || !Number.isFinite(prev) || prev === 0) return null;
  const d = ((cur - prev) / Math.abs(prev)) * 100;
  return Number.isFinite(d) ? d : null;
}

const abs0 = (d: number) => `${Math.abs(d) >= 10 ? Math.abs(d).toFixed(0) : Math.abs(d).toFixed(1)}%`;

/** The action the summary should point at, already chosen by priority upstream. */
export type WatchItem = { action: string; because: string } | null;

export type SummaryInput = {
  clientName: string;
  period: { start: string; end: string };
  gsc: GscReportFull | null;
  ga4: Ga4ReportFull | null;
  blocks: ReportBlock[];
  watch?: WatchItem;
};

// ── Is there anything to compare against? ───────────────────────────────────
//
// Section subtitles promised a comparison unconditionally — "compared with the
// previous period" sat above KPI cards showing no deltas at all, because the
// sources had returned no prior window. The promise has to follow the data, so
// both renderers ask these before choosing their wording.

/** True when this channel carries a previous value for at least one KPI. */
export function blockHasComparison(b: ReportBlock): boolean {
  return b.kpis.some((k) => k.previous != null && Number.isFinite(k.previous));
}

/** True when any source in the report has a previous period to compare against. */
export function hasComparison(input: {
  gsc: GscReportFull | null;
  ga4: Ga4ReportFull | null;
  blocks: ReportBlock[];
}): boolean {
  if (input.gsc?.previousTotals) return true;
  if (input.ga4?.previousTotals) return true;
  return input.blocks.some(blockHasComparison);
}

/**
 * A section subtitle that only mentions a comparison when one exists.
 *
 * `base` describes what the section shows; the comparison clause is appended
 * only when there is a previous period behind it. Returned unpunctuated, so
 * each renderer keeps its own subtitle style.
 */
export function periodSubtitle(base: string, comparison: boolean): string {
  return comparison ? `${base}, compared with the previous period` : base;
}

// ── "What happened" ─────────────────────────────────────────────────────────

function gscClause(gsc: GscReportFull): string {
  const t = gsc.totals;
  const d = deltaPct(t.clicks, gsc.previousTotals?.clicks);
  return (
    `organic search delivered ${fmt(t.clicks)} clicks from ${fmt(t.impressions)} impressions` +
    (Number.isFinite(t.position) && t.position > 0 ? ` at an average position of ${t.position.toFixed(1)}` : "") +
    (d != null ? ` (${d >= 0 ? "up" : "down"} ${abs0(d)} on the previous period)` : "")
  );
}

function ga4Clause(ga4: Ga4ReportFull): string {
  const t = ga4.totals;
  const d = deltaPct(t.sessions, ga4.previousTotals?.sessions);
  let out = `the website recorded ${fmt(t.sessions)} sessions from ${fmt(t.users)} users`;
  if (d != null) out += ` (${d >= 0 ? "up" : "down"} ${abs0(d)})`;
  if (t.conversions > 0) {
    out += `, converting ${fmt(t.conversions)} times`;
    if (t.sessions > 0) out += ` (${pct1(t.conversions / t.sessions)} of sessions)`;
    if (t.totalRevenue > 0) out += ` on ${fmt(t.totalRevenue)} in tracked revenue`;
  } else if (t.totalRevenue > 0) {
    out += ` on ${fmt(t.totalRevenue)} in tracked revenue`;
  }
  return out;
}

// Labels worth leading with, in the order a reader cares about them. A channel
// whose KPIs are none of these still gets a clause, built from its own first
// calculable metrics — nothing here is provider-specific.
const HEADLINE_LABELS = [
  "spend", "revenue", "orders", "conversions", "clicks", "roas",
  "cost per conversion", "sessions", "subscribers", "contacts", "deals",
  "calls", "followers", "views", "impressions",
];

function kpiPhrase(k: BlockKpi, currency: string | null): string {
  const value = formatBlockValue(k.value, k.format, currency);
  const label = k.label.toLowerCase();
  // "$4,200 in spend" rather than "$4,200 spend" — a money figure reads as a
  // sum, not as a count of something.
  return k.format === "currency" ? `${value} in ${label}` : `${value} ${label}`;
}

/** "a, b and c" — a list a person would read aloud, not a data dump. */
function sentenceList(parts: string[]): string {
  if (parts.length <= 1) return parts[0] ?? "";
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

function blockClause(b: ReportBlock): string | null {
  const usable = b.kpis.filter((k) => k.value !== null && Number.isFinite(k.value));
  if (usable.length === 0) return null;
  const rank = (k: BlockKpi) => {
    const i = HEADLINE_LABELS.indexOf(k.label.toLowerCase());
    return i === -1 ? HEADLINE_LABELS.length : i;
  };
  const picked = [...usable].sort((a, z) => rank(a) - rank(z)).slice(0, 3);
  return `${b.sourceName} recorded ${sentenceList(picked.map((k) => kpiPhrase(k, b.currency)))}`;
}

// ── "What matters most" ─────────────────────────────────────────────────────

type Movement = { label: string; value: string; delta: number; good: boolean; lowerBetter: boolean };

function movements(input: SummaryInput): Movement[] {
  const out: Movement[] = [];
  const push = (
    label: string,
    cur: number | null | undefined,
    prev: number | null | undefined,
    value: string,
    lowerBetter = false,
  ) => {
    const d = deltaPct(cur, prev);
    if (d == null || Math.abs(d) < 5) return;
    out.push({ label, value, delta: d, good: lowerBetter ? d < 0 : d > 0, lowerBetter });
  };

  const { gsc, ga4 } = input;
  if (gsc) {
    push("organic clicks", gsc.totals.clicks, gsc.previousTotals?.clicks, fmt(gsc.totals.clicks));
    push("search impressions", gsc.totals.impressions, gsc.previousTotals?.impressions, fmt(gsc.totals.impressions));
    push("average click-through rate", gsc.totals.ctr, gsc.previousTotals?.ctr, pct1(gsc.totals.ctr));
    push("average search position", gsc.totals.position, gsc.previousTotals?.position, gsc.totals.position.toFixed(1), true);
  }
  if (ga4) {
    push("sessions", ga4.totals.sessions, ga4.previousTotals?.sessions, fmt(ga4.totals.sessions));
    push("users", ga4.totals.users, ga4.previousTotals?.users, fmt(ga4.totals.users));
    push("conversions", ga4.totals.conversions, ga4.previousTotals?.conversions, fmt(ga4.totals.conversions));
    if (ga4.totals.totalRevenue > 0) {
      push("tracked revenue", ga4.totals.totalRevenue, ga4.previousTotals?.totalRevenue, fmt(ga4.totals.totalRevenue));
    }
  }
  for (const b of input.blocks) {
    for (const k of b.kpis) {
      push(
        `${b.sourceName} ${k.label.toLowerCase()}`,
        k.value,
        k.previous,
        formatBlockValue(k.value, k.format, b.currency),
        k.lowerBetter === true,
      );
    }
  }
  return out.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
}

/**
 * With no baseline to compare against, the most useful second sentence is where
 * the volume actually sits — which channel or source carried the period.
 */
function contribution(input: SummaryInput): string | null {
  const src = input.ga4?.trafficSources ?? [];
  const total = src.reduce((a, t) => a + t.sessions, 0);
  if (src[0] && src[0].sessions > 0 && total > 0) {
    return `${src[0].key} was the largest source of traffic at ${Math.round((src[0].sessions / total) * 100)}% of sessions (${fmt(src[0].sessions)}).`;
  }
  const top = input.gsc?.topQueries?.[0];
  if (top && top.clicks > 0) {
    return `The single biggest search driver was “${top.key}” with ${fmt(top.clicks)} clicks at position ${top.position.toFixed(1)}.`;
  }
  const paid = input.blocks
    .map((b) => ({ b, spend: b.kpis.find((k) => k.label.toLowerCase() === "spend")?.value ?? null }))
    .filter((x): x is { b: ReportBlock; spend: number } => x.spend != null && x.spend > 0)
    .sort((a, z) => z.spend - a.spend);
  if (paid.length > 1) {
    const total = paid.reduce((a, x) => a + x.spend, 0);
    return `${paid[0].b.sourceName} took the largest share of spend at ${Math.round((paid[0].spend / total) * 100)}% of the ${formatBlockValue(total, "currency", paid[0].b.currency)} invested across paid channels.`;
  }
  return null;
}

// ── Assembly ────────────────────────────────────────────────────────────────

export type ExecutiveSummary = {
  /** The full paragraph, ready to render. */
  text: string;
  /** True when the data was too thin to interpret and the text says so. */
  limited: boolean;
};

/**
 * Builds the summary paragraph from measured data only.
 *
 * Never returns an empty string: with no channel figures at all it states that
 * plainly, which is a fact about the period rather than an apology for the
 * report.
 */
export function buildExecutiveSummary(input: SummaryInput): ExecutiveSummary {
  const clauses: string[] = [];
  if (input.gsc) clauses.push(gscClause(input.gsc));
  if (input.ga4) clauses.push(ga4Clause(input.ga4));

  const blockClauses = input.blocks.map(blockClause).filter((c): c is string => c !== null);
  clauses.push(...blockClauses.slice(0, 3));
  const extra = blockClauses.length - 3;

  if (clauses.length === 0) {
    return {
      text:
        `No performance data was recorded for ${input.clientName} between ${fmtDate(input.period.start)} and ${fmtDate(input.period.end)}. ` +
        `The connected sources returned no results for this period — see the note on data coverage below.`,
      limited: true,
    };
  }

  const sentences: string[] = [
    `Between ${fmtDate(input.period.start)} and ${fmtDate(input.period.end)}, ${clauses.join("; ")}` +
      (extra > 0 ? `, with ${extra} further channel${extra === 1 ? "" : "s"} detailed below` : "") +
      `.`,
  ];

  const moves = movements(input);
  const hasBaseline = hasComparison(input);

  if (moves[0]) {
    const m = moves[0];
    // A lower-is-better metric reads wrong as "down 14%", so it is described as
    // improving or worsening instead of by direction.
    const change = m.lowerBetter
      ? `${m.good ? "improved" : "worsened"} ${abs0(m.delta)} to ${m.value}`
      : `${m.delta >= 0 ? "rose" : "fell"} ${abs0(m.delta)} to ${m.value}`;
    sentences.push(`The biggest change was ${m.label}, which ${change}.`);
  } else {
    // No movement to report. What that means depends on why: without a
    // baseline there is nothing to compare against, and saying so once is
    // enough — the alternative wording implied a comparison had been made and
    // found nothing.
    const contrib = contribution(input);
    const note = hasBaseline
      ? `No metric moved materially against the previous period.`
      : `Figures are shown for this period only, as there is no comparable previous period.`;
    sentences.push(contrib ? `${note} ${contrib}` : note);
  }

  if (input.watch) {
    sentences.push(`The priority from here: ${input.watch.because} ${input.watch.action}`);
  }

  // Figures, but nothing to read into them: no movement to report and no
  // evidence-backed action. Saying so plainly is better than a summary that
  // trails off, and better than implying a conclusion the data can't carry.
  const limited = moves.length === 0 && !input.watch;
  if (limited) {
    sentences.push(`Activity in this period is too limited to draw firm conclusions from.`);
  }

  return { text: sentences.join(" "), limited };
}
