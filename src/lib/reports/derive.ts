// Reconstructing an arbitrary reporting window from cached daily data.
//
// The sync caches two snapshots per source: a 28-day and a 90-day window
// (lib/sync.ts PERIODS). Rather than fetching a new window per period option —
// which would multiply provider API calls, rate-limit pressure and stored rows
// by the number of presets — any window inside the 90-day snapshot is
// reconstructed from its daily series.
//
// WHAT CAN BE REBUILT, AND WHAT CANNOT
//
// Daily rows carry only a handful of metrics. Summable ones (clicks, sessions,
// spend, orders) add up correctly over any sub-range, and ratios (CTR, CPC,
// average position) are RECOMPUTED from those sums — never averaged, which
// would weight a quiet day the same as a busy one.
//
// Everything else is period-scoped and mathematically impossible to recover
// from daily totals:
//   · dimension breakdowns — top queries, pages, campaigns, traffic sources.
//     A day's total says nothing about which query produced it.
//   · movers (winners/decliners) — needs per-query figures for two windows.
//   · GA4 users / newUsers — unique counts. Summing daily uniques double-counts
//     anyone who visited on more than one day, so a "reconstructed" user count
//     would be silently wrong. It is reported as unavailable, not approximated.
//   · metrics absent from the daily rows entirely — GA4 conversions and
//     revenue, ad revenue (so ROAS), commerce customers, email subscribers.
//
// Those are surfaced through `unavailable`, which the report renders as an
// explicit "not available for this period" state. Nothing here is estimated.
import type { GscReportFull, Ga4ReportFull } from "@/lib/google";
import type { ReportBlock } from "@/lib/integrations/blocks";
import { dayCount } from "@/lib/reports/periods";

export type Window = { start: string; end: string };

/** A metric or section that cannot be rebuilt, with the reason to show. */
export type Unavailable = { section: string; reason: string };

export type DeriveOutcome<T> = {
  data: T | null;
  unavailable: Unavailable[];
};

const inWindow = (date: string, w: Window) => date >= w.start && date <= w.end;
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);

/** Coverage of a daily series, or null when it has no dated rows. */
export function seriesCoverage(dates: string[]): Window | null {
  const sorted = dates.filter(Boolean).slice().sort();
  return sorted.length ? { start: sorted[0], end: sorted[sorted.length - 1] } : null;
}

/** True when every day of `want` exists inside `have`. */
export function covers(have: Window | null, want: Window): boolean {
  return !!have && have.start <= want.start && have.end >= want.end;
}

/**
 * How much of the requested window the data actually spans. Used to state
 * partial coverage rather than letting a short series masquerade as a full
 * period.
 */
export function coverageWithin(dates: string[], w: Window): { covered: number; requested: number; range: Window | null } {
  const inside = dates.filter((d) => inWindow(d, w)).sort();
  return {
    covered: inside.length,
    requested: dayCount(w.start, w.end),
    range: inside.length ? { start: inside[0], end: inside[inside.length - 1] } : null,
  };
}

// ── Search Console ──────────────────────────────────────────────────────────

export function deriveGsc(full: GscReportFull | null, w: Window): DeriveOutcome<GscReportFull> {
  if (!full?.byDate?.length) return { data: null, unavailable: [] };

  const days = full.byDate.filter((d) => inWindow(d.date, w));
  if (days.length === 0) return { data: null, unavailable: [] };

  const clicks = days.reduce((a, d) => a + num(d.clicks), 0);
  const impressions = days.reduce((a, d) => a + num(d.impressions), 0);
  // Search Console's average position is impression-weighted; averaging the
  // daily figures unweighted would misreport it.
  const posWeighted = days.reduce((a, d) => a + num(d.position) * num(d.impressions), 0);

  const totals = {
    clicks,
    impressions,
    ctr: impressions > 0 ? clicks / impressions : 0,
    position: impressions > 0 ? posWeighted / impressions : 0,
  };

  return {
    data: {
      ...full,
      totals,
      byDate: days,
      // Dimension tables belong to the window the snapshot was built for, not
      // to this slice, so they are dropped rather than reused.
      topQueries: [],
      topPages: [],
      topCountries: [],
      topDevices: [],
      previousTotals: null,
      movers: null,
    },
    unavailable: [
      { section: "Top queries and pages", reason: "Search Console reports these per requested period; daily rows don't record which query produced each click." },
      { section: "Winning and declining keywords", reason: "Requires per-keyword figures for this period and the one before it, which aren't stored day by day." },
    ],
  };
}

