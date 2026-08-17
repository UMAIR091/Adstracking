// The reporting-period system.
//
// Two genuinely different things used to be conflated. A ROLLING period is
// "the last N days ending at the most recent settled day". A CALENDAR period is
// a named block on the calendar — August, Q2 — with fixed edges that have
// nothing to do with today. Treating "monthly" as "last 28 days" is the bug
// this exists to kill: a monthly report delivered on 3 September covered
// 6 August–2 September, which is not August.
//
// All arithmetic is UTC. Dates are YYYY-MM-DD strings, matching what the
// providers return and what reports.period_start/period_end store.
//
// The 2-day lag is the providers' settling time (see REPORT_LAG_DAYS in
// lib/report.ts): Search Console finalises about two days back. It applies to
// rolling windows and to the open end of an in-progress calendar period. It
// does NOT apply to a completed calendar period — August ended on the 31st
// whichever day you ask.

export const REPORT_LAG_DAYS = 2;

export type PeriodKind = "rolling" | "calendar" | "custom";

export type PeriodPreset =
  | "last_7"
  | "last_14"
  | "last_28"
  | "last_30"
  | "last_90"
  | "this_month"
  | "previous_month"
  | "this_quarter"
  | "previous_quarter"
  | "custom";

export type ResolvedPeriod = {
  preset: PeriodPreset;
  kind: PeriodKind;
  /** Inclusive YYYY-MM-DD bounds. */
  start: string;
  end: string;
  /** Inclusive day count. */
  days: number;
  /** Human label: "Last 28 days", "August 2026", "Q2 2026". */
  label: string;
  /**
   * True when the window is still running (this month / this quarter), so the
   * report covers a partial block and should say so.
   */
  inProgress: boolean;
};

export const PERIOD_PRESETS: { id: PeriodPreset; label: string; kind: PeriodKind }[] = [
  { id: "last_7", label: "Last 7 days", kind: "rolling" },
  { id: "last_14", label: "Last 14 days", kind: "rolling" },
  { id: "last_28", label: "Last 28 days", kind: "rolling" },
  { id: "last_30", label: "Last 30 days", kind: "rolling" },
  { id: "last_90", label: "Last 90 days", kind: "rolling" },
  { id: "this_month", label: "This month", kind: "calendar" },
  { id: "previous_month", label: "Previous month", kind: "calendar" },
  { id: "this_quarter", label: "This quarter", kind: "calendar" },
  { id: "previous_quarter", label: "Previous quarter", kind: "calendar" },
  { id: "custom", label: "Custom range", kind: "custom" },
];

const ROLLING_DAYS: Partial<Record<PeriodPreset, number>> = {
  last_7: 7, last_14: 14, last_28: 28, last_30: 30, last_90: 90,
};

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DAY_MS = 24 * 60 * 60 * 1000;

export function isPeriodPreset(v: unknown): v is PeriodPreset {
  return typeof v === "string" && PERIOD_PRESETS.some((p) => p.id === v);
}

// ── Date helpers (UTC, string in / string out) ──────────────────────────────

export function isIsoDate(s: unknown): s is string {
  if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const t = Date.parse(`${s}T00:00:00Z`);
  return Number.isFinite(t) && new Date(t).toISOString().slice(0, 10) === s;
}

const toUtc = (iso: string) => Date.parse(`${iso}T00:00:00Z`);
const fromUtc = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export function addDays(iso: string, n: number): string {
  return fromUtc(toUtc(iso) + n * DAY_MS);
}

/** Inclusive day count between two dates; 0 if reversed or unparseable. */
export function dayCount(start: string, end: string): number {
  if (!isIsoDate(start) || !isIsoDate(end)) return 0;
  const d = toUtc(end) - toUtc(start);
  return d < 0 ? 0 : Math.round(d / DAY_MS) + 1;
}

/** The most recent day whose provider data is considered settled. */
export function latestSettledDay(now: number = Date.now()): string {
  return fromUtc(now - REPORT_LAG_DAYS * DAY_MS);
}

const firstOfMonth = (y: number, m: number) => `${y}-${String(m + 1).padStart(2, "0")}-01`;
/** Last day of month m (0-indexed) — day 0 of the next month. */
const lastOfMonth = (y: number, m: number) => fromUtc(Date.UTC(y, m + 1, 0));

const quarterOf = (m: number) => Math.floor(m / 3);

// ── Resolution ──────────────────────────────────────────────────────────────

export type ResolveInput = {
  preset: PeriodPreset;
  /** Required when preset is "custom". */
  customStart?: string | null;
  customEnd?: string | null;
  now?: number;
};

export type ResolveResult =
  | { ok: true; period: ResolvedPeriod }
  | { ok: false; error: string };

/**
 * Turns a preset (plus custom bounds) into exact inclusive dates.
 *
 * Returns an error rather than silently correcting an unusable custom range —
 * a period that quietly becomes a different period is the failure mode this
 * whole module exists to prevent.
 */
