// Server-side premium white-label PDF generation for reports. Uses
// @react-pdf/renderer (no headless browser) so it runs on Vercel serverless.
// Renders the unified GSC + GA4 report into a branded, multi-page business
// document: cover page, a one-page executive dashboard (score gauge + hero
// KPIs + AI summary), sectioned performance detail with smoothed vector charts
// and zebra tables, scannable insight/action cards, a trend-based forecast, and
// running header/footer with page numbers. Layout building blocks live in
// ./components.tsx and ./charts.tsx; derived analytics in ./analysis.ts; design
// tokens in ./theme.ts.
import React from "react";
import { Document, Page, View, Text, Font, renderToBuffer } from "@react-pdf/renderer";
import { normalizeReportData } from "@/lib/report";
import { safeFetch } from "@/lib/ssrf";
import type { GscReportFull, Ga4ReportFull } from "@/lib/google";
import { makeStyles, safeColor, tint, tones, seriesColors, ink, up, down, type Tone } from "./theme";
import { fmt, pct1, fmtDate, deltaPct, deltaLabel, pagePathOf } from "./format";
import { CoverPage, PageChrome, Section, KpiCard, DataTable, HighlightChips, ChartCard, Bullets, GaugePanel, DashTile, InsightCards, ActionCard, type Branding, type Highlight, type Col } from "./components";
import { LineChart, BarList, ShareBar } from "./charts";
import { Icon, TrendArrow } from "./icons";
import { performanceScore, bestChannel, biggestOpportunity, biggestRisk, toInsightCard, actionMeta, buildForecast } from "./analysis";

export type { Branding };

// Business documents shouldn't hyphenate ("Re-port" on the cover). Words wrap
// whole; long URLs/queries are pre-truncated by the table layer.
Font.registerHyphenationCallback((word) => [word]);

// A4 content width: 595pt − 2 × 46pt page padding.
const CONTENT_W = 503;
const CARD_PAD = 22; // ChartCard horizontal padding (11 × 2)
const HALF_W = Math.floor((CONTENT_W - 10) / 2);

// ── Auto-computed "at a glance" movements for the executive summary ──────────
function buildHighlights(gsc: GscReportFull | null, ga4: Ga4ReportFull | null): Highlight[] {
  type Cand = { label: string; cur: number; prev: number | null | undefined; lowerBetter?: boolean; format: (n: number) => string };
  const cands: Cand[] = [];
  if (gsc) {
    cands.push(
      { label: "Organic clicks", cur: gsc.totals.clicks, prev: gsc.previousTotals?.clicks, format: fmt },
      { label: "Search impressions", cur: gsc.totals.impressions, prev: gsc.previousTotals?.impressions, format: fmt },
      { label: "Avg. CTR", cur: gsc.totals.ctr, prev: gsc.previousTotals?.ctr, format: pct1 },
      { label: "Avg. position", cur: gsc.totals.position, prev: gsc.previousTotals?.position, lowerBetter: true, format: (n) => n.toFixed(1) },
    );
  }
  if (ga4) {
    cands.push(
      { label: "Users", cur: ga4.totals.users, prev: ga4.previousTotals?.users, format: fmt },
      { label: "Sessions", cur: ga4.totals.sessions, prev: ga4.previousTotals?.sessions, format: fmt },
      { label: "Engagement rate", cur: ga4.totals.engagementRate, prev: ga4.previousTotals?.engagementRate, format: pct1 },
      { label: "Conversions", cur: ga4.totals.conversions, prev: ga4.previousTotals?.conversions, format: fmt },
    );
    if (ga4.totals.totalRevenue > 0) {
      cands.push({ label: "Revenue", cur: ga4.totals.totalRevenue, prev: ga4.previousTotals?.totalRevenue, format: fmt });
    }
  }
  return cands
    .map((c) => ({ c, delta: deltaPct(c.cur, c.prev) }))
    .filter((x): x is { c: Cand; delta: number } => x.delta != null && Math.abs(x.delta) >= 2)
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
    .slice(0, 6)
    .map(({ c, delta }) => ({
      text: `${c.label}: ${c.format(c.cur)} (${deltaLabel(delta)})`,
      delta,
      good: c.lowerBetter ? delta < 0 : delta > 0,
    }));
}

