"use client";

import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Line, LineChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import {
  TrendingUp, TrendingDown, ArrowUpRight, ArrowDownRight, Target,
  StickyNote, Trophy, AlertTriangle, Lightbulb, Search, BarChart3,
} from "lucide-react";
import { normalizeReportData, periodDayCount } from "@/lib/report";
import { formatBlockValue } from "@/lib/integrations/blocks";
import { detectSignals } from "@/lib/insights/signals";
import { allSoWhat, allActions, NO_EVIDENCE_NOTE } from "@/lib/reports/soWhat";
import { buildExecutiveSummary, blockHasComparison, hasCalculableKpis, periodSubtitle } from "@/lib/reports/summary";
import { agencyNote, cleanBullets, cleanCommentary } from "@/lib/reports/commentary";
import { badgeRepeatsTitle, coverBadgeLabel } from "@/lib/reports/types";
import { MAX_CHANNEL_KPIS, MIN_BREAKDOWN_ROWS, MIN_TREND_POINTS, shortPeriodNote } from "@/lib/reports/composition";
import type { GscReportFull, Ga4ReportFull } from "@/lib/google";

type Branding = { name: string; logo_url: string | null; brand_color: string; website: string | null; footer_text: string | null };

// Accepts both the current grouped insights and the legacy
// {summary, highlights, recommendations, actionPlan} shape.
type RawInsights = {
  executiveSummary?: string; keyWins?: string[]; issuesDetected?: string[];
  growthOpportunities?: string[]; recommendedActions?: string[];
  summary?: string; highlights?: string[]; recommendations?: string[]; actionPlan?: string[];
} | null | undefined;

const fmt = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 0 });
const pct1 = (n: number) => `${(n * 100).toFixed(1)}%`;

function fmtDuration(seconds: number): string {
  const s = Math.round(seconds);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return rem ? `${m}m ${rem}s` : `${m}m`;
}

function delta(cur: number, prev: number | null | undefined, lowerIsBetter = false) {
  if (prev == null || prev === 0) return null;
  const pct = ((cur - prev) / prev) * 100;
  if (!isFinite(pct)) return null;
  return { pct, good: lowerIsBetter ? pct < 0 : pct > 0 };
}

function shade(hex: string) {
  try {
    const n = parseInt(hex.replace("#", ""), 16);
    return `rgb(${Math.max(0, ((n >> 16) & 255) - 40)},${Math.max(0, ((n >> 8) & 255) - 40)},${Math.max(0, (n & 255) - 40)})`;
  } catch {
    return hex;
  }
}

// The cover of a client-facing deliverable shouldn't read "2026-07-15 →
// 2026-08-11". Parsed from the parts rather than `new Date(iso)` so a browser
// west of UTC doesn't render the previous day. Anything that isn't a plain
// YYYY-MM-DD is passed through untouched.
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function parseIsoDay(s: string | null | undefined): { d: number; m: number; y: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec((s ?? "").slice(0, 10));
  if (!m) return null;
  const month = Number(m[2]) - 1;
  if (month < 0 || month > 11) return null;
  return { y: Number(m[1]), m: month, d: Number(m[3]) };
}

function formatPeriod(start: string | null | undefined, end: string | null | undefined): string {
  const a = parseIsoDay(start);
  const b = parseIsoDay(end);
  if (!a || !b) return [start, end].filter(Boolean).join(" → ");
  const left = a.y === b.y ? `${a.d} ${MONTHS[a.m]}` : `${a.d} ${MONTHS[a.m]} ${a.y}`;
  return `${left} – ${b.d} ${MONTHS[b.m]} ${b.y}`;
}

function pagePathOf(url: string): string {
  try {
    const u = new URL(url);
    return (u.pathname || "/") + (u.search || "");
  } catch {
    return url;
  }
}

// AI text is cleaned before it is trusted. Models add list numbering to strings
// that are already list items, and the renderer used to pass every element
// through — a bullet reading "1" rendered next to the list's own ordinal.
function normInsights(ins: RawInsights) {
  if (!ins) return null;
  const executiveSummary = (ins.executiveSummary ?? ins.summary ?? "").trim();
  const keyWins = cleanBullets(ins.keyWins ?? ins.highlights);
  const issuesDetected = cleanBullets(ins.issuesDetected);
  const growthOpportunities = cleanBullets(ins.growthOpportunities);
  const recommendedActions = ins.recommendedActions ?? ins.recommendations ?? [];
  const empty = !executiveSummary && !keyWins.length && !issuesDetected.length && !growthOpportunities.length && !recommendedActions.length;
  return empty ? null : { executiveSummary, keyWins, issuesDetected, growthOpportunities, recommendedActions };
}

// Merge GSC pages (clicks/impressions) and GA4 landing pages (sessions/users)
// keyed by path, so SEO traffic and on-site engagement sit side by side.
type LandingRow = { path: string; clicks?: number; impressions?: number; sessions?: number; users?: number };
function mergeLandingPages(gsc: GscReportFull | null, ga4: Ga4ReportFull | null): LandingRow[] {
  const map = new Map<string, LandingRow>();
  for (const p of gsc?.topPages ?? []) {
    const path = pagePathOf(p.key);
    const cur = map.get(path) ?? { path };
    cur.clicks = (cur.clicks ?? 0) + p.clicks;
    cur.impressions = (cur.impressions ?? 0) + p.impressions;
    map.set(path, cur);
  }
  for (const p of ga4?.topLandingPages ?? []) {
    const path = p.key || "/";
    const cur = map.get(path) ?? { path };
    cur.sessions = (cur.sessions ?? 0) + p.sessions;
    cur.users = (cur.users ?? 0) + p.users;
    map.set(path, cur);
  }
  return Array.from(map.values())
    .sort((a, b) => (b.sessions ?? b.clicks ?? 0) - (a.sessions ?? a.clicks ?? 0))
    .slice(0, 8);
}

