// Data-processing layer for client reports. Pure functions — no React, no DB,
// no Google API. Turns a cached Search Console snapshot into the payload that
// the report UI renders, defines the empty-state rules, and derives the
// reporting window from the real cached data.
import type { GscReportFull } from "@/lib/google";
import type { ReportInsights } from "@/lib/ai";

// The Search Console snapshot persisted in gsc_snapshots.data by the sync job.
export type ReportSnapshot = GscReportFull;

// The full payload stored in reports.data and rendered by ReportDocument.
// `insightsHash` fingerprints the metrics the insights were generated from, so
// they can be cached and only regenerated when the underlying data changes.
export type ReportData = ReportSnapshot & {
  insights: ReportInsights | null;
  insightsHash?: string;
};

// Stable, dependency-free hash (FNV-1a) of exactly the metrics the AI analyzes.
// Used to skip regenerating insights when the data hasn't changed. Order-stable
// because it hashes the snapshot's own field order.
export function reportDataHash(snapshot: ReportSnapshot): string {
  const basis = JSON.stringify({
    totals: snapshot.totals,
    previousTotals: snapshot.previousTotals ?? null,
    topQueries: snapshot.topQueries,
    topPages: snapshot.topPages,
    topCountries: snapshot.topCountries ?? [],
    topDevices: snapshot.topDevices ?? [],
    movers: snapshot.movers ?? null,
  });
  let h = 0x811c9dc5;
  for (let i = 0; i < basis.length; i++) {
    h ^= basis.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16);
}

// A snapshot has nothing worth reporting when there's no traffic and no daily
// trend. Callers should surface an empty state instead of generating a report.
export function isSnapshotEmpty(snapshot: ReportSnapshot | null | undefined): boolean {
  if (!snapshot) return true;
  const t = snapshot.totals;
  const noTotals = !t || (t.clicks === 0 && t.impressions === 0);
  const noTrend = !Array.isArray(snapshot.byDate) || snapshot.byDate.length === 0;
  return noTotals && noTrend;
}

// Merges the cached snapshot with the (optional) AI insights into the final
// report payload. Single source of truth for the reports.data shape. Stamps the
// data hash so cached insights can be invalidated when the metrics change.
export function assembleReport(
  snapshot: ReportSnapshot,
  insights: ReportInsights | null
): ReportData {
  return { ...snapshot, insights, insightsHash: reportDataHash(snapshot) };
}

// Derives the report's covered period from the snapshot's actual daily data, so
// the printed dates match the cached numbers rather than a recomputed estimate.
// Falls back to the given default window when the trend is missing.
export function reportPeriod(
  snapshot: ReportSnapshot,
  fallback: { start: string; end: string }
): { start: string; end: string } {
  const dates = (snapshot.byDate ?? []).map((d) => d.date).filter(Boolean).sort();
  if (dates.length === 0) return fallback;
  return { start: dates[0], end: dates[dates.length - 1] };
}