// Business-friendly deterministic summary used when AI insights are disabled,
// so the executive summary section never ships empty.
function buildFallbackSummary(clientName: string, period: { start: string; end: string }, gsc: GscReportFull | null, ga4: Ga4ReportFull | null): string {
  const parts: string[] = [];
  if (gsc) {
    const d = deltaPct(gsc.totals.clicks, gsc.previousTotals?.clicks);
    parts.push(
      `organic search delivered ${fmt(gsc.totals.clicks)} clicks from ${fmt(gsc.totals.impressions)} impressions` +
        (d != null ? ` (${deltaLabel(d)} vs. the previous period)` : "")
    );
  }
  if (ga4) {
    const d = deltaPct(ga4.totals.sessions, ga4.previousTotals?.sessions);
    parts.push(
      `the website recorded ${fmt(ga4.totals.sessions)} sessions from ${fmt(ga4.totals.users)} users` +
        (d != null ? ` (${deltaLabel(d)} vs. the previous period)` : "")
    );
  }
  if (parts.length === 0) return `No performance data was available for ${clientName} in this reporting period.`;
  let out = `Between ${fmtDate(period.start)} and ${fmtDate(period.end)}, ${parts.join(", and ")}.`;
  if (ga4 && ga4.totals.conversions > 0) {
    out += ` The period generated ${fmt(ga4.totals.conversions)} conversions` +
      (ga4.totals.totalRevenue > 0 ? ` and ${fmt(ga4.totals.totalRevenue)} in tracked revenue.` : ".");
  }
  return out;
}

