// Durable historical metrics.
//
// The snapshot tables are a rolling cache — each sync overwrites the previous
// 28/90-day window, so nothing older survives. This module maintains the
// append-only companion (`metric_daily`, migration 0019): every sync also
// records that window's daily totals, keyed on (data_source_id, date), so the
// archive grows indefinitely while re-syncs simply correct existing days.
//
// The result is that monthly / quarterly / yearly reporting reads from our own
// database instead of refetching from providers that may no longer serve the
// range at all.
import type { SupabaseClient } from "@supabase/supabase-js";

// A provider's daily series entry, normalized: an ISO date plus numeric totals.
export type DailyPoint = { date: string; metrics: Record<string, number> };

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

// Keys that are identifiers or labels rather than measurements.
const NON_METRIC_KEYS = new Set(["date", "day", "key", "id", "label", "name"]);

// Extracts a normalized daily series from any provider snapshot.
//
// Every integration's report shape exposes its daily series as `byDate` (GSC,
// GA4, ads, commerce, CRM, email, social, GBP …), so one generic reader covers
// all of them — new providers are picked up with no change here. Non-numeric
// and non-finite values are dropped so a provider quirk can't poison the
// archive.
export function extractDailySeries(snapshot: unknown): DailyPoint[] {
  const rows = (snapshot as { byDate?: unknown } | null)?.byDate;
  if (!Array.isArray(rows)) return [];

  const out: DailyPoint[] = [];
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const rec = row as Record<string, unknown>;
    const date = typeof rec.date === "string" ? rec.date.slice(0, 10) : null;
    if (!date || !ISO_DATE.test(date)) continue;

    const metrics: Record<string, number> = {};
    for (const [k, v] of Object.entries(rec)) {
      if (NON_METRIC_KEYS.has(k)) continue;
      if (typeof v === "number" && Number.isFinite(v)) metrics[k] = v;
    }
    if (Object.keys(metrics).length > 0) out.push({ date, metrics });
  }
  return out;
}

// Writes a window of daily metrics into the archive.
//
// Idempotent: upserting on (data_source_id, date) means re-syncing overlapping
// windows corrects days whose numbers the provider has since revised — Search
// Console restates the last ~3 days — without duplicating rows or disturbing
// days outside the window.
//
// Never throws: history is a background concern and must not fail a sync.
export async function recordDailyMetrics(
  supabase: SupabaseClient,
  args: {
    dataSourceId: string;
    agencyId: string;
    clientId: string | null;
    provider: string;
    snapshot: unknown;
  }
): Promise<{ recorded: number; error?: string }> {
  const series = extractDailySeries(args.snapshot);
  if (series.length === 0) return { recorded: 0 };

  const updatedAt = new Date().toISOString();
  const rows = series.map((p) => ({
    data_source_id: args.dataSourceId,
    agency_id: args.agencyId,
    client_id: args.clientId,
    provider: args.provider,
    date: p.date,
    metrics: p.metrics,
    updated_at: updatedAt,
  }));

  const { error } = await supabase
    .from("metric_daily")
    .upsert(rows, { onConflict: "data_source_id,date" });

  if (error) return { recorded: 0, error: error.message };
  return { recorded: rows.length };
}

// ── Reading history ──────────────────────────────────────────

export type HistoryRow = {
  date: string;
  provider: string;
  client_id: string | null;
  data_source_id: string;
  metrics: Record<string, number>;
};

export type HistoryQuery = {
  agencyId: string;
  from: string; // inclusive ISO date
  to: string;   // inclusive ISO date
  clientId?: string | null;
  dataSourceId?: string | null;
  provider?: string | null;
};

// Raw daily rows for a range, oldest first. Supabase caps a single response at
// 1000 rows by default, so this pages explicitly — a multi-year range across
// several sources exceeds that easily.
export async function fetchHistory(supabase: SupabaseClient, q: HistoryQuery): Promise<HistoryRow[]> {
  const PAGE = 1000;
  const out: HistoryRow[] = [];

  for (let offset = 0; ; offset += PAGE) {
    let query = supabase
      .from("metric_daily")
      .select("date, provider, client_id, data_source_id, metrics")
      .eq("agency_id", q.agencyId)
      .gte("date", q.from)
      .lte("date", q.to)
      .order("date", { ascending: true })
      .range(offset, offset + PAGE - 1);

    if (q.clientId) query = query.eq("client_id", q.clientId);
    if (q.dataSourceId) query = query.eq("data_source_id", q.dataSourceId);
    if (q.provider) query = query.eq("provider", q.provider);

    const { data, error } = await query;
    if (error || !data) break;
    out.push(...(data as HistoryRow[]));
    if (data.length < PAGE) break;
  }
  return out;
}