export function ReportDocument({
  branding,
  clientName,
  clientLogoUrl,
  title,
  period,
  data,
}: {
  branding: Branding;
  clientName: string;
  /** The client's own logo, scoped to this report by the branding loader. */
  clientLogoUrl?: string | null;
  title: string;
  period: { start: string; end: string };
  data: unknown;
}) {
  const color = branding.brand_color || "#4f46e5";
  const { gsc, ga4, blocks, insights, meta } = normalizeReportData(data);
  // Every connected integration other than Search Console / GA4, already
  // projected into the neutral block vocabulary. Rendered generically below, so
  // a new integration appears here without touching this component.
  const channelBlocks = (blocks ?? []).filter((b) => b.kpis.length > 0 || b.tables.length > 0);
  const ins = normInsights(insights as RawInsights);

  const winners = gsc?.movers?.winners ?? [];
  const decliners = gsc?.movers?.decliners ?? [];
  const opportunities = gsc?.movers?.opportunities ?? [];

  // GSC KPI cards.
  const gscClicksD = gsc ? delta(gsc.totals.clicks, gsc.previousTotals?.clicks) : null;
  const gscPosD = gsc ? delta(gsc.totals.position, gsc.previousTotals?.position, true) : null;
  const gscKpis = gsc ? [
    { l: "Clicks", v: fmt(gsc.totals.clicks), d: gscClicksD },
    { l: "Impressions", v: fmt(gsc.totals.impressions), d: delta(gsc.totals.impressions, gsc.previousTotals?.impressions) },
    { l: "Avg CTR", v: pct1(gsc.totals.ctr), d: delta(gsc.totals.ctr, gsc.previousTotals?.ctr) },
    { l: "Avg Position", v: gsc.totals.position.toFixed(1), d: gscPosD },
  ] : [];

  // GA4 KPI cards.
  const ga4Kpis = ga4 ? [
    { l: "Users", v: fmt(ga4.totals.users), d: delta(ga4.totals.users, ga4.previousTotals?.users) },
    { l: "Sessions", v: fmt(ga4.totals.sessions), d: delta(ga4.totals.sessions, ga4.previousTotals?.sessions) },
    { l: "Engagement", v: pct1(ga4.totals.engagementRate), d: delta(ga4.totals.engagementRate, ga4.previousTotals?.engagementRate) },
    { l: "Conversions", v: fmt(ga4.totals.conversions), d: delta(ga4.totals.conversions, ga4.previousTotals?.conversions) },
  ] : [];

  // A line needs enough points to be a line. The PDF has enforced this since
  // Phase 2B; the on-screen report did not, so three days of data drew a
  // "trend" chart here that the same data was refused in the document the
  // client receives. Same constant, so the two can't drift apart again.
  const gscTrend = (gsc?.byDate?.length ?? 0) >= MIN_TREND_POINTS;
  const ga4Trend = (ga4?.byDate?.length ?? 0) >= MIN_TREND_POINTS;
  const hasTrendCharts = gscTrend || ga4Trend;
  // The traffic section is worth a heading when it has a chart, the GA4
  // mini-stats, or a channel breakdown — not merely because a byDate array
  // exists.
  // A breakdown needs MIN_BREAKDOWN_ROWS rows to be a breakdown: one row is a
  // single number the totals already carry, under a heading promising a
  // ranking. A short window drew "Sessions by device: Mobile 100%" — 100% by
  // construction, because mobile was the only row returned.
  const hasChannels = (ga4?.trafficSources?.length ?? 0) >= MIN_BREAKDOWN_ROWS;
  const hasDevices = (ga4?.devices?.length ?? 0) >= MIN_BREAKDOWN_ROWS;
  const hasCountries = (ga4?.countries?.length ?? 0) >= MIN_BREAKDOWN_ROWS;
  const showTrafficSection = hasTrendCharts || hasChannels || !!ga4;

  const landing = mergeLandingPages(gsc, ga4);
  const organic = ga4?.trafficSources?.find((s) => /organic search/i.test(s.key)) ?? null;
  const organicShare = ga4 && ga4.totals.sessions > 0 && organic ? organic.sessions / ga4.totals.sessions : null;
  const convRate = ga4 && ga4.totals.sessions > 0 ? ga4.totals.conversions / ga4.totals.sessions : null;

  // ── Executive-summary callouts, each requiring a measured fact ──────────
  // Built as a list rather than three fixed slots so a slot with nothing real
  // behind it simply doesn't appear. Nothing here is generated language: every
  // string interpolates a number that came from the client's own data.
  type CalloutSpec = { tone: "emerald" | "rose" | "amber"; icon: typeof TrendingUp; title: string; text: string };
  const callouts: CalloutSpec[] = [];

  if (winners[0]) {
    callouts.push({ tone: "emerald", icon: TrendingUp, title: "Key win", text: `“${winners[0].key}” up ${Math.round(winners[0].changePct)}%.` });
  } else if (gscClicksD?.good) {
    callouts.push({ tone: "emerald", icon: TrendingUp, title: "Key win", text: `Search clicks up ${Math.abs(gscClicksD.pct).toFixed(0)}%.` });
  } else if (ga4 && ga4.totals.sessions > 0) {
    callouts.push({ tone: "emerald", icon: TrendingUp, title: "Key win", text: `${fmt(ga4.totals.sessions)} sessions, ${pct1(ga4.totals.engagementRate)} engaged.` });
  }

  if (decliners[0]) {
    callouts.push({ tone: "rose", icon: TrendingDown, title: "Watch", text: `“${decliners[0].key}” down ${Math.abs(Math.round(decliners[0].changePct))}%.` });
  } else if (ga4 && convRate != null && ga4.totals.sessions > 0) {
    callouts.push({ tone: "rose", icon: TrendingDown, title: "Watch", text: `Conversion rate ${pct1(convRate)} of sessions.` });
  }

  if (gscPosD && gsc) {
    callouts.push({ tone: "amber", icon: Target, title: "Trend", text: `Average position ${gscPosD.good ? "improved" : "slipped"} to ${gsc.totals.position.toFixed(1)}.` });
  } else if (organicShare != null) {
    callouts.push({ tone: "amber", icon: Target, title: "Trend", text: `Organic search is ${pct1(organicShare)} of sessions.` });
  } else if (opportunities.length > 0) {
    // Only when there ARE opportunities — "0 keywords near page one" was
    // presented to clients as a trend.
    callouts.push({ tone: "amber", icon: Target, title: "Trend", text: `${opportunities.length} keyword${opportunities.length === 1 ? "" : "s"} near page one.` });
  }

  const unavailable = meta?.unavailable ?? [];

  const coverBadgeRaw = coverBadgeLabel(meta?.reportType, [
    ...(gsc ? ["Search Console"] : []),
    ...(ga4 ? ["Analytics"] : []),
    ...channelBlocks.map((b) => b.sourceName),
  ]);
  // Dropped when the title already says it: the header carried the same phrase
  // twice, once as a pill and once in the title below it.
  const coverBadge = badgeRepeatsTitle(coverBadgeRaw, title) ? "" : coverBadgeRaw;

  // Same interpretation layer the PDF uses, so the on-screen report and the
  // document the client receives never disagree.
  const signals = detectSignals(gsc, ga4, 6);
  const soWhat = allSoWhat(signals, blocks ?? [], 3);
  const evidenceActions = allActions(signals, blocks ?? [], 5);

  // The written summary. The AI paragraph is preferred where one exists;
  // otherwise it is built from the measured figures. It used to be neither: with
  // no AI text the section said "a written summary needs a full period of data
  // to compare against" and stopped, on reports that had spend, clicks and
  // conversions in them. A comparison enriches the summary; its absence does not
  // make one impossible.
  const summary = buildExecutiveSummary({
    clientName, period, gsc, ga4, blocks: channelBlocks,
    watch: evidenceActions[0] ? { action: evidenceActions[0].action, because: evidenceActions[0].because } : null,
  });
  const summaryText = ins?.executiveSummary || summary.text;

  // Commentary the AI wrote that the evidence-backed steps don't already cover.
  // Empty after cleaning means the section does not render.
  const commentary = cleanCommentary(ins?.recommendedActions, evidenceActions.map((a) => a.action));

  // The agency's own closing note — null when they haven't written one.
  const note = agencyNote(branding.footer_text);

  // Whether the report has any connected source at all. A report with data but
  // no action worth taking says so outright; a report with nothing in it has
  // already said so in the summary and doesn't repeat itself.
  const hasAnySource = !!(gsc || ga4 || channelBlocks.length > 0);

  // States plainly when the period is only partly covered, rather than letting
  // the cover imply a full window of measurement.
  const coverageNote = (() => {
    const m = meta;
    if (!m) return null;
    const requested = periodDayCount(m.requested.start, m.requested.end);
    const lines: string[] = [];
    if (!m.coverage) {
      lines.push(`This report covers ${m.requested.start} to ${m.requested.end}. No day-by-day data was returned for it, so the totals above are the period figures each source reported.`);
    } else {
      const covered = periodDayCount(m.coverage.start, m.coverage.end);
      if (requested > 0 && covered > 0 && covered < requested) {
        lines.push(`Data is available for ${covered} of the ${requested} days in this period (${m.coverage.start} to ${m.coverage.end}). Figures reflect the days measured; the connected sources had no data for the rest.`);
      }
    }
    // What a short window is too short to show, so its compactness reads as a
    // decision rather than an omission.
    if (gsc || ga4) {
      const short = shortPeriodNote(requested);
      if (short) lines.push(short);
    }
    return lines.length > 0 ? lines.join(" ") : null;
  })();

  let n = 0;
  const next = () => (n += 1);

  return (
    <div className="mx-auto max-w-3xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm print:border-0 print:shadow-none">
      {/* Cover */}
      <div className="px-6 py-10 text-white sm:px-10 sm:py-12" style={{ background: `linear-gradient(135deg, ${color}, ${shade(color)})` }}>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-lg bg-white/95">
              {branding.logo_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={branding.logo_url} alt="" decoding="async" className="max-h-full max-w-full object-contain" />
              ) : (
                <span className="text-lg font-bold" style={{ color }}>{(branding.name || "A").charAt(0)}</span>
              )}
            </div>
            <span className="font-semibold">{branding.name || "Your Agency"}</span>
          </div>
          {/* Same rule as the PDF cover: the stored report type is
              authoritative, with the actually-connected channels as the
              fallback for reports generated before types existed. This used to
              be `gsc && ga4 ? … : ga4 ? … : "SEO Report"`, which labelled every
              cross-channel and ads-only report "SEO Report". */}
          {coverBadge && (
            <span className="rounded-full bg-white/15 px-3 py-1 text-xs font-medium">
              {coverBadge}
            </span>
          )}
        </div>
        <h1 className="mt-8 text-2xl font-semibold sm:mt-10 sm:text-3xl">{title}</h1>
        {/* Who the report is for. The client's mark sits beside their name as
            secondary identity — smaller than the agency logo above it and on the
            agency's own cover colour, so it never reads as the publisher. Omitted
            entirely when the client has no logo; never substituted. */}
        <div className="mt-2 flex items-center gap-2.5">
          {clientLogoUrl && (
            <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center overflow-hidden rounded-md bg-white/95">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={clientLogoUrl} alt="" decoding="async" className="max-h-full max-w-full object-contain" />
            </span>
          )}
          <p className="text-sm text-white/80">Prepared for {clientName} · {formatPeriod(period.start, period.end)}</p>
        </div>
      </div>

      <div className="space-y-10 p-6 sm:p-10">
        {/* Executive Summary.
            Every callout must be backed by a measured fact. The slots used to
            be filled unconditionally, so a report with almost no data told the
            client "Performance held steady", "No major declines to flag" and
            "0 keywords near page one" — reassurance the numbers never
            supported. A slot with no fact behind it is now omitted, and when
            nothing at all qualifies the section says so plainly. */}
        <Section n={next()} title="Executive Summary" subtitle="Performance at a glance" color={color}>
          <p className="text-sm leading-relaxed text-ink-700">{summaryText}</p>

          {callouts.length > 0 && (
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              {callouts.map((c) => (
                <Callout key={c.title} tone={c.tone} icon={c.icon} title={c.title} text={c.text} />
              ))}
            </div>
          )}

          {coverageNote && (
            <p className="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs leading-relaxed text-ink-600">
              {coverageNote}
            </p>
          )}

          {/* What this period genuinely cannot show, and why. A custom or
              calendar window is rebuilt from daily history, and some figures —
              keyword tables, unique visitors, per-period breakdowns — cannot be
              recovered from daily totals. Saying so is the honest alternative
              to omitting them silently or estimating them. */}
          {unavailable.length > 0 && (
            <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-3">
              <p className="text-xs font-semibold text-ink-700">Not available for this period</p>
              <ul className="mt-1.5 space-y-1.5">
                {unavailable.map((u) => (
                  <li key={u.section} className="text-xs leading-relaxed text-ink-600">
                    <span className="font-medium text-ink-700">{u.section}.</span> {u.reason}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Section>

        {/* SEO vs Website Performance — combined KPIs */}
        {(gsc || ga4) && (
          <Section n={next()} title={gsc && ga4 ? "Search vs Website Performance" : gsc ? "Search Performance" : "Website Performance"} subtitle={gsc && ga4 ? "Search visibility and on-site results, side by side" : gsc ? "Search visibility for the reporting period" : "On-site results for the reporting period"} color={color}>
            <div className="grid gap-6 lg:grid-cols-2">
              {gsc && <KpiGroup label="Search Console" icon={Search} color={color} kpis={gscKpis} />}
              {ga4 && <KpiGroup label="Website engagement (GA4)" icon={BarChart3} color={color} kpis={ga4Kpis} />}
            </div>
            {gsc && ga4 && (
              <p className="mt-4 rounded-lg bg-slate-50 px-4 py-3 text-xs text-ink-600">
                <span className="font-semibold text-ink-800">{fmt(gsc.totals.clicks)}</span> organic search clicks drove a site that saw{" "}
                <span className="font-semibold text-ink-800">{fmt(ga4.totals.sessions)}</span> sessions at{" "}
                <span className="font-semibold text-ink-800">{pct1(ga4.totals.engagementRate)}</span> engagement
                {organicShare != null && <> — organic search is <span className="font-semibold text-ink-800">{pct1(organicShare)}</span> of all sessions</>}.
              </p>
            )}
          </Section>
        )}

        {/* Organic Traffic Overview.
            The charts used to render on any number of daily rows, so three days
            of data drew a "trend" the PDF had already refused to draw at the
            same threshold. Both renderers now use MIN_TREND_POINTS, and the
            section only appears when something inside it survives that test —
            an empty frame around two flat lines is worse than no section. */}
        {showTrafficSection && (
          <Section
            n={next()}
            title="Organic Traffic Overview"
            subtitle={hasTrendCharts ? "How traffic and visibility moved this period" : "Traffic composition for this period"}
            color={color}
          >
            {ga4 && (
              <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <MiniStat label="Organic sessions" value={organic ? fmt(organic.sessions) : "—"} color={color} />
                <MiniStat label="Organic share" value={organicShare != null ? pct1(organicShare) : "—"} color={color} />
                <MiniStat label="New users" value={fmt(ga4.totals.newUsers)} color={color} />
                <MiniStat label="Avg engagement" value={fmtDuration(ga4.totals.avgEngagementTime)} color={color} />
              </div>
            )}
            <div className="grid gap-6 lg:grid-cols-2">
              {gscTrend ? (
                <TrendChart title="Search clicks" data={gsc!.byDate} dataKey="clicks" color={color} />
              ) : null}
              {ga4Trend ? (
                <TrendChart title="Sessions" data={ga4!.byDate} dataKey="sessions" color="#0ea5e9" />
              ) : null}
            </div>
            {gscTrend ? (
              <div className="mt-6">
                <p className="mb-2 text-xs font-medium text-ink-600">Average position (lower is better)</p>
                <div className="h-40">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={gsc!.byDate} margin={{ top: 6, right: 6, left: -12, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#eef1f5" vertical={false} />
                      <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#94a3b8" }} interval={Math.ceil(gsc!.byDate.length / 6)} tickLine={false} axisLine={false} tickFormatter={(d) => String(d).slice(5)} />
                      <YAxis reversed tick={{ fontSize: 10, fill: "#94a3b8" }} tickLine={false} axisLine={false} domain={["dataMin - 1", "dataMax + 1"]} />
                      <Tooltip contentStyle={{ borderRadius: 10, border: "1px solid #e2e8f0", fontSize: 12 }} />
                      <Line type="monotone" dataKey="position" stroke="#f59e0b" strokeWidth={2.5} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            ) : null}
            {hasChannels ? (
              <div className="mt-6">
                <p className="mb-2 text-xs font-medium text-ink-600">Traffic by channel</p>
                <DimTable rows={ga4!.trafficSources!} label="Channel" />
              </div>
            ) : null}
          </Section>
        )}

        {/* Landing Page Performance */}
        {landing.length >= MIN_BREAKDOWN_ROWS && (
          <Section n={next()} title="Landing Page Performance" subtitle="Where search traffic lands and how it engages" color={color}>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-sm">
                <thead>
                  <tr className="text-left text-xs text-ink-500">
                    <th className="pb-2 font-medium">Page</th>
                    {gsc && <th className="pb-2 text-right font-medium">Clicks</th>}
                    {gsc && <th className="pb-2 text-right font-medium">Impr.</th>}
                    {ga4 && <th className="pb-2 text-right font-medium">Sessions</th>}
                    {ga4 && <th className="pb-2 text-right font-medium">Users</th>}
                  </tr>
                </thead>
                <tbody>
                  {landing.map((r) => (
                    <tr key={r.path} className="border-t border-slate-100">
                      <td className="max-w-0 truncate py-2 pr-3 text-ink-800" title={r.path}>{r.path}</td>
                      {gsc && <td className="py-2 text-right text-ink-700">{r.clicks != null ? fmt(r.clicks) : "—"}</td>}
                      {gsc && <td className="py-2 text-right text-ink-600">{r.impressions != null ? fmt(r.impressions) : "—"}</td>}
                      {ga4 && <td className="py-2 text-right text-ink-700">{r.sessions != null ? fmt(r.sessions) : "—"}</td>}
                      {ga4 && <td className="py-2 text-right text-ink-600">{r.users != null ? fmt(r.users) : "—"}</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>
        )}

        {/* Search Queries Driving Traffic */}
        {gsc && gsc.topQueries.length > 0 && (
          <Section n={next()} title="Search Queries Driving Traffic" subtitle="Your biggest organic traffic drivers" color={color}>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[460px] text-sm">
                <thead>
                  <tr className="text-left text-xs text-ink-500">
                    <th className="pb-2 font-medium">Query</th>
                    <th className="pb-2 text-right font-medium">Clicks</th>
                    <th className="pb-2 text-right font-medium">Impr.</th>
                    <th className="pb-2 text-right font-medium">CTR</th>
                    <th className="pb-2 text-right font-medium">Pos.</th>
                  </tr>
                </thead>
                <tbody>
                  {gsc.topQueries.slice(0, 8).map((q) => (
                    <tr key={q.key} className="border-t border-slate-100">
                      <td className="max-w-0 truncate py-2 pr-3 font-medium text-ink-800">{q.key}</td>
                      <td className="py-2 text-right text-ink-700">{fmt(q.clicks)}</td>
                      <td className="py-2 text-right text-ink-600">{fmt(q.impressions)}</td>
                      <td className="py-2 text-right text-ink-600">{pct1(q.ctr)}</td>
                      <td className="py-2 text-right text-ink-600">{q.position.toFixed(1)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {(winners.length > 0 || decliners.length > 0) && (
              <div className="mt-5 grid gap-6 lg:grid-cols-2">
                {winners.length > 0 && (
                  <div>
                    <p className="mb-2 text-xs font-semibold text-emerald-700">Winning keywords</p>
                    <ul className="space-y-2">
                      {winners.map((k) => (
                        <li key={k.key} className="flex items-center justify-between gap-3 rounded-lg border border-emerald-100 bg-emerald-50/60 px-3 py-2">
                          <span className="min-w-0 truncate text-sm font-medium text-ink-800">{k.key}</span>
                          <span className="inline-flex flex-shrink-0 items-center gap-0.5 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700"><ArrowUpRight size={12} /> {Math.round(k.changePct)}%</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {decliners.length > 0 && (
                  <div>
                    <p className="mb-2 text-xs font-semibold text-rose-600">Declining keywords</p>
                    <ul className="space-y-2">
                      {decliners.map((k) => (
                        <li key={k.key} className="flex items-center justify-between gap-3 rounded-lg border border-rose-100 bg-rose-50/60 px-3 py-2">
                          <span className="min-w-0 truncate text-sm font-medium text-ink-800">{k.key}</span>
                          <span className="inline-flex flex-shrink-0 items-center gap-0.5 rounded-full bg-rose-100 px-2 py-0.5 text-xs font-semibold text-rose-600"><ArrowDownRight size={12} /> {Math.abs(Math.round(k.changePct))}%</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </Section>
        )}

        {/* Conversion Opportunities.
            The presence of GA4 alone used to open this section, so a property
            with no conversions and no near-page-one keywords got a heading
            promising "where the next gains are" above a conversion count of
            zero — a figure the KPI group above already carries. It now needs
            something to point at: ranking opportunities, written ones, or
            conversion activity to talk about. */}
        {(opportunities.length > 0
          || (ins?.growthOpportunities.length ?? 0) > 0
          || (ga4 != null && (ga4.totals.conversions > 0 || ga4.totals.totalRevenue > 0))) && (
          <Section n={next()} title="Conversion Opportunities" subtitle="Where the next gains are — quick wins" color={color}>
            {ga4 && (
              <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
                <MiniStat label="Conversions" value={fmt(ga4.totals.conversions)} color={color} />
                <MiniStat label="Conversion rate" value={convRate != null ? pct1(convRate) : "—"} color={color} />
                {ga4.totals.totalRevenue > 0 && <MiniStat label="Total revenue" value={fmt(ga4.totals.totalRevenue)} color={color} />}
              </div>
            )}
            {opportunities.length > 0 && (
              <>
                <p className="mb-2 text-xs font-medium text-ink-600">Keywords on the edge of page one</p>
                <div className="h-40">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={opportunities} layout="vertical" margin={{ left: 8, right: 24 }}>
                      <XAxis type="number" hide domain={[0, "dataMax + 100"]} />
                      <YAxis type="category" dataKey="key" width={160} tick={{ fontSize: 11, fill: "#64748b" }} tickLine={false} axisLine={false} />
                      <Tooltip contentStyle={{ borderRadius: 10, border: "1px solid #e2e8f0", fontSize: 12 }} cursor={{ fill: "#f8fafc" }} formatter={(v) => [`${fmt(Number(v))} impressions`, ""]} />
                      <Bar dataKey="impressions" fill={color} radius={[0, 4, 4, 0]} barSize={16} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </>
            )}
            {ins && ins.growthOpportunities.length > 0 && (
              <ul className={`space-y-2 ${opportunities.length > 0 ? "mt-4" : ""}`}>
                {ins.growthOpportunities.map((g, i) => (
                  <li key={i} className="flex gap-2.5 rounded-lg border border-amber-100 bg-amber-50/40 px-3 py-2.5 text-sm text-ink-700">
                    <Lightbulb size={15} className="mt-0.5 flex-shrink-0 text-amber-500" />
                    <span>{g}</span>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        )}

        {/* Audience — GA4 devices & countries */}
        {ga4 && (hasDevices || hasCountries) && (
          <Section n={next()} title="Audience" subtitle="How visitors reach the site — by device and country" color={color}>
            <div className="grid gap-6 lg:grid-cols-2">
              {hasDevices && (
                <div>
                  <p className="mb-2 text-xs font-medium text-ink-600">Devices</p>
                  <DimTable rows={ga4.devices!} label="Device" format={titleCase} />
                </div>
              )}
              {hasCountries && (
                <div>
                  <p className="mb-2 text-xs font-medium text-ink-600">Top countries</p>
                  <DimTable rows={ga4.countries!} label="Country" />
                </div>
              )}
            </div>
          </Section>
        )}

        {/* Connected channels — provider-agnostic, one section per integration */}
        {channelBlocks.map((block) => (
          <Section
            key={block.sourceId}
            n={next()}
            title={block.sourceName}
            subtitle={periodSubtitle("Performance during this period", blockHasComparison(block))}
            color={color}
          >
            {/* Same rule as the PDF: an individual "—" beside real figures says
                that metric has no denominator, but a whole row of them says
                nothing, so the row is dropped rather than rendered empty. */}
            {hasCalculableKpis(block.kpis.slice(0, MAX_CHANNEL_KPIS)) && (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {block.kpis.slice(0, MAX_CHANNEL_KPIS).map((k) => {
                  const d = k.value === null || k.previous === null || k.previous === 0 ? null : (k.value - k.previous) / Math.abs(k.previous);
                  const good = d === null ? null : k.lowerBetter ? d < 0 : d > 0;
                  return (
                    <div key={k.label} className="rounded-xl border border-slate-200 bg-white p-3">
                      <p className="text-xs text-ink-500">{k.label}</p>
                      <p className="mt-1 text-lg font-semibold text-ink-900">
                        {formatBlockValue(k.value, k.format, block.currency)}
                      </p>
                      {d !== null && (
                        <p className={`mt-0.5 text-xs font-medium ${good ? "text-emerald-600" : "text-rose-600"}`}>
                          {d > 0 ? "▲" : "▼"} {Math.abs(d * 100).toFixed(1)}%
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {block.tables.map((table) => (
              table.rows.length >= MIN_BREAKDOWN_ROWS && (
                <div key={table.title} className="mt-6 overflow-x-auto">
                  <p className="mb-2 text-xs font-medium text-ink-600">{table.title}</p>
                  <table className="w-full min-w-[420px] text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-left text-xs text-ink-500">
                        {table.columns.map((c) => (
                          <th key={c.key} className="py-2 pr-3 font-medium">{c.label}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {table.rows.slice(0, 8).map((row, ri) => (
                        <tr key={ri} className="border-b border-slate-100 last:border-0">
                          {table.columns.map((c) => (
                            <td key={c.key} className="py-2 pr-3 text-ink-700">
                              {typeof row[c.key] === "number"
                                ? formatBlockValue(row[c.key] as number, c.format, block.currency)
                                : String(row[c.key] ?? "—")}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            ))}

            {block.notes.map((note) => (
              <p key={note} className="mt-3 text-xs text-ink-500">{note}</p>
            ))}
          </Section>
        ))}

        {/* What stood out, and what it means.
            Wins, risks and the interpretation layer were three sections, each
            with its own heading and a short list under it — the same act of
            reading for the client, fragmented. They share one section now, and
            the interpretation layer still pairs each measured signal with the
            standing meaning of that pattern, so the client gets "and
            therefore…" rather than another table. */}
        {((ins && (ins.keyWins.length > 0 || ins.issuesDetected.length > 0)) || soWhat.length > 0) && (
          <Section n={next()} title="What stood out, and what it means" subtitle="Highlights from the period, and what they point to" color={color}>
            {ins && ins.keyWins.length > 0 && (
              <>
                <p className="mb-2 text-xs font-semibold text-emerald-700">Key wins</p>
                <ul className="space-y-2">
                  {ins.keyWins.map((w, i) => (
                    <li key={i} className="flex gap-2.5 rounded-lg border border-emerald-100 bg-emerald-50/50 px-3 py-2.5 text-sm text-ink-700">
                      <Trophy size={15} className="mt-0.5 flex-shrink-0 text-emerald-600" />
                      <span>{w}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}

            {ins && ins.issuesDetected.length > 0 && (
              <>
                <p className={`mb-2 text-xs font-semibold text-rose-600 ${ins.keyWins.length > 0 ? "mt-5" : ""}`}>Issues detected</p>
                <ul className="space-y-2">
                  {ins.issuesDetected.map((it, i) => (
                    <li key={i} className="flex gap-2.5 rounded-lg border border-rose-100 bg-rose-50/50 px-3 py-2.5 text-sm text-ink-700">
                      <AlertTriangle size={15} className="mt-0.5 flex-shrink-0 text-rose-500" />
                      <span>{it}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}

            {soWhat.length > 0 && (
              <div className={`space-y-4 ${ins && (ins.keyWins.length > 0 || ins.issuesDetected.length > 0) ? "mt-5" : ""}`}>
                {ins && (ins.keyWins.length > 0 || ins.issuesDetected.length > 0) && (
                  <p className="text-xs font-semibold text-ink-600">What this means</p>
                )}
                {soWhat.map((w) => (
                  <div key={w.observation} className="border-l-2 border-slate-200 pl-4">
                    <p className="text-sm font-semibold text-ink-900">{w.observation}</p>
                    <p className="mt-1 text-sm leading-relaxed text-ink-700">{w.meaning}</p>
                    <p className="mt-1.5 text-xs text-ink-500">
                      {w.metric} · {w.source} · {w.confidence} confidence — {w.confidenceReason}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </Section>
        )}

        {/* Evidence-backed next steps, each carrying the figure behind it, with
            the AI's remaining commentary beneath them in the same section. The
            commentary only appears when cleaning left something that reads as
            commentary — it had its own heading before, which meant a heading
            could ship above a single malformed list item. */}
        {(evidenceActions.length > 0 || commentary.length > 0 || hasAnySource) && (
          <Section n={next()} title="Recommended actions" subtitle={evidenceActions.length > 0 ? "Each step is prompted by a figure measured in this report" : "What this period's data does, and does not, support acting on"} color={color}>
            {/* Nothing measured cleared the bar. Said outright, because a
                section that silently disappears reads as an omission. */}
            {evidenceActions.length === 0 && (
              <p className="rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-3 text-sm leading-relaxed text-ink-600">
                {NO_EVIDENCE_NOTE}
              </p>
            )}

            {evidenceActions.length > 0 && (
              <ul className="space-y-3">
                {evidenceActions.map((a) => (
                  <li key={a.action} className="flex gap-3 rounded-lg border border-slate-100 bg-white p-3">
                    <span
                      className={`mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                        a.priority === "High" ? "bg-amber-50 text-amber-700"
                        : a.priority === "Medium" ? "bg-slate-100 text-ink-700"
                        : "bg-slate-50 text-ink-500"
                      }`}
                    >
                      {a.priority}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm text-ink-800">{a.action}</p>
                      <p className="mt-0.5 text-xs text-ink-500">Because: {a.because} ({a.source})</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            {commentary.length > 0 && (
              <div className={evidenceActions.length > 0 ? "mt-5" : ""}>
                <p className="mb-2 text-xs font-semibold text-ink-600">Further commentary</p>
                <ol className="space-y-2">
                  {commentary.map((r, i) => (
                    <li key={i} className="flex gap-3 rounded-lg border border-slate-100 bg-white p-3">
                      <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white" style={{ background: color }}>{i + 1}</span>
                      <p className="text-sm text-ink-700">{r}</p>
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </Section>
        )}

        {/* Agency Notes.
            Rendered only when the agency actually wrote one. This section used
            to render unconditionally, filling itself with a sentence the agency
            never said — in italics, under "A note from your team". */}
        {note && (
          <Section n={next()} title="Agency Notes" subtitle="A note from your team" color={color}>
            <div className="flex gap-3 rounded-xl border border-dashed border-slate-300 bg-slate-50/50 p-4">
              <StickyNote size={18} className="mt-0.5 flex-shrink-0 text-ink-500" />
              <p className="text-sm italic leading-relaxed text-ink-600">{note}</p>
            </div>
          </Section>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-slate-100 pt-5 text-xs text-ink-500">
          <span>Prepared by {branding.name || "Your Agency"}</span>
          {branding.website && <span>{branding.website}</span>}
        </div>
      </div>
    </div>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────────────
function Section({ n, title, subtitle, color, children }: { n: number; title: string; subtitle?: string; color: string; children: React.ReactNode }) {
  return (
    <section className="break-inside-avoid">
      <div className="mb-4 flex items-center gap-3">
        <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg text-xs font-bold text-white" style={{ background: color }}>{n}</span>
        <div className="min-w-0">
          <h2 className="text-base font-semibold leading-tight text-ink-900">{title}</h2>
          {subtitle && <p className="text-xs text-ink-500">{subtitle}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}

function Callout({ tone, icon: Icon, title, text }: { tone: "emerald" | "rose" | "amber"; icon: typeof TrendingUp; title: string; text: string }) {
  const tones = {
    emerald: "border-emerald-100 bg-emerald-50/60 text-emerald-700",
    rose: "border-rose-100 bg-rose-50/60 text-rose-600",
    amber: "border-amber-100 bg-amber-50/60 text-amber-700",
  } as const;
  return (
    <div className={`rounded-lg border p-3 ${tones[tone]}`}>
      <div className="mb-1 flex items-center gap-1.5 text-xs font-semibold"><Icon size={13} /> {title}</div>
      <p className="text-xs leading-snug text-ink-600">{text}</p>
    </div>
  );
}

function KpiGroup({ label, icon: Icon, color, kpis }: { label: string; icon: typeof Search; color: string; kpis: { l: string; v: string; d: { pct: number; good: boolean } | null }[] }) {
  return (
    <div>
      <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold" style={{ color }}><Icon size={13} /> {label}</p>
      <div className="grid grid-cols-2 gap-3">
        {kpis.map((m) => (
          <div key={m.l} className="rounded-xl border border-slate-100 bg-slate-50 p-4">
            <p className="text-xs text-ink-500">{m.l}</p>
            <p className="mt-1 text-xl font-semibold" style={{ color }}>{m.v}</p>
            {m.d && (
              <p className={`mt-1 inline-flex items-center gap-0.5 text-xs font-medium ${m.d.good ? "text-emerald-600" : "text-rose-500"}`}>
                {m.d.pct >= 0 ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
                {Math.abs(m.d.pct).toFixed(0)}%
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function MiniStat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
      <p className="text-xs text-ink-500">{label}</p>
      <p className="mt-0.5 text-lg font-semibold" style={{ color }}>{value}</p>
    </div>
  );
}

function TrendChart({ title, data, dataKey, color }: { title: string; data: { date: string }[]; dataKey: string; color: string }) {
  const id = `rd-${dataKey}-${color.replace("#", "")}`;
  return (
    <div>
      <p className="mb-2 text-xs font-medium text-ink-600">{title}</p>
      <div className="h-44">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 6, right: 6, left: -12, bottom: 0 }}>
            <defs>
              <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity={0.3} />
                <stop offset="100%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#eef1f5" vertical={false} />
            <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#94a3b8" }} interval={Math.ceil(data.length / 6)} tickLine={false} axisLine={false} tickFormatter={(d) => String(d).slice(5)} />
            <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} tickLine={false} axisLine={false} />
            <Tooltip contentStyle={{ borderRadius: 10, border: "1px solid #e2e8f0", fontSize: 12 }} />
            <Area type="monotone" dataKey={dataKey} stroke={color} strokeWidth={2.5} fill={`url(#${id})`} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function DimTable({ rows, label, format = (k) => k }: { rows: { key: string; sessions: number; users: number }[]; label: string; format?: (k: string) => string }) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-xs text-ink-500">
          <th className="pb-2 font-medium">{label}</th>
          <th className="pb-2 text-right font-medium">Sessions</th>
          <th className="pb-2 text-right font-medium">Users</th>
        </tr>
      </thead>
      <tbody>
        {rows.slice(0, 6).map((r) => (
          <tr key={r.key} className="border-t border-slate-100">
            <td className="max-w-0 truncate py-2 pr-3 text-ink-800">{format(r.key)}</td>
            <td className="py-2 text-right text-ink-600">{fmt(r.sessions)}</td>
            <td className="py-2 text-right text-ink-600">{fmt(r.users)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

const titleCase = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
