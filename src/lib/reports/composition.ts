// How much report the data actually justifies.
//
// The first attempt at adaptive composition used a boolean — "no detail
// sections and at most one channel" — which is really a description of one
// sparse test account rather than a measure of anything. A client with three
// ad platforms and no Search Console would have been called rich; a client with
// nine months of dense Search Console data and nothing else, sparse.
//
// This counts renderable content instead. A "unit" is one thing a reader can
// actually look at: a group of KPIs, a chart with enough points to be a chart, a
// table with rows, an interpretation. Pagination follows from the count, so the
// report grows and shrinks with the data rather than with a template.
import type { GscReportFull, Ga4ReportFull } from "@/lib/google";
import type { ReportBlock } from "@/lib/integrations/blocks";

/** Minimum points before a line is a trend rather than a pair of dots. */
export const MIN_TREND_POINTS = 5;

export type ChannelWeight = {
  sourceId: string;
  sourceName: string;
  /** Renderable units this channel contributes. */
  units: number;
  /** True when it has enough to justify starting its own page. */
  standalone: boolean;
};

export type Composition = {
  /** Total renderable units across the whole report. */
  units: number;
  /** Units contributed by Search Console + Analytics. */
  googleUnits: number;
  /** Per-channel weights, heaviest first — the render order. */
  channels: ChannelWeight[];
  /**
   * Density band. Drives page breaks only; every section still renders on its
   * own merit, so a "minimal" report never loses analysis it has evidence for.
   */
  density: "minimal" | "moderate" | "substantial";
  /**
   * Whether the closing sections (overview, interpretation, coverage) should
   * flow on with the dashboard rather than each opening a page. True only when
   * there genuinely isn't enough to fill them.
   */
  flowSummary: boolean;
};

const has = (n: number | null | undefined) => typeof n === "number" && Number.isFinite(n);

/** Units for one Search Console snapshot. */
function gscUnits(gsc: GscReportFull | null): number {
  if (!gsc) return 0;
  let u = 1; // the KPI group
  if ((gsc.byDate?.length ?? 0) >= MIN_TREND_POINTS) u += 2; // clicks + position charts
  if ((gsc.topQueries?.length ?? 0) > 0) u += 1;
  if ((gsc.topPages?.length ?? 0) > 0) u += 1;
  if ((gsc.movers?.winners?.length ?? 0) > 0 || (gsc.movers?.decliners?.length ?? 0) > 0) u += 1;
  if ((gsc.movers?.opportunities?.length ?? 0) > 0) u += 1;
  if ((gsc.topCountries?.length ?? 0) > 0 || (gsc.topDevices?.length ?? 0) > 0) u += 1;
  return u;
}

/** Units for one GA4 snapshot. */
function ga4Units(ga4: Ga4ReportFull | null): number {
  if (!ga4) return 0;
  let u = 1;
  if ((ga4.byDate?.length ?? 0) >= MIN_TREND_POINTS) u += 1;
  if ((ga4.trafficSources?.length ?? 0) > 0) u += 1;
  if ((ga4.topLandingPages?.length ?? 0) > 0) u += 1;
  if ((ga4.devices?.length ?? 0) > 0 || (ga4.countries?.length ?? 0) > 0) u += 1;
  if (has(ga4.totals?.totalRevenue) && ga4.totals.totalRevenue > 0) u += 1;
  return u;
}

/** Units for one non-Google channel. */
export function blockUnits(b: ReportBlock): number {
  let u = 0;
  // KPIs only count when at least one is actually calculable — a card row of
  // em dashes is not content.
  if (b.kpis.some((k) => k.value !== null)) u += 1;
  u += b.series.filter((ser) => ser.points.length >= MIN_TREND_POINTS).length;
  u += b.tables.filter((t) => t.rows.length > 0).length;
  return u;
}

/**
 * Assesses a report's contents.
 *
 * `insightUnits` covers the interpretation layer, which is real content and so
 * counts toward whether the closing pages are worth opening.
 */
export function assessComposition(input: {
  gsc: GscReportFull | null;
  ga4: Ga4ReportFull | null;
  blocks: ReportBlock[];
  insightUnits?: number;
}): Composition {
  const googleUnits = gscUnits(input.gsc) + ga4Units(input.ga4);

  const channels: ChannelWeight[] = input.blocks
    .map((b) => {
      const units = blockUnits(b);
      return {
        sourceId: b.sourceId,
        sourceName: b.sourceName,
        units,
        // Two or more distinct things to look at justify a page of its own.
        standalone: units >= 3,
      };
    })
    .filter((c) => c.units > 0)
    // Heaviest first: the channel carrying the most data leads, rather than
    // every channel getting identical treatment in connection order.
    .sort((a, b) => b.units - a.units);

  const channelUnits = channels.reduce((a, c) => a + c.units, 0);
  const units = googleUnits + channelUnits + (input.insightUnits ?? 0);

  const density: Composition["density"] =
    units <= 4 ? "minimal" : units <= 10 ? "moderate" : "substantial";

  return {
    units,
    googleUnits,
    channels,
    density,
    // Only a genuinely thin report flows its closing sections together. A
    // moderate one keeps them on their own pages, where they have room.
    flowSummary: density === "minimal",
  };
}
