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
import type { GscReportFull, Ga4ReportFull, Ga4Totals } from "@/lib/google";
import type { ReportBlock, BlockSeries } from "@/lib/integrations/blocks";
import { addDays, dayCount } from "@/lib/reports/periods";

export type Window = { start: string; end: string };

/** A metric or section that cannot be rebuilt, with the reason to show. */
export type Unavailable = { section: string; reason: string };

export type DeriveOutcome<T> = {
  data: T | null;
  unavailable: Unavailable[];
};

const inWindow = (date: string, w: Window) => date >= w.start && date <= w.end;
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);

/**
 * One row per date, the LAST occurrence winning. A day that reaches a series
 * twice — a re-sync appended rather than replaced, or a snapshot overlaid on
 * the archive — would otherwise be summed twice. Sorted by date.
 */
export function dedupeByDate<T extends { date: string }>(rows: T[]): T[] {
  const byDate = new Map<string, T>();
  for (const r of rows) if (r?.date) byDate.set(r.date, r);
  return Array.from(byDate.values()).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

/** `base` rows with `overlay` rows replacing any on the same date. */
export function mergeByDate<T extends { date: string }>(base: T[], overlay: T[]): T[] {
  return dedupeByDate([...base, ...overlay]);
}

/** Merges two series lists by label, the overlay's points winning per date. */
export function mergeSeries(base: BlockSeries[], overlay: BlockSeries[]): BlockSeries[] {
  const out = new Map<string, BlockSeries>();
  for (const sr of [...base, ...overlay]) {
    const key = sr.label.toLowerCase();
    const prev = out.get(key);
    out.set(key, {
      label: prev?.label ?? sr.label,
      format: prev?.format ?? sr.format,
      points: mergeByDate(prev?.points ?? [], sr.points),
    });
  }
  return Array.from(out.values());
}

/**
 * The days a period-over-period comparison may be computed over, or null when
 * the history can't support a fair one.
 *
 * A source's daily history may omit days with no activity (Search Console does
 * not return a zero day), so a missing date INSIDE the history's extent is a
 * zero, while a date outside it is unknown. A comparison is therefore allowed
 * only when the history's extent reaches back to the start of the previous
 * window, and forward to within `maxLagDays` of the current window's end.
 *
 * When the newest data stops short of the period end (providers settle on
 * different lags), the current window holds data only up to that last day, so
 * the previous window is cut to the same number of days and the two are
 * compared like for like.
 */
export function comparisonWindows(
  dates: string[],
  current: Window,
  previous: Window,
  maxLagDays = 3
): { current: Window; previous: Window } | null {
  const extent = seriesCoverage(dates);
  if (!extent) return null;
  if (extent.start > previous.start) return null;
  if (extent.end >= current.end) return { current, previous };
  if (extent.end < addDays(current.end, -maxLagDays) || extent.end < current.start) return null;
  const days = dayCount(current.start, extent.end);
  const prevEnd = addDays(previous.start, days - 1);
  return {
    current: { start: current.start, end: extent.end },
    previous: { start: previous.start, end: prevEnd < previous.end ? prevEnd : previous.end },
  };
}

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

/**
 * Distinct days inside `w` that carry data — a date counts once however many
 * sources reported it.
 *
 * `coverageWithin` counts ROWS, which is right for one series and wrong across
 * several: three sources each holding a third of the window would otherwise
 * add up to "full coverage" while two thirds of the days had nothing.
 */
export function distinctDaysWithin(dates: string[], w: Window): number {
  return coverageWithin(Array.from(new Set(dates)), w).covered;
}

/**
 * How much of a requested period must carry data before a report is worth
 * generating, as a fraction of its days.
 *
 * Above this, the totals still describe the majority of the window they are
 * named after, and the shortfall is disclosed by `meta.coverage` — the web
 * report and the PDF both render "Data is available for N of the M days in this
 * period". Below it, a report keeps the period's name while mostly measuring
 * its absence, which is what refusing is actually for.
 *
 * A fraction rather than a day count because the same rule covers 7-, 14-, 28-
 * and 90-day windows: "missing at most 2 days" would be trivial for a quarter
 * and severe for a week.
 */
export const MIN_PERIOD_COVERAGE = 0.5;

// ── Rebuilding daily series from the durable archive ────────────────────────
//
// The snapshot tables are a rolling 90-day cache, so a previous QUARTER is
// almost always outside them: Q2 ends up to two and a half months before the
// cache begins. `metric_daily` (migration 0019) is the append-only companion
// every sync writes to, keyed on (data_source_id, date) and kept indefinitely,
// so older windows are served from our own database rather than by refetching
// from providers that may no longer offer the range.
//
// Archive rows carry the same daily keys the provider's `byDate` had, so they
// reconstitute into the same shapes the derive functions above already handle.
// Everything those functions mark unavailable stays unavailable here — the
// archive stores daily totals, not dimension breakdowns.

export type ArchiveRow = { date: string; provider: string; data_source_id?: string; metrics: Record<string, number> };

const pick = (m: Record<string, number>, key: string) => num(m[key]);

/** Search-Console-shaped daily rows from archive entries. */
export function archiveToGscByDate(rows: ArchiveRow[]): { date: string; clicks: number; impressions: number; ctr: number; position: number }[] {
  return rows
    .filter((r) => r.provider === "gsc")
    .map((r) => ({
      date: r.date,
      clicks: pick(r.metrics, "clicks"),
      impressions: pick(r.metrics, "impressions"),
      ctr: pick(r.metrics, "ctr"),
      position: pick(r.metrics, "position"),
    }));
}

/** GA4-shaped daily rows from archive entries. */
export function archiveToGa4ByDate(rows: ArchiveRow[]): { date: string; users: number; sessions: number; views: number }[] {
  return rows
    .filter((r) => r.provider === "ga4")
    .map((r) => ({
      date: r.date,
      users: pick(r.metrics, "users"),
      sessions: pick(r.metrics, "sessions"),
      views: pick(r.metrics, "views"),
    }));
}

/**
 * Named daily series per non-Google provider, in the shape ReportBlock.series
 * uses, so archive data flows through the same deriveBlock() path.
 * Metric keys are capitalised into the labels deriveBlock recognises.
 */
export function archiveToBlockSeries(rows: ArchiveRow[]): Map<string, BlockSeries[]> {
  const byProvider = new Map<string, ArchiveRow[]>();
  for (const r of rows) {
    if (r.provider === "gsc" || r.provider === "ga4") continue;
    byProvider.set(r.provider, [...(byProvider.get(r.provider) ?? []), r]);
  }
  // Array.from rather than for-of over the Map: this file compiles for the
  // browser and the project targets ES5 downlevel iteration.
  const out = new Map<string, BlockSeries[]>();
  Array.from(byProvider.entries()).forEach(([provider, list]) => out.set(provider, archiveRowsToSeries(list)));
  return out;
}

/**
 * One source's archive rows as named block series. Callers pass the rows of a
 * single data source: grouping by provider alone would add two accounts of the
 * same platform — or a replaced connection and its successor — into one line.
 */
export function archiveRowsToSeries(rows: ArchiveRow[]): BlockSeries[] {
  const CURRENCY_KEYS = new Set(["spend", "revenue", "cost"]);
  const LABELS: Record<string, string> = {
    spend: "Spend", impressions: "Impressions", clicks: "Clicks",
    conversions: "Conversions", orders: "Orders", revenue: "Revenue",
  };
  const series = new Map<string, { date: string; value: number }[]>();
  for (const r of rows) {
    for (const [key, value] of Object.entries(r.metrics ?? {})) {
      if (!(key in LABELS) || !Number.isFinite(value)) continue;
      const points = series.get(key) ?? [];
      points.push({ date: r.date, value });
      series.set(key, points);
    }
  }
  return Array.from(series.entries()).map(([key, points]) => ({
    label: LABELS[key],
    format: CURRENCY_KEYS.has(key) ? ("currency" as const) : ("number" as const),
    points: dedupeByDate(points),
  }));
}

// ── Search Console ──────────────────────────────────────────────────────────

function gscTotalsOf(days: GscReportFull["byDate"]): GscReportFull["totals"] {
  const clicks = days.reduce((a, d) => a + num(d.clicks), 0);
  const impressions = days.reduce((a, d) => a + num(d.impressions), 0);
  // Search Console's average position is impression-weighted; averaging the
  // daily figures unweighted would misreport it.
  const posWeighted = days.reduce((a, d) => a + num(d.position) * num(d.impressions), 0);
  return {
    clicks,
    impressions,
    ctr: impressions > 0 ? clicks / impressions : 0,
    position: impressions > 0 ? posWeighted / impressions : 0,
  };
}

/** A previous-window pair approved by comparisonWindows(). */
export type Compare = { current: Window; previous: Window } | null | undefined;

/**
 * `compare`, when given, is the pair of windows comparisonWindows() approved.
 * Previous totals are rebuilt from the same daily rows, so a calendar or custom
 * period gets a period-over-period change wherever the history supports one.
 * The current totals need no trimming: the history has no rows after its last
 * day, so they already cover exactly `compare.current`.
 */
export function deriveGsc(full: GscReportFull | null, w: Window, compare?: Compare): DeriveOutcome<GscReportFull> {
  if (!full?.byDate?.length) return { data: null, unavailable: [] };

  const all = dedupeByDate(full.byDate);
  const days = all.filter((d) => inWindow(d.date, w));
  if (days.length === 0) return { data: null, unavailable: [] };

  const totals = gscTotalsOf(days);
  const previousTotals = compare ? gscTotalsOf(all.filter((d) => inWindow(d.date, compare.previous))) : null;

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
      previousTotals,
      previousWindow: compare ? compare.previous : null,
      window: { start: w.start, end: w.end },
      movers: null,
    },
    unavailable: [
      { section: "Top queries and pages", reason: "These are reported per period rather than per day, so they cannot be rebuilt for a custom date range." },
      { section: "Winning and declining keywords", reason: "This needs per-keyword figures for both this period and the one before it, which aren't kept day by day." },
    ],
  };
}