// ── Document ─────────────────────────────────────────────────────────────────
function ReportPdfDoc({ data, branding, logoSrc, clientName, title, period, generatedAt }: {
  data: unknown;
  branding: Branding;
  logoSrc: string | null;
  clientName: string;
  title: string;
  period: { start: string; end: string };
  generatedAt: string;
}) {
  const color = safeColor(branding.brand_color);
  const s = makeStyles(color);
  const { gsc, ga4, insights } = normalizeReportData(data);

  const ins = insights as {
    executiveSummary?: string; summary?: string;
    keyWins?: string[]; highlights?: string[];
    issuesDetected?: string[]; growthOpportunities?: string[];
    recommendedActions?: string[]; recommendations?: string[];
  } | null;
  const executiveSummary = ins?.executiveSummary ?? ins?.summary ?? "";
  const keyWins = ins?.keyWins ?? ins?.highlights ?? [];
  const issuesDetected = ins?.issuesDetected ?? [];
  const growthOpportunities = ins?.growthOpportunities ?? [];
  const recommendedActions = ins?.recommendedActions ?? ins?.recommendations ?? [];

  const movers = gsc?.movers ?? null;
  const opportunities = movers?.opportunities ?? [];
  const highlights = buildHighlights(gsc, ga4);
  const summaryText = executiveSummary || buildFallbackSummary(clientName, period, gsc, ga4);
  const badge = gsc && ga4 ? "SEO + Analytics Report" : ga4 ? "Analytics Report" : "SEO Report";
  const chrome = { s, branding, title, generatedAt, logoSrc };

  const revenue = ga4 && ga4.totals.totalRevenue > 0 ? ga4.totals.totalRevenue : null;
  const convRate = ga4 && ga4.totals.sessions > 0 ? ga4.totals.conversions / ga4.totals.sessions : null;
  const prevConvRate = ga4?.previousTotals && ga4.previousTotals.sessions > 0 ? ga4.previousTotals.conversions / ga4.previousTotals.sessions : null;

  // Hero KPIs for the dashboard: the four metrics that matter most to an
  // executive, built from whatever this report actually has. ROAS needs ad
  // spend (not in the GSC+GA4 model), so it's omitted rather than invented.
  type Hero = { icon: string; label: string; value: string; delta: number | null; lowerBetter?: boolean };
  const heroKpis: Hero[] = [];
  if (revenue != null) heroKpis.push({ icon: "dollar", label: "Revenue", value: fmt(revenue), delta: deltaPct(revenue, ga4!.previousTotals?.totalRevenue) });
  if (convRate != null) heroKpis.push({ icon: "checkCircle", label: "Conversion Rate", value: pct1(convRate), delta: deltaPct(convRate, prevConvRate) });
  if (ga4) heroKpis.push({ icon: "activity", label: "Traffic (sessions)", value: fmt(ga4.totals.sessions), delta: deltaPct(ga4.totals.sessions, ga4.previousTotals?.sessions) });
  else if (gsc) heroKpis.push({ icon: "clicks", label: "Organic Clicks", value: fmt(gsc.totals.clicks), delta: deltaPct(gsc.totals.clicks, gsc.previousTotals?.clicks) });
  if (ga4 && revenue == null) heroKpis.push({ icon: "users", label: "Users", value: fmt(ga4.totals.users), delta: deltaPct(ga4.totals.users, ga4.previousTotals?.users) });
  else if (gsc) heroKpis.push({ icon: "eye", label: "Impressions", value: fmt(gsc.totals.impressions), delta: deltaPct(gsc.totals.impressions, gsc.previousTotals?.impressions) });
  else if (ga4) heroKpis.push({ icon: "target", label: "Conversions", value: fmt(ga4.totals.conversions), delta: deltaPct(ga4.totals.conversions, ga4.previousTotals?.conversions) });
  const heroRow = heroKpis.slice(0, 4);

  // Executive-dashboard derivations (deterministic, real data only).
  const score = performanceScore(gsc, ga4);
  const channelTile = bestChannel(ga4);
  const opportunityTile = biggestOpportunity(gsc, growthOpportunities);
  const riskTile = biggestRisk(gsc, issuesDetected);
  const dashTiles = [channelTile, opportunityTile, riskTile].filter((t): t is NonNullable<typeof t> => t != null);
  const forecast = buildForecast(gsc, ga4);

  const hasTrends = (gsc?.byDate?.length ?? 0) > 1 || (ga4?.byDate?.length ?? 0) > 1;
  const hasSearch = !!gsc && (gsc.topQueries.length > 0 || (movers?.winners?.length ?? 0) > 0 || opportunities.length > 0);
  const hasTraffic = !!ga4 && ((ga4.trafficSources?.length ?? 0) > 0 || (ga4.topLandingPages?.length ?? 0) > 0);
  const hasAudience = !!ga4 && ((ga4.devices?.length ?? 0) > 0 || (ga4.countries?.length ?? 0) > 0);
  const hasDetails = hasTrends || hasSearch || hasTraffic || hasAudience;
  const hasInsightCards = keyWins.length > 0 || issuesDetected.length > 0 || growthOpportunities.length > 0;
  const hasInsights = hasInsightCards || recommendedActions.length > 0 || !!branding.footer_text;

  // Sections are numbered in document order; only rendered sections count.
  let sn = 0;
  const num = () => String(++sn).padStart(2, "0");

  const palette = seriesColors(color);

  const queryCols: Col<{ key: string; clicks: number; impressions: number; ctr: number; position: number }>[] = [
    { header: "Query", flex: 1, cell: (q) => q.key },
    { header: "Clicks", width: 48, align: "right", strong: true, cell: (q) => fmt(q.clicks) },
    { header: "Impressions", width: 62, align: "right", cell: (q) => fmt(q.impressions) },
    { header: "CTR", width: 42, align: "right", cell: (q) => pct1(q.ctr) },
    { header: "Position", width: 44, align: "right", cell: (q) => q.position.toFixed(1) },
  ];

  return (
    <Document title={title} author={branding.name || "Agency"} subject={`Performance report for ${clientName}`} creator={branding.name || "Agency"}>
      <CoverPage s={s} color={color} branding={branding} logoSrc={logoSrc} badge={badge} title={title} clientName={clientName} period={period} generatedAt={generatedAt} />

      {/* ── Executive dashboard: the whole report in 30 seconds ── */}
      {(gsc || ga4) ? (
        <Page size="A4" style={s.page}>
          <PageChrome {...chrome} />
          <Section s={s} num={num()} title="Executive Dashboard" subtitle={`${clientName} · ${fmtDate(period.start)} – ${fmtDate(period.end)} · vs. previous period`}>
            {/* Score gauge + AI summary */}
            <View style={s.dashRow}>
              {score ? <GaugePanel s={s} color={color} data={score} /> : null}
              <View style={s.dashSummaryCard}>
                <Text style={s.dashSummaryTitle}>Executive Summary</Text>
                <Text style={s.dashSummaryText}>{summaryText}</Text>
              </View>
            </View>

            {/* Hero KPIs */}
            {heroRow.length > 0 ? (
              <View style={[s.dashRow, { marginBottom: dashTiles.length > 0 ? 12 : 0 }]} wrap={false}>
                {heroRow.map((k) => (
                  <KpiCard key={k.label} s={s} color={color} icon={k.icon} label={k.label} value={k.value} delta={k.delta} lowerBetter={k.lowerBetter} hero />
                ))}
              </View>
            ) : null}

            {/* Best channel / biggest opportunity / biggest risk */}
            {dashTiles.length > 0 ? (
              <View style={s.dashRow} wrap={false}>
                {channelTile ? <DashTile s={s} tone={tones.info} icon="compass" data={channelTile} /> : null}
                {opportunityTile ? <DashTile s={s} tone={{ fg: tint(color, 0.15), bg: tint(color, 0.9), border: color }} icon="bulb" data={opportunityTile} /> : null}
                {riskTile ? <DashTile s={s} tone={tones.warning} icon="alert" data={riskTile} /> : null}
              </View>
            ) : null}
          </Section>
        </Page>
      ) : null}

      {/* ── Executive summary + performance overview ── */}
      <Page size="A4" style={s.page}>
        <PageChrome {...chrome} />

        <Section s={s} num={num()} title="Executive Summary" subtitle={`${clientName} · ${fmtDate(period.start)} – ${fmtDate(period.end)}`}>
          <View style={s.summaryPanel}>
            <Text style={s.para}>{summaryText}</Text>
          </View>
          {highlights.length > 0 ? (
            <View style={{ marginTop: 12 }}>
              <Text style={s.groupLabel}>Biggest movements this period</Text>
              <HighlightChips s={s} items={highlights} />
            </View>
          ) : null}
        </Section>

        {(gsc || ga4) ? (
          <Section s={s} num={num()} title="Performance Overview" subtitle="Key metrics for the reporting period, compared with the previous period.">
            {gsc ? (
              <View wrap={false}>
                <Text style={s.groupLabel}>Search visibility · Google Search Console</Text>
                <View style={s.kpiRow}>
                  <KpiCard s={s} color={color} icon="clicks" label="Clicks" value={fmt(gsc.totals.clicks)} delta={deltaPct(gsc.totals.clicks, gsc.previousTotals?.clicks)} />
                  <KpiCard s={s} color={color} icon="eye" label="Impressions" value={fmt(gsc.totals.impressions)} delta={deltaPct(gsc.totals.impressions, gsc.previousTotals?.impressions)} />
                  <KpiCard s={s} color={color} icon="percent" label="Avg. CTR" value={pct1(gsc.totals.ctr)} delta={deltaPct(gsc.totals.ctr, gsc.previousTotals?.ctr)} />
                  <KpiCard s={s} color={color} icon="target" label="Avg. Position" value={gsc.totals.position.toFixed(1)} delta={deltaPct(gsc.totals.position, gsc.previousTotals?.position)} lowerBetter />
                </View>
              </View>
            ) : null}
            {ga4 ? (
              <View wrap={false}>
                <Text style={s.groupLabel}>Website engagement · Google Analytics 4</Text>
                <View style={s.kpiRow}>
                  <KpiCard s={s} color={color} icon="users" label="Users" value={fmt(ga4.totals.users)} delta={deltaPct(ga4.totals.users, ga4.previousTotals?.users)} />
                  <KpiCard s={s} color={color} icon="activity" label="Sessions" value={fmt(ga4.totals.sessions)} delta={deltaPct(ga4.totals.sessions, ga4.previousTotals?.sessions)} />
                  <KpiCard s={s} color={color} icon="zap" label="Engagement Rate" value={pct1(ga4.totals.engagementRate)} delta={deltaPct(ga4.totals.engagementRate, ga4.previousTotals?.engagementRate)} />
                  <KpiCard s={s} color={color} icon="checkCircle" label="Conversions" value={fmt(ga4.totals.conversions)} delta={deltaPct(ga4.totals.conversions, ga4.previousTotals?.conversions)} />
                </View>
              </View>
            ) : null}
            {ga4 && revenue != null ? (
              <View wrap={false}>
                <Text style={s.groupLabel}>Ecommerce & conversions</Text>
                <View style={s.kpiRow}>
                  <KpiCard s={s} color={color} icon="dollar" label="Total Revenue" value={fmt(revenue)} delta={deltaPct(revenue, ga4.previousTotals?.totalRevenue)} />
                  <KpiCard s={s} color={color} icon="percent" label="Conversion Rate" value={convRate != null ? pct1(convRate) : "—"} delta={convRate != null ? deltaPct(convRate, prevConvRate) : null} />
                  <KpiCard s={s} color={color} icon="userPlus" label="New Users" value={fmt(ga4.totals.newUsers)} delta={deltaPct(ga4.totals.newUsers, ga4.previousTotals?.newUsers)} />
                  <KpiCard s={s} color={color} icon="file" label="Pageviews" value={fmt(ga4.totals.views)} delta={deltaPct(ga4.totals.views, ga4.previousTotals?.views)} />
                </View>
              </View>
            ) : null}
            {!gsc && !ga4 ? <Text style={s.para}>No data sources were connected for this reporting period.</Text> : null}
          </Section>
        ) : (
          <Section s={s} num={num()} title="Performance Overview">
            <Text style={s.para}>No data sources were connected for this reporting period.</Text>
          </Section>
        )}
      </Page>

      {/* ── Detailed performance ── */}
      {hasDetails ? (
        <Page size="A4" style={s.page}>
          <PageChrome {...chrome} />

          {hasTrends ? (
            <Section s={s} num={num()} title="Performance Trends" subtitle="Daily movement across the reporting period.">
              <View style={s.chartRow}>
                {(gsc?.byDate?.length ?? 0) > 1 ? (
                  <View style={s.chartCol}>
                    <ChartCard s={s} title="Organic clicks" value={fmt(gsc!.totals.clicks)} hint="Google Search Console">
                      <LineChart id="clicks" values={gsc!.byDate.map((d) => d.clicks)} dates={gsc!.byDate.map((d) => d.date)} color={color} width={HALF_W - CARD_PAD} />
                    </ChartCard>
                  </View>
                ) : null}
                {(ga4?.byDate?.length ?? 0) > 1 ? (
                  <View style={s.chartCol}>
                    <ChartCard s={s} title="Sessions" value={fmt(ga4!.totals.sessions)} hint="Google Analytics 4">
                      <LineChart id="sessions" values={ga4!.byDate.map((d) => d.sessions)} dates={ga4!.byDate.map((d) => d.date)} color={palette[1]} width={HALF_W - CARD_PAD} />
                    </ChartCard>
                  </View>
                ) : null}
              </View>
              {(gsc?.byDate?.length ?? 0) > 1 ? (
                <View style={{ marginTop: 10 }}>
                  <ChartCard s={s} title="Average search position" value={gsc!.totals.position.toFixed(1)} hint="Lower is better — the axis is inverted so an upward line means improving rank.">
                    <LineChart id="position" values={gsc!.byDate.map((d) => d.position)} dates={gsc!.byDate.map((d) => d.date)} color={palette[2]} width={CONTENT_W - CARD_PAD} height={60} reversed />
                  </ChartCard>
                </View>
              ) : null}
            </Section>
          ) : null}

          {hasSearch ? (
            <Section s={s} num={num()} title="Search Performance" subtitle="What people searched to find the site, and how rankings moved.">
              {gsc!.topQueries.length > 0 ? (
                <View>
                  <Text style={s.h3}>Top queries by clicks</Text>
                  <DataTable s={s} cols={queryCols} rows={gsc!.topQueries.slice(0, 10)} />
                </View>
              ) : null}
              {(movers?.winners?.length ?? 0) > 0 || (movers?.decliners?.length ?? 0) > 0 ? (
                <View style={[s.twoCol, { marginTop: 12 }]} wrap={false}>
                  {(movers?.winners?.length ?? 0) > 0 ? (
                    <View style={s.col}>
                      <Text style={s.h3}>Winning keywords</Text>
                      <DataTable
                        s={s}
                        cols={[
                          { header: "Query", flex: 1, cell: (m) => m.key },
                          { header: "Clicks", width: 40, align: "right", strong: true, cell: (m) => fmt(m.clicks) },
                          { header: "Change", width: 46, align: "right", cell: (m) => deltaLabel(m.changePct) },
                        ] satisfies Col<NonNullable<typeof movers>["winners"][number]>[]}
                        rows={movers!.winners.slice(0, 5)}
                      />
                    </View>
                  ) : null}
                  {(movers?.decliners?.length ?? 0) > 0 ? (
                    <View style={s.col}>
                      <Text style={s.h3}>Declining keywords</Text>
                      <DataTable
                        s={s}
                        cols={[
                          { header: "Query", flex: 1, cell: (m) => m.key },
                          { header: "Clicks", width: 40, align: "right", strong: true, cell: (m) => fmt(m.clicks) },
                          { header: "Change", width: 46, align: "right", cell: (m) => deltaLabel(m.changePct) },
                        ] satisfies Col<NonNullable<typeof movers>["decliners"][number]>[]}
                        rows={movers!.decliners.slice(0, 5)}
                      />
                    </View>
                  ) : null}
                </View>
              ) : null}
              {opportunities.length > 0 ? (
                <View style={{ marginTop: 12 }} wrap={false}>
                  <Text style={s.h3}>Ranking opportunities (just off page one)</Text>
                  <DataTable
                    s={s}
                    cols={[
                      { header: "Query", flex: 1, cell: (o) => o.key },
                      { header: "Impressions", width: 62, align: "right", cell: (o) => fmt(o.impressions) },
                      { header: "Position", width: 46, align: "right", strong: true, cell: (o) => o.position.toFixed(1) },
                    ] satisfies Col<(typeof opportunities)[number]>[]}
                    rows={opportunities.slice(0, 5)}
                  />
                </View>
              ) : null}
            </Section>
          ) : null}

          {hasTraffic ? (
            <Section s={s} num={num()} title="Traffic & Acquisition" subtitle="Where sessions came from and which pages received them.">
              {(ga4!.trafficSources?.length ?? 0) > 0 ? (
                <View wrap={false}>
                  <Text style={s.h3}>Sessions by channel</Text>
                  <BarList s={s} color={color} rows={ga4!.trafficSources!.map((t) => ({ label: t.key, value: t.sessions }))} />
                </View>
              ) : null}
              {(ga4!.topLandingPages?.length ?? 0) > 0 ? (
                <View style={{ marginTop: 10 }}>
                  <Text style={s.h3}>Top landing pages</Text>
                  <DataTable
                    s={s}
                    cols={[
                      { header: "Page", flex: 1, cell: (p) => pagePathOf(p.key) },
                      { header: "Sessions", width: 56, align: "right", strong: true, cell: (p) => fmt(p.sessions) },
                      { header: "Users", width: 50, align: "right", cell: (p) => fmt(p.users) },
                    ] satisfies Col<{ key: string; sessions: number; users: number }>[]}
                    rows={ga4!.topLandingPages!.slice(0, 8)}
                  />
                </View>
              ) : null}
            </Section>
          ) : null}

          {hasAudience ? (
            <Section s={s} num={num()} title="Audience" subtitle="Devices and locations of the people visiting the site.">
              <View style={s.twoCol} wrap={false}>
                {(ga4!.devices?.length ?? 0) > 0 ? (
                  <View style={s.col}>
                    <Text style={s.h3}>Sessions by device</Text>
                    <ShareBar
                      s={s}
                      colors={palette}
                      segments={ga4!.devices!.slice(0, 4).map((d) => ({ label: d.key.charAt(0).toUpperCase() + d.key.slice(1), value: d.sessions }))}
                    />
                  </View>
                ) : null}
                {(ga4!.countries?.length ?? 0) > 0 ? (
                  <View style={s.col}>
                    <Text style={s.h3}>Top countries</Text>
                    <DataTable
                      s={s}
                      cols={[
                        { header: "Country", flex: 1, cell: (c) => c.key },
                        { header: "Sessions", width: 56, align: "right", strong: true, cell: (c) => fmt(c.sessions) },
                      ] satisfies Col<{ key: string; sessions: number; users: number }>[]}
                      rows={ga4!.countries!.slice(0, 6)}
                    />
                  </View>
                ) : null}
              </View>
            </Section>
          ) : null}
        </Page>
      ) : null}

      {/* ── Insights & recommendations ── */}
      {hasInsights ? (
        <Page size="A4" style={s.page}>
          <PageChrome {...chrome} />

          {hasInsightCards ? (
            <Section s={s} num={num()} title="Insights & Analysis" subtitle="What stood out this period — scan the cards for the headline, read on for detail.">
              {keyWins.length > 0 ? (
                <View style={{ marginBottom: 12 }}>
                  <Text style={s.groupLabel}>Key Wins</Text>
                  <InsightCards s={s} tone={tones.positive} icon="check" kind="Win" items={keyWins.map(toInsightCard)} />
                </View>
              ) : null}
              {issuesDetected.length > 0 ? (
                <View style={{ marginBottom: 12 }}>
                  <Text style={s.groupLabel}>Risks</Text>
                  <InsightCards s={s} tone={tones.warning} icon="alert" kind="Risk" items={issuesDetected.map(toInsightCard)} />
                </View>
              ) : null}
              {growthOpportunities.length > 0 ? (
                <View>
                  <Text style={s.groupLabel}>Opportunities</Text>
                  <InsightCards s={s} tone={tones.info} icon="bulb" kind="Opportunity" items={growthOpportunities.map(toInsightCard)} />
                </View>
              ) : null}
            </Section>
          ) : null}

          {recommendedActions.length > 0 ? (
            <Section s={s} num={num()} title="Executive Recommendations" subtitle="Prioritized next steps, ordered by expected business impact.">
              {recommendedActions.slice(0, 6).map((a, i) => {
                const meta = actionMeta(a, i, Math.min(6, recommendedActions.length));
                return <ActionCard key={i} s={s} color={color} index={i} priority={meta.priority} impact={meta.impact} focus={meta.focus} card={toInsightCard(a)} />;
              })}
            </Section>
          ) : null}

          {branding.footer_text ? (
            <Section s={s} num={num()} title="Notes">
              <Bullets s={s} items={[branding.footer_text]} />
            </Section>
          ) : null}
        </Page>
      ) : null}

      {/* ── Forecast & outlook (only when enough historical data exists) ── */}
      {forecast ? (
        <Page size="A4" style={s.page}>
          <PageChrome {...chrome} />
          <Section s={s} num={num()} title="Forecast & Outlook" subtitle={`Projected performance for the next ${forecast.days} days, based on the current trend.`}>
            <View style={{ marginBottom: 12 }}>
              <Text style={[s.confidenceBadge, forecast.confidence === "High" ? { backgroundColor: tones.positive.bg, color: tones.positive.fg } : forecast.confidence === "Moderate" ? { backgroundColor: tones.info.bg, color: tones.info.fg } : { backgroundColor: ink.bgSoft, color: ink[500] }]}>
                {forecast.confidence} confidence
              </Text>
            </View>
            <View style={s.forecastGrid}>
              {forecast.items.map((it) => {
                const good = it.growthPct >= 0;
                return (
                  <View key={it.label} style={s.forecastCard} wrap={false}>
                    <View style={s.kpiTop}>
                      <View style={s.kpiIconBox}><Icon name={it.icon} size={9} color={color} strokeWidth={2.2} /></View>
                      <Text style={s.kpiLabel}>{it.label}</Text>
                    </View>
                    <Text style={s.forecastProj}>{fmt(it.projected)}</Text>
                    <View style={s.kpiDeltaRow}>
                      <TrendArrow dir={good ? "up" : "down"} color={good ? up : down} size={5.5} />
                      <Text style={[s.kpiDelta, good ? s.up : s.down]}>{deltaLabel(it.growthPct)}</Text>
                    </View>
                    <Text style={s.forecastCur}>Current: {fmt(it.current)}</Text>
                  </View>
                );
              })}
            </View>
            <View style={s.summaryPanel}>
              <Text style={s.para}>{forecast.narrative}</Text>
            </View>
          </Section>
        </Page>
      ) : null}
    </Document>
  );
}

