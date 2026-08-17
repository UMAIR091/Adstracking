// Deterministic insight signals.
//
// This module is the answer to "surface more AI without inventing anything".
// Every signal here is COMPUTED from the cached snapshot — not asked of a
// language model — so each number shown traces back to a row Google returned.
// The AI narrative sits alongside these as prose; the facts come from here.
//
// That split matters for trust. A model asked to "find anomalies" will happily
// produce a confident-sounding one from noise. Arithmetic can't: a spike is a
// spike only if it clears a threshold measured against the client's own
// variance, and when the data is too thin to support that claim we say so
// rather than lowering the bar.
//
// Pure: no React, no database, no network. Safe to import from client
// components (it only `import type`s from lib/google).
import type { GscReportFull, GscDay } from "@/lib/google";
import type { Ga4ReportFull } from "@/lib/google";

export type SignalKind =
  | "winning_keyword"
  | "declining_keyword"
  | "winning_page"
  | "opportunity"
  | "traffic_spike"
  | "traffic_drop"
  | "conversion_opportunity";

/** How much weight the reader should put on a signal. Always derived. */
export type Confidence = "high" | "medium" | "low";

export type Signal = {
  kind: SignalKind;
  /** Short headline, safe to render as-is. */
  title: string;
  /** One sentence of plain English. Every figure in it is real. */
  detail: string;
  /** The headline figure, preformatted. */
  metric: string;
  /** Period-over-period change where one is defined. */
  changePct: number | null;
  confidence: Confidence;
  /** WHY the confidence is what it is — the trust-building half. */
  confidenceReason: string;
  /** Which data the signal was derived from. */
  source: "Search Console" | "Analytics";
  /** Optional owner, e.g. the client name when signals span a workspace. */
  context?: string;
  /** Ranking weight; higher surfaces first. */
  weight: number;
};

/** Tags every signal with the client it belongs to, for workspace-wide views. */
export function withContext(signals: Signal[], context: string): Signal[] {
  return signals.map((s) => ({ ...s, context }));
}

const pct = (n: number) => `${n > 0 ? "+" : ""}${n.toFixed(0)}%`;
const num = (n: number) => Math.round(n).toLocaleString();

// ── Confidence model ─────────────────────────────────────────
//
// Confidence answers "how likely is this to still be true next week?", and the
// honest inputs are sample size and effect size. A 300% jump on 4 clicks is
// noise; a 12% rise on 9,000 is not. Thresholds are deliberately conservative —
// over-claiming once costs more trust than under-claiming ten times.
function volumeConfidence(volume: number, changeMagnitude: number): { level: Confidence; reason: string } {
  if (volume >= 500 && changeMagnitude >= 10) {
    return { level: "high", reason: `Based on ${num(volume)} clicks — a large enough sample for the trend to be reliable.` };
  }
  if (volume >= 100) {
    return { level: "medium", reason: `Based on ${num(volume)} clicks. Directionally sound, worth confirming next period.` };
  }
  return { level: "low", reason: `Based on only ${num(volume)} clicks — too small to read as a trend yet.` };
}

// ── Daily-series statistics ──────────────────────────────────
function mean(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}

function stdDev(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1));
}

/**
 * Finds the single most extreme day in a daily series.
 *
 * Uses a z-score against the *other* days, so an outlier isn't diluted by
 * being included in its own baseline. Requires at least 14 days: below that a
 * standard deviation is meaningless and every busy Tuesday looks like an event.
 */
function extremeDay(days: GscDay[]): { day: GscDay; z: number; baseline: number } | null {
  if (days.length < 14) return null;

  let best: { day: GscDay; z: number; baseline: number } | null = null;
  for (let i = 0; i < days.length; i++) {
    const others = days.filter((_, j) => j !== i).map((d) => d.clicks);
    const baseline = mean(others);

    // Floor the deviation at sqrt(baseline). Daily clicks are count data, whose
    // variance is approximately its mean (Poisson), so this is the smallest
    // spread the series could plausibly have. Without the floor a perfectly
    // steady site divides by zero on its own outlier — the one day we most want
    // to catch — and the spike is silently skipped. On noisy data the observed
    // deviation is larger and the floor never binds.
    const sd = Math.max(stdDev(others), Math.sqrt(Math.max(baseline, 1)));

    const z = (days[i].clicks - baseline) / sd;
    if (!best || Math.abs(z) > Math.abs(best.z)) best = { day: days[i], z, baseline };
  }
  return best;
}

