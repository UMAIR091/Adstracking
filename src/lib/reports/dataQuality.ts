// Which connected sources a report may use, and what its reader must be told
// about them. Pure — no DB, no React — so generation, the web report, the PDF
// and the AI prompt all state the same facts.
//
// A report is one period. A source whose cached data describes a DIFFERENT
// period must not be folded into it under that period's name: a connection
// revoked in August still has an August snapshot, and a "Last 28 days" report
// generated in October used to print those August figures beside October's.
// Five different situations used to look identical — a measured zero, a metric
// that can't be calculated, a disconnected source, stale data and partial
// coverage — and each now has its own state and its own sentence.
import type { Ga4ReportFull, Ga4Totals } from "@/lib/google";
import { getIntegrationName } from "@/lib/integrations/names";
import { addDays } from "@/lib/reports/periods";

export type Window = { start: string; end: string };

/**
 * ok          the source's figures describe this period
 * partial     included, but its data covers only part of the period
 * stale       excluded: its newest data ends well before the period does
 * no_data     excluded: nothing was recorded inside the period
 * not_synced  excluded: no stored data at all yet
 */
export type SourceState = "ok" | "partial" | "stale" | "no_data" | "not_synced";

export type ReportSourceStatus = {
  /** Integration id, e.g. "meta_ads". */
  type: string;
  name: string;
  included: boolean;
  state: SourceState;
  /** The inclusive dates this source's figures cover, when known. */
  window: Window | null;
  /** When its data was last refreshed (ISO timestamp). */
  syncedAt: string | null;
  /** data_sources.status at generation time: connected / revoked / error … */
  connection: string | null;
  /** The newest day it has data for, when that falls before the period. */
  lastDataDate?: string | null;
};

/**
 * How far a source's newest data may trail the period end and still describe
 * the period. Providers settle on different lags — ad platforms report through
 * yesterday, Search Console three days back — so a few days is normal. Beyond
 * it the source has stopped refreshing, and its numbers belong to another
 * window.
 */
export const STALE_TOLERANCE_DAYS = 3;

// Days between the sync and the last day a snapshot covers, per provider.
// Used only for snapshots synced before they recorded their own window.
const END_LAG_DAYS: Record<string, number> = { gsc: 3, youtube: 2, gbp: 3 };

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const isRec = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;

function utcDay(ts: string | null | undefined): string | null {
  if (!ts) return null;
  const t = Date.parse(ts);
  return Number.isFinite(t) ? new Date(t).toISOString().slice(0, 10) : null;
}

/** The window a snapshot covers: its own record, else inferred from the sync. */
export function snapshotWindow(
  snapshot: unknown,
  type: string,
  periodDays: number,
  syncedAt: string | null | undefined
): Window | null {
  const w = isRec(snapshot) ? snapshot.window : null;
  if (isRec(w) && typeof w.start === "string" && typeof w.end === "string" && ISO.test(w.start) && ISO.test(w.end)) {
    return { start: w.start, end: w.end };
  }
  const day = utcDay(syncedAt);
  if (!day) return null;
  const end = addDays(day, -(END_LAG_DAYS[type] ?? 1));
  return { start: addDays(end, -(periodDays - 1)), end };
}

/**
 * Whether a cached rolling snapshot (last 28 / last 90 days) may stand in for
 * the requested period. A missing snapshot is "not synced"; one whose window
 * ends more than STALE_TOLERANCE_DAYS before the period does is "stale".
 * A snapshot with no recorded window and no sync time (never the case for a
 * real sync) is kept rather than guessed about.
 */
export function assessSnapshotSource(input: {
  type: string;
  connection?: string | null;
  syncedAt?: string | null;
  snapshot: unknown;
  periodDays: number;
  period: Window;
}): ReportSourceStatus {
  const base = {
    type: input.type,
    name: getIntegrationName(input.type),
    syncedAt: input.syncedAt ?? null,
    connection: input.connection ?? null,
  };
  if (!isRec(input.snapshot)) return { ...base, included: false, state: "not_synced", window: null };
  const window = snapshotWindow(input.snapshot, input.type, input.periodDays, input.syncedAt);
  if (window && window.end < addDays(input.period.end, -STALE_TOLERANCE_DAYS)) {
    return { ...base, included: false, state: "stale", window, lastDataDate: window.end };
  }
  return { ...base, included: true, state: "ok", window };
}

/**
 * The same judgement for a window rebuilt from daily history. `dates` is every
 * date the source has data for (inside the period or not): a date before the
 * period proves its history reaches back far enough, so a quiet first day isn't
 * mistaken for history that starts late.
 */