export function resolvePeriod(input: ResolveInput): ResolveResult {
  const now = input.now ?? Date.now();
  const settled = latestSettledDay(now);
  const today = fromUtc(now);

  const rolling = ROLLING_DAYS[input.preset];
  if (rolling) {
    // N inclusive days ending at the last settled day.
    return {
      ok: true,
      period: {
        preset: input.preset,
        kind: "rolling",
        start: addDays(settled, -(rolling - 1)),
        end: settled,
        days: rolling,
        label: `Last ${rolling} days`,
        inProgress: false,
      },
    };
  }

  const nowDate = new Date(now);
  const y = nowDate.getUTCFullYear();
  const m = nowDate.getUTCMonth();

  if (input.preset === "this_month" || input.preset === "previous_month") {
    const isPrev = input.preset === "previous_month";
    const my = isPrev && m === 0 ? y - 1 : y;
    const mm = isPrev ? (m === 0 ? 11 : m - 1) : m;
    const start = firstOfMonth(my, mm);
    const monthEnd = lastOfMonth(my, mm);
    // A completed month keeps its real end date; the current month stops at the
    // last settled day.
    const end = isPrev ? monthEnd : (settled < monthEnd ? settled : monthEnd);
    if (end < start) {
      return { ok: false, error: "This month has no settled data yet. Choose Previous month or a rolling period." };
    }
    return {
      ok: true,
      period: {
        preset: input.preset, kind: "calendar", start, end,
        days: dayCount(start, end),
        label: `${MONTHS[mm]} ${my}`,
        inProgress: !isPrev && end < monthEnd,
      },
    };
  }

  if (input.preset === "this_quarter" || input.preset === "previous_quarter") {
    const isPrev = input.preset === "previous_quarter";
    let q = quarterOf(m);
    let qy = y;
    if (isPrev) {
      q -= 1;
      if (q < 0) { q = 3; qy -= 1; }
    }
    const start = firstOfMonth(qy, q * 3);
    const quarterEnd = lastOfMonth(qy, q * 3 + 2);
    const end = isPrev ? quarterEnd : (settled < quarterEnd ? settled : quarterEnd);
    if (end < start) {
      return { ok: false, error: "This quarter has no settled data yet. Choose Previous quarter or a rolling period." };
    }
    return {
      ok: true,
      period: {
        preset: input.preset, kind: "calendar", start, end,
        days: dayCount(start, end),
        label: `Q${q + 1} ${qy}`,
        inProgress: !isPrev && end < quarterEnd,
      },
    };
  }

  // Custom
  const start = input.customStart ?? "";
  const end = input.customEnd ?? "";
  if (!isIsoDate(start) || !isIsoDate(end)) {
    return { ok: false, error: "Enter both a start and an end date in YYYY-MM-DD format." };
  }
  if (end < start) {
    return { ok: false, error: "The end date must not be before the start date." };
  }
  if (start > today) {
    return { ok: false, error: "The start date is in the future." };
  }
  if (end > settled) {
    return {
      ok: false,
      error: `Data is only settled through ${settled}. Choose an end date on or before that.`,
    };
  }
  return {
    ok: true,
    period: {
      preset: "custom", kind: "custom", start, end,
      days: dayCount(start, end),
      label: `${start} to ${end}`,
      inProgress: false,
    },
  };
}

/**
 * The equal-length window immediately before this one, for period-over-period
 * comparison. Calendar periods compare against the previous calendar block of
 * the same kind, which is what a reader expects from "vs last month".
 */
export function previousWindow(period: ResolvedPeriod, now: number = Date.now()): { start: string; end: string } {
  if (period.preset === "previous_month" || period.preset === "this_month") {
    const s = new Date(toUtc(period.start));
    const y = s.getUTCFullYear();
    const m = s.getUTCMonth();
    const py = m === 0 ? y - 1 : y;
    const pm = m === 0 ? 11 : m - 1;
    // An in-progress month compares against the same number of days of the
    // previous month, so "so far this month" isn't measured against a full one.
    if (period.inProgress) {
      const start = firstOfMonth(py, pm);
      return { start, end: addDays(start, period.days - 1) };
    }
    return { start: firstOfMonth(py, pm), end: lastOfMonth(py, pm) };
  }
  if (period.preset === "previous_quarter" || period.preset === "this_quarter") {
    const s = new Date(toUtc(period.start));
    const y = s.getUTCFullYear();
    const q = quarterOf(s.getUTCMonth());
    const pq = q === 0 ? 3 : q - 1;
    const py = q === 0 ? y - 1 : y;
    if (period.inProgress) {
      const start = firstOfMonth(py, pq * 3);
      return { start, end: addDays(start, period.days - 1) };
    }
    return { start: firstOfMonth(py, pq * 3), end: lastOfMonth(py, pq * 3 + 2) };
  }
  void now;
  // Rolling and custom: the equal-length block immediately before.
  return { start: addDays(period.start, -period.days), end: addDays(period.start, -1) };
}