/** True when every named field is a usable finite number. */
function complete<T extends object>(row: T, keys: string[]): boolean {
  return keys.every((k) => Number.isFinite((row as Record<string, unknown>)[k] as number));
}

const fmtDate = (iso: string) => {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? iso : d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
};

/**
 * Derives every signal supported by the data present.
 *
 * Sources that aren't connected simply contribute nothing — there is no
 * placeholder signal, and no signal is emitted when its underlying rows are
 * missing. An empty array is a valid, honest result.
 */
export function detectSignals(
  gsc: GscReportFull | null | undefined,
  ga4: Ga4ReportFull | null | undefined,
  limit = 6
): Signal[] {
  const out: Signal[] = [];

  if (gsc) {
    const movers = gsc.movers;

    // Winning keywords — real current-vs-previous comparison from sync.
    for (const w of (movers?.winners ?? []).slice(0, 2)) {
      // A row missing any of its numbers cannot produce an honest sentence, and
      // must not crash a client-facing PDF either. normalizeReportData accepts
      // legacy stored shapes, so this guards reports written before a field
      // existed rather than trusting every row to be complete.
      if (!complete(w, ["clicks", "prevClicks", "changePct", "position"])) continue;
      if (w.clicks <= 0) continue;
      const c = volumeConfidence(w.clicks, Math.abs(w.changePct));
      out.push({
        kind: "winning_keyword",
        title: `"${w.key}" is growing`,
        detail: `Clicks rose from ${num(w.prevClicks)} to ${num(w.clicks)} period over period, at an average position of ${w.position.toFixed(1)}.`,
        metric: pct(w.changePct),
        changePct: w.changePct,
        confidence: c.level,
        confidenceReason: c.reason,
        source: "Search Console",
        weight: 70 + Math.min(w.clicks / 50, 20),
      });
    }

    // Declining keywords — the half most tools bury.
    for (const d of (movers?.decliners ?? []).slice(0, 2)) {
      if (!complete(d, ["clicks", "prevClicks", "changePct", "position"])) continue;
      if (d.prevClicks <= 0) continue;
      const c = volumeConfidence(Math.max(d.prevClicks, d.clicks), Math.abs(d.changePct));
      out.push({
        kind: "declining_keyword",
        title: `"${d.key}" is losing clicks`,
        detail: `Down from ${num(d.prevClicks)} to ${num(d.clicks)} clicks, now averaging position ${d.position.toFixed(1)}.`,
        metric: pct(d.changePct),
        changePct: d.changePct,
        confidence: c.level,
        confidenceReason: c.reason,
        source: "Search Console",
        weight: 75 + Math.min(d.prevClicks / 50, 20),
      });
    }

    // Growth opportunities — queries ranking just off page one with real
    // impression volume, i.e. demand already proven to exist.
    for (const o of (movers?.opportunities ?? []).slice(0, 2)) {
      if (!complete(o, ["clicks", "impressions", "position"])) continue;
      if (o.impressions <= 0) continue;
      const c = volumeConfidence(o.impressions / 10, 15);
      out.push({
        kind: "opportunity",
        title: `"${o.key}" is close to page one`,
        detail: `Position ${o.position.toFixed(1)} on ${num(o.impressions)} impressions but only ${num(o.clicks)} clicks — moving it up converts demand that already exists.`,
        metric: `#${o.position.toFixed(1)}`,
        changePct: null,
        confidence: c.level,
        confidenceReason: `Ranking and impressions are measured directly; the upside is an estimate, not a promise.`,
        source: "Search Console",
        weight: 80 + Math.min(o.impressions / 500, 15),
      });
    }

    // Best-performing page, by actual clicks.
    const topPage = [...(gsc.topPages ?? [])].sort((a, b) => b.clicks - a.clicks)[0];
    if (topPage && topPage.clicks > 0) {
      const share = gsc.totals.clicks > 0 ? (topPage.clicks / gsc.totals.clicks) * 100 : 0;
      const c = volumeConfidence(topPage.clicks, 0);
      out.push({
        kind: "winning_page",
        title: "Top performing page",
        detail: `${topPage.key} drew ${num(topPage.clicks)} clicks — ${share.toFixed(0)}% of all organic traffic, at position ${topPage.position.toFixed(1)}.`,
        metric: num(topPage.clicks),
        changePct: null,
        confidence: c.level,
        confidenceReason: c.reason,
        source: "Search Console",
        weight: 60,
      });
    }

    // Spike / drop — statistical, not editorial.
    const ex = extremeDay(gsc.byDate ?? []);
    if (ex && Math.abs(ex.z) >= 2) {
      const up = ex.z > 0;
      const deltaPct = ex.baseline > 0 ? ((ex.day.clicks - ex.baseline) / ex.baseline) * 100 : 0;
      out.push({
        kind: up ? "traffic_spike" : "traffic_drop",
        title: up ? `Traffic spike on ${fmtDate(ex.day.date)}` : `Traffic dip on ${fmtDate(ex.day.date)}`,
        detail: `${num(ex.day.clicks)} clicks against a ${num(ex.baseline)}-click daily average for the period — ${Math.abs(ex.z).toFixed(1)} standard deviations from normal.`,
        metric: pct(deltaPct),
        changePct: deltaPct,
        // The z-score IS the confidence here, so it is reported as such.
        confidence: Math.abs(ex.z) >= 3 ? "high" : "medium",
        confidenceReason: `Measured against this site's own daily variation over ${gsc.byDate.length} days. Anything beyond 2 standard deviations is unlikely to be routine fluctuation.`,
        source: "Search Console",
        weight: up ? 85 : 88,
      });
    }
  }

  if (ga4) {
    const t = ga4.totals;
    const prev = ga4.previousTotals;

    // Conversion opportunity — only when there is genuinely traffic to convert.
    if (t.sessions > 0) {
      const rate = t.sessions > 0 ? (t.conversions / t.sessions) * 100 : 0;
      const prevRate = prev && prev.sessions > 0 ? (prev.conversions / prev.sessions) * 100 : null;
      const change = prevRate != null && prevRate > 0 ? ((rate - prevRate) / prevRate) * 100 : null;
      const c = volumeConfidence(t.sessions, change ? Math.abs(change) : 0);

      out.push({
        kind: "conversion_opportunity",
        title: rate > 0 ? "Conversion rate" : "Sessions aren't converting yet",
        detail:
          rate > 0
            ? `${num(t.conversions)} conversions from ${num(t.sessions)} sessions (${rate.toFixed(1)}%)${
                prevRate != null ? `, against ${prevRate.toFixed(1)}% last period` : ""
              }.`
            : `${num(t.sessions)} sessions produced no recorded conversions. If conversions aren't configured in GA4, this will read as zero regardless of performance.`,
        metric: `${rate.toFixed(1)}%`,
        changePct: change,
        confidence: c.level,
        confidenceReason: `Based on ${num(t.sessions)} sessions. Conversion tracking accuracy depends on your GA4 setup.`,
        source: "Analytics",
        weight: 78,
      });
    }
  }

  return out.sort((a, b) => b.weight - a.weight).slice(0, limit);
}

/** Groups signals for sectioned display. Order is the reading order. */
export const SIGNAL_META: Record<SignalKind, { label: string; tone: "positive" | "negative" | "neutral" | "opportunity"; icon: string }> = {
  traffic_spike: { label: "Traffic spike", tone: "positive", icon: "spike" },
  traffic_drop: { label: "Traffic drop", tone: "negative", icon: "drop" },
  winning_keyword: { label: "Winning keyword", tone: "positive", icon: "trend-up" },
  declining_keyword: { label: "Declining keyword", tone: "negative", icon: "trend-down" },
  winning_page: { label: "Winning page", tone: "positive", icon: "page" },
  opportunity: { label: "Opportunity", tone: "opportunity", icon: "target" },
  conversion_opportunity: { label: "Conversions", tone: "opportunity", icon: "conversion" },
};