// ── Logo prefetch ────────────────────────────────────────────────────────────
// react-pdf's <Image> can fetch remote URLs itself, but a slow or broken logo
// URL would then fail the whole render. Fetch it up front with a short timeout
// and an SSRF guard, and fall back to the monogram on any problem. PNG/JPEG
// only — the PDF engine doesn't decode SVG or WebP.
async function fetchLogoDataUri(url: string | null | undefined): Promise<string | null> {
  if (!url || !/^https?:\/\//i.test(url)) return null;
  try {
    // SSRF-safe: IP-pinned at connect time + per-hop redirect validation.
    const res = await safeFetch(url, { timeoutMs: 3500 });
    if (!res.ok) return null;
    const ct = (res.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
    if (ct !== "image/png" && ct !== "image/jpeg" && ct !== "image/jpg") return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length === 0 || buf.length > 2_000_000) return null;
    return `data:${ct === "image/jpg" ? "image/jpeg" : ct};base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}

// Renders the report to a PDF buffer (for download or email attachment).
export async function renderReportPdf(args: {
  data: unknown;
  branding: Branding;
  clientName: string;
  title: string;
  period: { start: string; end: string };
  generatedAt?: string;
}): Promise<Buffer> {
  const generatedAt = args.generatedAt ?? new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  const logoSrc = await fetchLogoDataUri(args.branding.logo_url);
  return renderToBuffer(<ReportPdfDoc {...args} logoSrc={logoSrc} generatedAt={generatedAt} />);
}
