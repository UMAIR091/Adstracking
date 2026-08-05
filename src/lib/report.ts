// Data-processing layer for client reports. Pure functions — no React, no DB,
// no Google API. Merges the cached Search Console and GA4 snapshots into the
// unified payload the report UI renders, defines the empty-state rules, maps the
// data to the AI input, and derives the reporting window from the real data.
import type { GscReportFull, Ga4ReportFull } from "@/lib/google";
import type { ReportInsights, InsightsInput } from "@/lib/ai";
import type { ReportBlock } from "@/lib/integrations/blocks";

// The unified payload stored in reports.data and rendered by ReportDocument.
// Either Google source may be null (only one connected). `insightsHash`
// fingerprints the metrics the insights were generated from for cache
// invalidation.
//
// `blocks` carries EVERY other connected integration — paid media, commerce,
// CRM, email, social, calls, video, local — already projected into the neutral
// display vocabulary (lib/integrations/blocks.ts). Reports, the PDF, email and
// exports read this one field, so a new integration reaches all of them without
// any of those layers learning about the provider.
export type ReportData = {
  gsc: GscReportFull | null;
  ga4: Ga4ReportFull | null;
  blocks: ReportBlock[];
  insights: ReportInsights | null;
  insightsHash?: string;
};

// Stable, dependency-free hash (FNV-1a) of exactly the metrics the AI analyzes.
function fnv1a(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16);
}

export function reportDataHash(data: { gsc: GscReportFull | null; ga4: Ga4ReportFull | null; blocks?: ReportBlock[] }): string {
  const basis = JSON.stringify({
    // Blocks participate in the fingerprint so a change in ad spend (or any
    // other non-Google channel) correctly invalidates the cached AI insights.
    blocks: (data.blocks ?? []).map((b) => ({ id: b.sourceId, kpis: b.kpis, tables: b.tables })),
    gsc: data.gsc
      ? {
          totals: data.gsc.totals,
          previousTotals: data.gsc.previousTotals ?? null,
          topQueries: data.gsc.topQueries,
          topPages: data.gsc.topPages,
          topCountries: data.gsc.topCountries ?? [],
          topDevices: data.gsc.topDevices ?? [],
          movers: data.gsc.movers ?? null,
        }
      : null,
    ga4: data.ga4
      ? {
          totals: data.ga4.totals,
          previousTotals: data.ga4.previousTotals ?? null,
          trafficSources: data.ga4.trafficSources,
          topLandingPages: data.ga4.topLandingPages,
          devices: data.ga4.devices,
          countries: data.ga4.countries,
        }
      : null,
  });
  return fnv1a(basis);
}

export function isGscEmpty(g: GscReportFull | null | undefined): boolean {
  if (!g) return true;
  const noTotals = !g.totals || (g.totals.clicks === 0 && g.totals.impressions === 0);
  const noTrend = !Array.isArray(g.byDate) || g.byDate.length === 0;
  return noTotals && noTrend;
}

export function isGa4Empty(g: Ga4ReportFull | null | undefined): boolean {
  if (!g) return true;
  const noTotals = !g.totals || (g.totals.users === 0 && g.totals.sessions === 0);
  const noTrend = !Array.isArray(g.byDate) || g.byDate.length === 0;
  return noTotals && noTrend;
}

// A report is empty only when every connected channel is empty/absent — the
// Google pair AND every projected block. A client with only TikTok Ads
// connected produces a perfectly valid report.
export function isReportEmpty(data: { gsc: GscReportFull | null; ga4: Ga4ReportFull | null; blocks?: ReportBlock[] }): boolean {
  const noBlocks = !data.blocks?.some((b) => b.kpis.length > 0 || b.tables.length > 0);
  return isGscEmpty(data.gsc) && isGa4Empty(data.ga4) && noBlocks;
}

// Merges every cached source with the (optional) AI insights into the final
// payload. Single source of truth for the reports.data shape.
export function assembleReport(
  gsc: GscReportFull | null,
  ga4: Ga4ReportFull | null,
  insights: ReportInsights | null,
  blocks: ReportBlock[] = []
): ReportData {
  return { gsc, ga4, blocks, insights, insightsHash: reportDataHash({ gsc, ga4, blocks }) };
}

// Normalizes any stored reports.data — the unified {gsc,ga4} shape OR the legacy
// flat GSC-only shape — into the unified shape, so old reports keep rendering.
export function normalizeReportData(raw: unknown): ReportData {
  const data = (raw ?? {}) as Record<string, unknown>;
  // Reports stored before blocks existed have no `blocks` key — default to an
  // empty list so they keep rendering unchanged.
  const blocks = Array.isArray(data.blocks) ? (data.blocks as ReportBlock[]) : [];

  if ("gsc" in data || "ga4" in data) {
    return {
      gsc: (data.gsc as GscReportFull) ?? null,
      ga4: (data.ga4 as Ga4ReportFull) ?? null,
      blocks,
      insights: (data.insights as ReportInsights) ?? null,
      insightsHash: data.insightsHash as string | undefined,
    };
  }
  // Legacy: Search Console fields stored at the top level.
  if (data.totals && (data.topQueries || data.byDate)) {
    const { insights, insightsHash, ...gsc } = data;
    return {
      gsc: gsc as unknown as GscReportFull,
      ga4: null,
      blocks: [],
      insights: (insights as ReportInsights) ?? null,
      insightsHash: insightsHash as string | undefined,
    };
  }
  return { gsc: null, ga4: null, blocks, insights: (data.insights as ReportInsights) ?? null };
}

// Maps the unified report data to the AI insights input.
export function toInsightsInput(data: ReportData, clientName: string, periodLabel: string): InsightsInput {
  return {
    clientName,
    periodLabel,
    gsc: data.gsc
      ? {
          totals: data.gsc.totals,
          previousTotals: data.gsc.previousTotals ?? null,
          topQueries: data.gsc.topQueries,
          topPages: data.gsc.topPages,
          topCountries: data.gsc.topCountries,
          topDevices: data.gsc.topDevices,
          movers: data.gsc.movers,
        }
      : null,
    ga4: data.ga4
      ? {
          totals: data.ga4.totals,
          previousTotals: data.ga4.previousTotals ?? null,
          trafficSources: data.ga4.trafficSources,
          topLandingPages: data.ga4.topLandingPages,
          devices: data.ga4.devices,
          countries: data.ga4.countries,
        }
      : null,
    blocks: data.blocks?.length ? data.blocks : null,
  };
}

// Derives the report's covered period from whichever source has daily data, so
// the printed dates match the cached numbers. Falls back to the default window.
export function reportPeriod(
  data: { gsc: GscReportFull | null; ga4: Ga4ReportFull | null; blocks?: ReportBlock[] },
  fallback: { start: string; end: string }
): { start: string; end: string } {
  // Block series count too, so a client with only non-Google sources still gets
  // a period derived from real data rather than the fallback window.
  const blockDates = (data.blocks ?? []).flatMap((b) => b.series.flatMap((s) => s.points.map((p) => p.date)));
  const dates = [...(data.gsc?.byDate ?? []), ...(data.ga4?.byDate ?? [])]
    .map((d) => d.date)
    .concat(blockDates)
    .filter(Boolean)
    .sort();
  if (dates.length === 0) return fallback;
  return { start: dates[0], end: dates[dates.length - 1] };
}