// ── GA4 ─────────────────────────────────────────────────────────────────────

/**
 * GA4 totals a daily rebuild cannot produce. Listed on the result as
 * `unavailableMetrics`: the fields hold 0 only because the type is numeric,
 * and every renderer, summary and the AI prompt read the list and show "not
 * available" instead of a zero that would say nobody converted.
 */
export const GA4_DAILY_UNAVAILABLE: (keyof Ga4Totals)[] = [
  "users", "newUsers", "engagedSessions", "engagementRate", "avgEngagementTime", "conversions", "totalRevenue",
];

function ga4TotalsOf(days: Ga4ReportFull["byDate"]): Ga4Totals {
  return {
    sessions: days.reduce((a, d) => a + num(d.sessions), 0),
    views: days.reduce((a, d) => a + num(d.views), 0),
    users: 0,
    newUsers: 0,
    engagedSessions: 0,
    engagementRate: 0,
    avgEngagementTime: 0,
    conversions: 0,
    totalRevenue: 0,
  };
}

export function deriveGa4(full: Ga4ReportFull | null, w: Window, compare?: Compare): DeriveOutcome<Ga4ReportFull> {
  if (!full?.byDate?.length) return { data: null, unavailable: [] };

  const all = dedupeByDate(full.byDate);
  const days = all.filter((d) => inWindow(d.date, w));
  if (days.length === 0) return { data: null, unavailable: [] };

  return {
    data: {
      ...full,
      totals: ga4TotalsOf(days),
      unavailableMetrics: GA4_DAILY_UNAVAILABLE.slice(),
      byDate: days,
      topLandingPages: [],
      trafficSources: [],
      devices: [],
      countries: [],
      previousTotals: compare ? ga4TotalsOf(all.filter((d) => inWindow(d.date, compare.previous))) : null,
      previousWindow: compare ? compare.previous : null,
      window: { start: w.start, end: w.end },
    },
    unavailable: [
      { section: "Users and new users", reason: "These count unique people, and adding up each day's figures would count anyone who visited on more than one day twice — so they can't be rebuilt for a custom range." },
      { section: "Engagement, conversions and revenue", reason: "These are reported per period rather than per day, so a custom date range can show sessions and views only." },
      { section: "Traffic sources and landing pages", reason: "These breakdowns are reported for a whole period and can't be split by day." },
    ],
  };
}