// ── Aggregation ──────────────────────────────────────────────

// Rates can't be summed. Anything listed here is recomputed from its
// components after summing; anything else is averaged over the days present.
const RATE_METRICS: Record<string, { numerator: string; denominator: string }> = {
  ctr: { numerator: "clicks", denominator: "impressions" },
  conversionRate: { numerator: "conversions", denominator: "sessions" },
  engagementRate: { numerator: "engagedSessions", denominator: "sessions" },
};

// Metrics that are positions/averages rather than counts — averaged, weighted
// by impressions when available so a low-traffic day can't skew the mean.
const WEIGHTED_AVERAGE: Record<string, string> = {
  position: "impressions",
  cpc: "clicks",
  cpa: "conversions",
};

export type Totals = Record<string, number>;

// Collapses daily rows into one set of totals, summing counts and correctly
// deriving rates and weighted averages.
export function aggregate(rows: { metrics: Record<string, number> }[]): Totals {
  const sums: Record<string, number> = {};
  const weighted: Record<string, { num: number; den: number }> = {};
  const plainAvg: Record<string, { sum: number; n: number }> = {};

  for (const row of rows) {
    for (const [k, v] of Object.entries(row.metrics ?? {})) {
      if (!Number.isFinite(v)) continue;

      if (RATE_METRICS[k]) continue; // recomputed below from components

      const weightKey = WEIGHTED_AVERAGE[k];
      if (weightKey) {
        const w = row.metrics[weightKey];
        if (typeof w === "number" && w > 0) {
          const e = weighted[k] ?? { num: 0, den: 0 };
          e.num += v * w;
          e.den += w;
          weighted[k] = e;
        } else {
          const e = plainAvg[k] ?? { sum: 0, n: 0 };
          e.sum += v;
          e.n += 1;
          plainAvg[k] = e;
        }
        continue;
      }

      sums[k] = (sums[k] ?? 0) + v;
    }
  }

  const totals: Totals = { ...sums };

  for (const [k, e] of Object.entries(weighted)) {
    totals[k] = e.den > 0 ? e.num / e.den : 0;
  }
  // Only used where no weight was ever available.
  for (const [k, e] of Object.entries(plainAvg)) {
    if (totals[k] === undefined && e.n > 0) totals[k] = e.sum / e.n;
  }
  for (const [k, { numerator, denominator }] of Object.entries(RATE_METRICS)) {
    const den = sums[denominator];
    if (den && den > 0 && sums[numerator] !== undefined) totals[k] = sums[numerator] / den;
  }

  return totals;
}

export type Bucket = { period: string; from: string; to: string; metrics: Totals; days: number };

// Groups daily rows into calendar buckets and aggregates each — the backbone
// of monthly / quarterly / yearly reporting.
export function bucketBy(rows: HistoryRow[], grain: "month" | "quarter" | "year"): Bucket[] {
  const groups = new Map<string, HistoryRow[]>();

  for (const row of rows) {
    const [y, m] = row.date.split("-");
    const key =
      grain === "year" ? y : grain === "quarter" ? `${y}-Q${Math.floor((Number(m) - 1) / 3) + 1}` : `${y}-${m}`;
    const list = groups.get(key);
    if (list) list.push(row);
    else groups.set(key, [row]);
  }

  return Array.from(groups.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([period, group]) => {
      const dates = group.map((g) => g.date).sort();
      return {
        period,
        from: dates[0],
        to: dates[dates.length - 1],
        metrics: aggregate(group),
        days: new Set(dates).size,
      };
    });
}

// How far back the archive actually goes, so the UI can offer only the ranges
// it can genuinely serve rather than promising empty reports.
export async function historyCoverage(
  supabase: SupabaseClient,
  agencyId: string,
  clientId?: string | null
): Promise<{ earliest: string | null; latest: string | null; days: number }> {
  const base = () => {
    let q = supabase.from("metric_daily").select("date").eq("agency_id", agencyId);
    if (clientId) q = q.eq("client_id", clientId);
    return q;
  };

  const [{ data: first }, { data: last }] = await Promise.all([
    base().order("date", { ascending: true }).limit(1),
    base().order("date", { ascending: false }).limit(1),
  ]);

  const earliest = (first?.[0]?.date as string | undefined) ?? null;
  const latest = (last?.[0]?.date as string | undefined) ?? null;
  const days =
    earliest && latest
      ? Math.floor((Date.parse(latest) - Date.parse(earliest)) / 86_400_000) + 1
      : 0;

  return { earliest, latest, days };
}