// ── GA4 ─────────────────────────────────────────────────────────────────────

export function deriveGa4(full: Ga4ReportFull | null, w: Window): DeriveOutcome<Ga4ReportFull> {
  if (!full?.byDate?.length) return { data: null, unavailable: [] };

  const days = full.byDate.filter((d) => inWindow(d.date, w));
  if (days.length === 0) return { data: null, unavailable: [] };

  const sessions = days.reduce((a, d) => a + num(d.sessions), 0);
  const views = days.reduce((a, d) => a + num(d.views), 0);

  return {
    data: {
      ...full,
      totals: {
        ...full.totals,
        sessions,
        views,
        // Unique-visitor and engagement metrics are NOT reconstructable from
        // daily rows. Zero would read as "nobody visited", so they are zeroed
        // only alongside the explicit unavailable notice below, which the
        // report renders instead of the figures.
        users: 0,
        newUsers: 0,
        engagedSessions: 0,
        engagementRate: 0,
        avgEngagementTime: 0,
        conversions: 0,
        totalRevenue: 0,
      },
      byDate: days,
      topLandingPages: [],
      trafficSources: [],
      devices: [],
      countries: [],
      previousTotals: null,
    },
    unavailable: [
      { section: "Users and new users", reason: "These count unique people. Adding up daily uniques would count anyone who visited on more than one day twice, so they can't be rebuilt for a custom window." },
      { section: "Engagement, conversions and revenue", reason: "Analytics stores these per requested period; the daily rows hold sessions and views only." },
      { section: "Traffic sources and landing pages", reason: "Breakdowns belong to the period they were requested for and can't be split by day." },
    ],
  };
}

// ── Generic channel blocks (ads, commerce, email, …) ────────────────────────

/**
 * Blocks already carry their metrics as named daily series, so a slice sums the
 * points inside the window per series. KPIs that were period-scoped aggregates
 * are dropped: without their components there is no honest way to restate them.
 */
export function deriveBlock(block: ReportBlock, w: Window): DeriveOutcome<ReportBlock> {
  const series = block.series
    .map((s) => ({ ...s, points: s.points.filter((p) => inWindow(p.date, w)) }))
    .filter((s) => s.points.length > 0);

  if (series.length === 0) return { data: null, unavailable: [] };

  const sumOf = (label: string) => {
    const s = series.find((x) => x.label.toLowerCase() === label.toLowerCase());
    return s ? s.points.reduce((a, p) => a + num(p.value), 0) : null;
  };

  // Rebuild only the KPIs whose components are present as daily series, and
  // recompute the ratios from those sums.
  const spend = sumOf("Spend");
  const impressions = sumOf("Impressions");
  const clicks = sumOf("Clicks");
  const conversions = sumOf("Conversions");
  const orders = sumOf("Orders");
  const revenue = sumOf("Revenue");

  const kpis: ReportBlock["kpis"] = [];
  const push = (label: string, value: number | null, format: ReportBlock["kpis"][number]["format"], lowerBetter = false) => {
    if (value === null) return;
    kpis.push({ label, value, previous: null, format, ...(lowerBetter ? { lowerBetter: true } : {}) });
  };

  push("Spend", spend, "currency");
  push("Impressions", impressions, "number");
  push("Clicks", clicks, "number");
  push("Conversions", conversions, "number");
  push("Orders", orders, "number");
  push("Revenue", revenue, "currency");
  // Ratios recomputed from the sums above, null when the denominator is zero.
  if (clicks !== null && impressions !== null) {
    kpis.push({ label: "CTR", value: impressions > 0 ? clicks / impressions : null, previous: null, format: "percent" });
  }
  if (spend !== null && clicks !== null) {
    kpis.push({ label: "CPC", value: clicks > 0 ? spend / clicks : null, previous: null, format: "currency", lowerBetter: true });
  }
  if (spend !== null && conversions !== null) {
    kpis.push({ label: "Cost per conversion", value: conversions > 0 ? spend / conversions : null, previous: null, format: "currency", lowerBetter: true });
  }
  if (revenue !== null && orders !== null) {
    kpis.push({ label: "Avg order value", value: orders > 0 ? revenue / orders : null, previous: null, format: "currency" });
  }

  const unavailable: Unavailable[] = [];
  if (block.tables.length > 0) {
    unavailable.push({
      section: `${block.sourceName} breakdowns`,
      reason: "Campaign, product and content tables are reported per period and can't be recalculated from daily totals.",
    });
  }

  return {
    data: { ...block, kpis, series, tables: [], notes: block.notes },
    unavailable,
  };
}