export function assessDerivedSource(input: {
  type: string;
  connection?: string | null;
  syncedAt?: string | null;
  dates: string[];
  period: Window;
}): ReportSourceStatus {
  const base = {
    type: input.type,
    name: getIntegrationName(input.type),
    syncedAt: input.syncedAt ?? null,
    connection: input.connection ?? null,
  };
  const sorted = input.dates.filter((d) => ISO.test(d)).sort();
  if (!sorted.length) return { ...base, included: false, state: "not_synced", window: null };
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const inside = sorted.some((d) => d >= input.period.start && d <= input.period.end);
  if (!inside) {
    return { ...base, included: false, state: "no_data", window: null, lastDataDate: last < input.period.start ? last : null };
  }
  const window = {
    start: first > input.period.start ? first : input.period.start,
    end: last < input.period.end ? last : input.period.end,
  };
  const partial = window.start > input.period.start || window.end < addDays(input.period.end, -STALE_TOLERANCE_DAYS);
  return { ...base, included: true, state: partial ? "partial" : "ok", window };
}

const connectionClause = (c: string | null) =>
  c === "revoked"
    ? ", and its connection has been revoked — reconnect it to include it again"
    : c === "error"
      ? ", and its most recent refresh failed"
      : "";

/**
 * Plain sentences for the report's "About the data" note, the PDF and the AI
 * prompt. Empty when every source describes exactly the requested period.
 */
export function sourceNotes(sources: ReportSourceStatus[] | null | undefined, requested: Window): string[] {
  if (!sources?.length) return [];
  const lines: string[] = [];

  for (const src of sources) {
    if (src.included) continue;
    const refreshed = utcDay(src.syncedAt);
    if (src.state === "stale") {
      lines.push(
        `${src.name} is not included: its latest data ends ${src.lastDataDate ?? src.window?.end}` +
          `${refreshed ? ` (last refreshed ${refreshed})` : ""}${connectionClause(src.connection)}. ` +
          `Its figures would describe a different period.`
      );
    } else if (src.state === "no_data") {
      lines.push(
        `${src.name} is not included: it has no data recorded between ${requested.start} and ${requested.end}` +
          `${src.lastDataDate ? ` (its data ends ${src.lastDataDate})` : ""}${connectionClause(src.connection)}.`
      );
    } else if (src.state === "not_synced") {
      lines.push(`${src.name} is not included: it has no stored data yet${connectionClause(src.connection)}.`);
    }
  }

  for (const src of sources) {
    if (src.included && src.state === "partial" && src.window) {
      lines.push(`${src.name} has data for ${src.window.start} to ${src.window.end} only, so its figures cover that part of the period.`);
    }
  }

  // Included sources whose figures cover different dates from the stated
  // period, one sentence per window: "Google Search Console figures cover
  // 2026-09-12 to 2026-10-09 — …".
  const groups = new Map<string, string[]>();
  for (const src of sources) {
    if (!src.included || src.state !== "ok" || !src.window) continue;
    if (src.window.start === requested.start && src.window.end === requested.end) continue;
    const key = `${src.window.start} to ${src.window.end}`;
    groups.set(key, [...(groups.get(key) ?? []), src.name]);
  }
  for (const [range, names] of Array.from(groups.entries())) {
    lines.push(`${joinNames(names)} figures cover ${range} — each platform finalises its data on its own delay.`);
  }

  return lines;
}

/**
 * The window most of a report's sources actually cover — the latest one on a
 * tie. A rolling report states this as its period, so the dates on the cover
 * are the dates the figures describe; any source on a different window is
 * named by sourceNotes. Null when no included source knows its window.
 */
export function dominantWindow(sources: ReportSourceStatus[]): Window | null {
  const tally = new Map<string, { w: Window; n: number }>();
  for (const src of sources) {
    if (!src.included || !src.window) continue;
    const key = `${src.window.start}|${src.window.end}`;
    const cur = tally.get(key);
    tally.set(key, { w: src.window, n: (cur?.n ?? 0) + 1 });
  }
  let best: { w: Window; n: number } | null = null;
  for (const entry of Array.from(tally.values())) {
    if (
      !best ||
      entry.n > best.n ||
      (entry.n === best.n && (entry.w.end > best.w.end || (entry.w.end === best.w.end && entry.w.start > best.w.start)))
    ) {
      best = entry;
    }
  }
  return best ? best.w : null;
}

function joinNames(names: string[]): string {
  return names.length <= 1 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/**
 * Whether a GA4 total was actually measured. A rebuilt window lists the totals
 * it could not produce in `unavailableMetrics`; those read as 0 in the type and
 * must render as "not available", never as zero.
 */
export function ga4Has(ga4: Pick<Ga4ReportFull, "unavailableMetrics"> | null | undefined, key: keyof Ga4Totals): boolean {
  return !!ga4 && !(ga4.unavailableMetrics ?? []).includes(key);
}
