// Data-processing layer for client reports. Pure functions — no React, no DB,
// no Google API. Turns a cached Search Console snapshot into the payload that
// the report UI renders, defines the empty-state rules, and derives the
// reporting window from the real cached data.
import type { GscReportFull } from "@/lib/google";
import type { ReportInsights } from "@/lib/ai";

// The Search Console snapshot persisted in gsc_snapshots.data by the sync job.
export type ReportSnapshot = GscReportFull;

// The full payload stored in reports.data and rendered by ReportDocument.
export type ReportData = ReportSnapshot & { insights: ReportInsights | null };

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
// report payload. Single source of truth for the reports.data shape.
export function assembleReport(
  snapshot: ReportSnapshot,
  insights: ReportInsights | null
): ReportData {
  return { ...snapshot, insights };
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