// ── Generic channel blocks (ads, commerce, email, …) ────────────────────────

/**
 * Blocks already carry their metrics as named daily series, so a slice sums the
 * points inside the window per series. KPIs that were period-scoped aggregates
 * are dropped: without their components there is no honest way to restate them.
 */
type BlockSums = Record<"spend" | "impressions" | "clicks" | "conversions" | "orders" | "revenue", number | null>;

function blockSums(series: BlockSeries[], w: Window): BlockSums {
  const sumOf = (label: string) => {
    const sr = series.find((x) => x.label.toLowerCase() === label.toLowerCase());
    return sr ? dedupeByDate(sr.points).filter((p) => inWindow(p.date, w)).reduce((a, p) => a + num(p.value), 0) : null;
  };
  return {
    spend: sumOf("Spend"),
    impressions: sumOf("Impressions"),
    clicks: sumOf("Clicks"),
    conversions: sumOf("Conversions"),
    orders: sumOf("Orders"),
    revenue: sumOf("Revenue"),
  };
}

const ratioOf = (n: number | null, d: number | null) => (n === null || d === null || d <= 0 ? null : n / d);

export function deriveBlock(block: ReportBlock, w: Window, compare?: Compare): DeriveOutcome<ReportBlock> {
  const series = block.series
    .map((sr) => ({ ...sr, points: dedupeByDate(sr.points).filter((p) => inWindow(p.date, w)) }))
    .filter((sr) => sr.points.length > 0);

  if (series.length === 0) return { data: null, unavailable: [] };

  // Rebuild only the KPIs whose components are present as daily series, and
  // recompute the ratios from those sums. Previous figures come from the same
  // series over the approved comparison window, or stay null.
  const cur = blockSums(series, w);
  const prev = compare ? blockSums(block.series, compare.previous) : null;
  type Format = ReportBlock["kpis"][number]["format"];

  const kpis: ReportBlock["kpis"] = [];
  const push = (label: string, key: keyof BlockSums, format: Format) => {
    const value = cur[key];
    if (value === null) return;
    kpis.push({ label, value, previous: prev ? prev[key] : null, format });
  };
  push("Spend", "spend", "currency");
  push("Impressions", "impressions", "number");
  push("Clicks", "clicks", "number");
  push("Conversions", "conversions", "number");
  push("Orders", "orders", "number");
  push("Revenue", "revenue", "currency");

  // Ratios recomputed from the sums above, null when the denominator is zero.
  const ratio = (label: string, n: keyof BlockSums, d: keyof BlockSums, format: Format, lowerBetter = false) => {
    if (cur[n] === null || cur[d] === null) return;
    kpis.push({
      label,
      value: ratioOf(cur[n], cur[d]),
      previous: prev ? ratioOf(prev[n], prev[d]) : null,
      format,
      ...(lowerBetter ? { lowerBetter: true } : {}),
    });
  };
  ratio("CTR", "clicks", "impressions", "percent");
  ratio("CPC", "spend", "clicks", "currency", true);
  ratio("Cost per conversion", "spend", "conversions", "currency", true);
  ratio("Avg order value", "revenue", "orders", "currency");

  const unavailable: Unavailable[] = [];
  if (block.tables.length > 0) {
    unavailable.push({
      section: `${block.sourceName} breakdowns`,
      reason: "Campaign, product and content tables are reported per period and can't be recalculated from daily totals.",
    });
  }

  // The snapshot's notes describe the snapshot's window, not this one, so they
  // are restated for this window. A paid channel with no spend and no
  // impressions here measured a real zero, and says so in words — the same
  // sentence the snapshot projection uses (integrations/blocks.ts).
  const notes = block.category === "paid" && !cur.spend && !cur.impressions ? ["No ads ran in this period."] : [];

  return {
    // An all-zero line is not a trend; charts get the series that moved, the
    // KPIs above still state the zeros.
    data: { ...block, kpis, series: series.filter((sr) => sr.points.some((p) => p.value !== 0)), tables: [], notes },
    unavailable,
  };
}
