"use client";

import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Line, LineChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import {
  TrendingUp, TrendingDown, ArrowUpRight, ArrowDownRight, Target,
  StickyNote, Trophy, AlertTriangle, Lightbulb, Search, BarChart3,
} from "lucide-react";
import { normalizeReportData } from "@/lib/report";
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

function pagePathOf(url: string): string {
  try {
    const u = new URL(url);
    return (u.pathname || "/") + (u.search || "");
  } catch {
    return url;
  }
}

function normInsights(ins: RawInsights) {
  if (!ins) return null;
  const executiveSummary = ins.executiveSummary ?? ins.summary ?? "";
  const keyWins = ins.keyWins ?? ins.highlights ?? [];
  const issuesDetected = ins.issuesDetected ?? [];
  const growthOpportunities = ins.growthOpportunities ?? [];
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
  title,
  period,
  data,
}: {
  branding: Branding;
  clientName: string;
  title: string;
  period: { start: string; end: string };
  data: unknown;
}) {
  const color = branding.brand_color || "#4f46e5";
  const { gsc, ga4, insights } = normalizeReportData(data);
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

  const landing = mergeLandingPages(gsc, ga4);
  const organic = ga4?.trafficSources?.find((s) => /organic search/i.test(s.key)) ?? null;
  const organicShare = ga4 && ga4.totals.sessions > 0 && organic ? organic.sessions / ga4.totals.sessions : null;
  const convRate = ga4 && ga4.totals.sessions > 0 ? ga4.totals.conversions / ga4.totals.sessions : null;

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
                <img src={branding.logo_url} alt="" className="max-h-full max-w-full object-contain" />
              ) : (
                <span className="text-lg font-bold" style={{ color }}>{(branding.name || "A").charAt(0)}</span>
              )}
            </div>
            <span className="font-semibold">{branding.name || "Your Agency"}</span>
          </div>
          <span className="rounded-full bg-white/15 px-3 py-1 text-xs font-medium">
            {gsc && ga4 ? "SEO + Analytics" : ga4 ? "Analytics Report" : "SEO Report"}
          </span>
        </div>
        <h1 className="mt-8 text-2xl font-semibold sm:mt-10 sm:text-3xl">{title}</h1>
        <p className="mt-2 text-sm text-white/80">Prepared for {clientName} · {period.start} → {period.end}</p>
      </div>

      <div className="space-y-10 p-6 sm:p-10">
        {/* Executive Summary */}
        {(ins?.executiveSummary || gsc?.previousTotals || ga4?.previousTotals) && (
          <Section n={next()} title="Executive Summary" subtitle="Performance at a glance" color={color}>
            {ins?.executiveSummary && <p className="text-sm leading-relaxed text-ink-700">{ins.executiveSummary}</p>}
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <Callout tone="emerald" icon={TrendingUp} title="Key win"
                text={winners[0] ? `“${winners[0].key}” up ${Math.round(winners[0].changePct)}%.` : gscClicksD?.good ? `Search clicks up ${Math.abs(gscClicksD.pct).toFixed(0)}%.` : ga4 ? `${fmt(ga4.totals.sessions)} sessions, ${pct1(ga4.totals.engagementRate)} engaged.` : "Performance held steady."} />
              <Callout tone="rose" icon={TrendingDown} title="Watch"
                text={decliners[0] ? `“${decliners[0].key}” down ${Math.abs(Math.round(decliners[0].changePct))}%.` : ga4 && convRate != null ? `Conversion rate ${pct1(convRate)} — room to grow.` : "No major declines to flag."} />
              <Callout tone="amber" icon={Target} title="Trend"
                text={gscPosD ? `Average position ${gscPosD.good ? "improved" : "slipped"} to ${gsc!.totals.position.toFixed(1)}.` : organicShare != null ? `Organic search is ${pct1(organicShare)} of sessions.` : `${opportunities.length} keywords near page one.`} />
            </div>
          </Section>
        )}

        {/* SEO vs Website Performance — combined KPIs */}
        {(gsc || ga4) && (
          <Section n={next()} title="SEO vs Website Performance" subtitle="Search visibility and on-site results, side by side" color={color}>
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

        {/* Organic Traffic Overview */}
        {(Boolean(gsc?.byDate?.length) || Boolean(ga4?.byDate?.length)) && (
          <Section n={next()} title="Organic Traffic Overview" subtitle="How traffic and visibility moved this period" color={color}>
            {ga4 && (
              <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <MiniStat label="Organic sessions" value={organic ? fmt(organic.sessions) : "—"} color={color} />
                <MiniStat label="Organic share" value={organicShare != null ? pct1(organicShare) : "—"} color={color} />
                <MiniStat label="New users" value={fmt(ga4.totals.newUsers)} color={color} />
                <MiniStat label="Avg engagement" value={fmtDuration(ga4.totals.avgEngagementTime)} color={color} />
              </div>
            )}
            <div className="grid gap-6 lg:grid-cols-2">
              {gsc?.byDate?.length ? (
                <TrendChart title="Search clicks" data={gsc.byDate} dataKey="clicks" color={color} />
              ) : null}
              {ga4?.byDate?.length ? (
                <TrendChart title="Sessions" data={ga4.byDate} dataKey="sessions" color="#0ea5e9" />
              ) : null}
            </div>
            {gsc?.byDate?.length ? (
              <div className="mt-6">
                <p className="mb-2 text-xs font-medium text-ink-600">Average position (lower is better)</p>
                <div className="h-40">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={gsc.byDate} margin={{ top: 6, right: 6, left: -12, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#eef1f5" vertical={false} />
                      <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#94a3b8" }} interval={Math.ceil(gsc.byDate.length / 6)} tickLine={false} axisLine={false} tickFormatter={(d) => String(d).slice(5)} />
                      <YAxis reversed tick={{ fontSize: 10, fill: "#94a3b8" }} tickLine={false} axisLine={false} domain={["dataMin - 1", "dataMax + 1"]} />
                      <Tooltip contentStyle={{ borderRadius: 10, border: "1px solid #e2e8f0", fontSize: 12 }} />
                      <Line type="monotone" dataKey="position" stroke="#f59e0b" strokeWidth={2.5} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            ) : null}
            {ga4?.trafficSources?.length ? (
              <div className="mt-6">
                <p className="mb-2 text-xs font-medium text-ink-600">Traffic by channel</p>
                <DimTable rows={ga4.trafficSources} label="Channel" />
              </div>
            ) : null}
          </Section>
        )}

        {/* Landing Page Performance */}
        {landing.length > 0 && (
          <Section n={next()} title="Landing Page Performance" subtitle="Where search traffic lands and how it engages" color={color}>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-sm">
                <thead>
                  <tr className="text-left text-xs text-ink-400">
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
                  <tr className="text-left text-xs text-ink-400">
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

        {/* Conversion Opportunities */}
        {(opportunities.length > 0 || ga4 || (ins?.growthOpportunities.length ?? 0) > 0) && (
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
        {ga4 && ((ga4.devices?.length ?? 0) > 0 || (ga4.countries?.length ?? 0) > 0) && (
          <Section n={next()} title="Audience" subtitle="How visitors reach the site — by device and country" color={color}>
            <div className="grid gap-6 lg:grid-cols-2">
              {(ga4.devices?.length ?? 0) > 0 && (
                <div>
                  <p className="mb-2 text-xs font-medium text-ink-600">Devices</p>
                  <DimTable rows={ga4.devices!} label="Device" format={titleCase} />
                </div>
              )}
              {(ga4.countries?.length ?? 0) > 0 && (
                <div>
                  <p className="mb-2 text-xs font-medium text-ink-600">Top countries</p>
                  <DimTable rows={ga4.countries!} label="Country" />
                </div>
              )}
            </div>
          </Section>
        )}

        {/* Key Wins (AI) */}
        {ins && ins.keyWins.length > 0 && (
          <Section n={next()} title="Key Wins" subtitle="What worked this period" color={color}>
            <ul className="space-y-2">
              {ins.keyWins.map((w, i) => (
                <li key={i} className="flex gap-2.5 rounded-lg border border-emerald-100 bg-emerald-50/50 px-3 py-2.5 text-sm text-ink-700">
                  <Trophy size={15} className="mt-0.5 flex-shrink-0 text-emerald-600" />
                  <span>{w}</span>
                </li>
              ))}
            </ul>
          </Section>
        )}

        {/* Issues Detected (AI) */}
        {ins && ins.issuesDetected.length > 0 && (
          <Section n={next()} title="Issues Detected" subtitle="Risks and declines to address" color={color}>
            <ul className="space-y-2">
              {ins.issuesDetected.map((it, i) => (
                <li key={i} className="flex gap-2.5 rounded-lg border border-rose-100 bg-rose-50/50 px-3 py-2.5 text-sm text-ink-700">
                  <AlertTriangle size={15} className="mt-0.5 flex-shrink-0 text-rose-500" />
                  <span>{it}</span>
                </li>
              ))}
            </ul>
          </Section>
        )}

        {/* Recommended Actions (AI) */}
        {ins && ins.recommendedActions.length > 0 && (
          <Section n={next()} title="Recommended Actions" subtitle="Prioritised for impact" color={color}>
            <ol className="space-y-2">
              {ins.recommendedActions.map((r, i) => (
                <li key={i} className="flex gap-3 rounded-lg border border-slate-100 bg-white p-3">
                  <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white" style={{ background: color }}>{i + 1}</span>
                  <p className="text-sm text-ink-700">{r}</p>
                </li>
              ))}
            </ol>
          </Section>
        )}

        {/* Agency Notes */}
        <Section n={next()} title="Agency Notes" subtitle="A note from your team" color={color}>
          <div className="flex gap-3 rounded-xl border border-dashed border-slate-300 bg-slate-50/50 p-4">
            <StickyNote size={18} className="mt-0.5 flex-shrink-0 text-ink-400" />
            <p className="text-sm italic leading-relaxed text-ink-600">
              {branding.footer_text
                ? branding.footer_text
                : `Thanks for partnering with ${branding.name || "us"}, ${clientName}. We're focused on compounding these gains next month — reach out any time with questions.`}
            </p>
          </div>
        </Section>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-slate-100 pt-5 text-xs text-ink-400">
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
        <tr className="text-left text-xs text-ink-400">
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
