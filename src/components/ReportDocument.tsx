"use client";

import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Line, LineChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import {
  TrendingUp, TrendingDown, ArrowUpRight, ArrowDownRight, Target,
  CheckCircle2, StickyNote, Trophy, AlertTriangle, Lightbulb,
} from "lucide-react";

type Branding = { name: string; logo_url: string | null; brand_color: string; website: string | null; footer_text: string | null };
type Totals = { clicks: number; impressions: number; ctr: number; position: number };
type Mover = { key: string; clicks: number; prevClicks: number; changePct: number; position: number };
type Opportunity = { key: string; clicks: number; impressions: number; position: number };

// Accepts both the current grouped insights and the legacy
// {summary, highlights, recommendations, actionPlan} shape, so reports saved
// before the grouped-insights change still render.
type RawInsights = {
  executiveSummary?: string;
  keyWins?: string[];
  issuesDetected?: string[];
  growthOpportunities?: string[];
  recommendedActions?: string[];
  // legacy fields
  summary?: string;
  highlights?: string[];
  recommendations?: string[];
  actionPlan?: string[];
} | null | undefined;

type GscData = {
  totals: Totals;
  previousTotals?: Totals | null;
  movers?: { winners: Mover[]; decliners: Mover[]; opportunities: Opportunity[] } | null;
  insights?: RawInsights;
  topQueries: { key: string; clicks: number; impressions: number; ctr: number; position: number }[];
  topPages: { key: string; clicks: number; impressions: number }[];
  byDate: { date: string; clicks: number; impressions: number; ctr: number; position: number }[];
};

const fmt = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 0 });

// Normalizes either insights shape into the grouped form the report renders.
function normInsights(ins: RawInsights) {
  if (!ins) return null;
  const executiveSummary = ins.executiveSummary ?? ins.summary ?? "";
  const keyWins = ins.keyWins ?? ins.highlights ?? [];
  const issuesDetected = ins.issuesDetected ?? [];
  const growthOpportunities = ins.growthOpportunities ?? [];
  const recommendedActions = ins.recommendedActions ?? ins.recommendations ?? [];
  const actionPlan = ins.actionPlan ?? [];
  const empty =
    !executiveSummary && !keyWins.length && !issuesDetected.length &&
    !growthOpportunities.length && !recommendedActions.length && !actionPlan.length;
  return empty ? null : { executiveSummary, keyWins, issuesDetected, growthOpportunities, recommendedActions, actionPlan };
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
  data: GscData;
}) {
  const color = branding.brand_color || "#4f46e5";
  const { totals, previousTotals, movers, insights, topQueries, topPages, byDate } = data;
  const ins = normInsights(insights);

  const clicksD = delta(totals.clicks, previousTotals?.clicks);
  const posD = delta(totals.position, previousTotals?.position, true);

  const kpis = [
    { l: "Clicks", v: fmt(totals.clicks), d: clicksD },
    { l: "Impressions", v: fmt(totals.impressions), d: delta(totals.impressions, previousTotals?.impressions) },
    { l: "Avg CTR", v: `${(totals.ctr * 100).toFixed(1)}%`, d: delta(totals.ctr, previousTotals?.ctr) },
    { l: "Avg Position", v: totals.position.toFixed(1), d: posD },
  ];

  const winners = movers?.winners ?? [];
  const decliners = movers?.decliners ?? [];
  const opportunities = movers?.opportunities ?? [];

  // Section numbering is computed so omitted sections don't leave gaps.
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
          <span className="rounded-full bg-white/15 px-3 py-1 text-xs font-medium">SEO Report</span>
        </div>
        <h1 className="mt-8 text-2xl font-semibold sm:mt-10 sm:text-3xl">{title}</h1>
        <p className="mt-2 text-sm text-white/80">Prepared for {clientName} · {period.start} → {period.end}</p>
      </div>

      <div className="space-y-10 p-6 sm:p-10">
        {/* 1 — Executive Summary */}
        {(ins?.executiveSummary || previousTotals) && (
          <Section n={next()} title="Executive Summary" subtitle="Performance at a glance" color={color}>
            {ins?.executiveSummary && <p className="text-sm leading-relaxed text-ink-700">{ins.executiveSummary}</p>}
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <Callout tone="emerald" icon={TrendingUp} title="Key win"
                text={winners[0] ? `“${winners[0].key}” up ${Math.round(winners[0].changePct)}%.` : clicksD && clicksD.good ? `Clicks up ${Math.abs(clicksD.pct).toFixed(0)}% vs the prior period.` : "Traffic held steady this period."} />
              <Callout tone="rose" icon={TrendingDown} title="Watch"
                text={decliners[0] ? `“${decliners[0].key}” down ${Math.abs(Math.round(decliners[0].changePct))}%.` : "No major declines to flag."} />
              <Callout tone="amber" icon={Target} title="Trend"
                text={posD ? `Average position ${posD.good ? "improved" : "slipped"} to ${totals.position.toFixed(1)}.` : `${opportunities.length} keywords are close to page one.`} />
            </div>
          </Section>
        )}

        {/* 2 — KPI Overview */}
        <Section n={next()} title="KPI Overview" subtitle={previousTotals ? "Period-over-period vs. the prior period" : "This period"} color={color}>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {kpis.map((m) => (
              <div key={m.l} className="rounded-xl border border-slate-100 bg-slate-50 p-4">
                <p className="text-xs text-ink-500">{m.l}</p>
                <p className="mt-1 text-2xl font-semibold" style={{ color }}>{m.v}</p>
                {m.d && (
                  <p className={`mt-1 inline-flex items-center gap-0.5 text-xs font-medium ${m.d.good ? "text-emerald-600" : "text-rose-500"}`}>
                    {m.d.pct >= 0 ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
                    {Math.abs(m.d.pct).toFixed(0)}%
                  </p>
                )}
              </div>
            ))}
          </div>
        </Section>

        {/* 3 — Traffic & Visibility Trends */}
        {byDate.length > 0 && (
          <Section n={next()} title="Traffic & Visibility Trends" subtitle="Daily clicks and ranking" color={color}>
            <div className="grid gap-6 lg:grid-cols-2">
              <div>
                <p className="mb-2 text-xs font-medium text-ink-600">Clicks</p>
                <div className="h-44">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={byDate} margin={{ top: 6, right: 6, left: -12, bottom: 0 }}>
                      <defs>
                        <linearGradient id="rdClicks" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={color} stopOpacity={0.3} />
                          <stop offset="100%" stopColor={color} stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#eef1f5" vertical={false} />
                      <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#94a3b8" }} interval={Math.ceil(byDate.length / 6)} tickLine={false} axisLine={false} tickFormatter={(d) => String(d).slice(5)} />
                      <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} tickLine={false} axisLine={false} />
                      <Tooltip contentStyle={{ borderRadius: 10, border: "1px solid #e2e8f0", fontSize: 12 }} />
                      <Area type="monotone" dataKey="clicks" stroke={color} strokeWidth={2.5} fill="url(#rdClicks)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
              <div>
                <p className="mb-2 text-xs font-medium text-ink-600">Average position (lower is better)</p>
                <div className="h-44">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={byDate} margin={{ top: 6, right: 6, left: -12, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#eef1f5" vertical={false} />
                      <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#94a3b8" }} interval={Math.ceil(byDate.length / 6)} tickLine={false} axisLine={false} tickFormatter={(d) => String(d).slice(5)} />
                      <YAxis reversed tick={{ fontSize: 10, fill: "#94a3b8" }} tickLine={false} axisLine={false} domain={["dataMin - 1", "dataMax + 1"]} />
                      <Tooltip contentStyle={{ borderRadius: 10, border: "1px solid #e2e8f0", fontSize: 12 }} />
                      <Line type="monotone" dataKey="position" stroke="#f59e0b" strokeWidth={2.5} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          </Section>
        )}

        {/* 4 — Top Performing Queries */}
        {topQueries.length > 0 && (
          <Section n={next()} title="Top Performing Queries" subtitle="Your biggest traffic drivers" color={color}>
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
                  {topQueries.slice(0, 8).map((q) => (
                    <tr key={q.key} className="border-t border-slate-100">
                      <td className="max-w-0 truncate py-2 pr-3 font-medium text-ink-800">{q.key}</td>
                      <td className="py-2 text-right text-ink-700">{fmt(q.clicks)}</td>
                      <td className="py-2 text-right text-ink-600">{fmt(q.impressions)}</td>
                      <td className="py-2 text-right text-ink-600">{(q.ctr * 100).toFixed(1)}%</td>
                      <td className="py-2 text-right text-ink-600">{q.position.toFixed(1)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>
        )}

        {/* 5 & 6 — Winning / Declining Keywords */}
        {(winners.length > 0 || decliners.length > 0) && (
          <div className="grid gap-6 lg:grid-cols-2">
            {winners.length > 0 && (
              <Section n={next()} title="Winning Keywords" subtitle="Strongest growth this period" color={color}>
                <ul className="space-y-2">
                  {winners.map((k) => (
                    <li key={k.key} className="flex items-center justify-between gap-3 rounded-lg border border-emerald-100 bg-emerald-50/60 px-3 py-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-ink-800">{k.key}</p>
                        <p className="text-[11px] text-ink-500">{fmt(k.clicks)} clicks · position {k.position.toFixed(1)}</p>
                      </div>
                      <span className="inline-flex flex-shrink-0 items-center gap-0.5 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700"><ArrowUpRight size={12} /> {Math.round(k.changePct)}%</span>
                    </li>
                  ))}
                </ul>
              </Section>
            )}
            {decliners.length > 0 && (
              <Section n={next()} title="Declining Keywords" subtitle="Losing traffic or rankings" color={color}>
                <ul className="space-y-2">
                  {decliners.map((k) => (
                    <li key={k.key} className="flex items-center justify-between gap-3 rounded-lg border border-rose-100 bg-rose-50/60 px-3 py-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-ink-800">{k.key}</p>
                        <p className="text-[11px] text-ink-500">{fmt(k.clicks)} clicks · position {k.position.toFixed(1)}</p>
                      </div>
                      <span className="inline-flex flex-shrink-0 items-center gap-0.5 rounded-full bg-rose-100 px-2 py-0.5 text-xs font-semibold text-rose-600"><ArrowDownRight size={12} /> {Math.abs(Math.round(k.changePct))}%</span>
                    </li>
                  ))}
                </ul>
              </Section>
            )}
          </div>
        )}

        {/* 7 — Key Wins (AI) */}
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

        {/* 8 — Issues Detected (AI) */}
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

        {/* 9 — Growth Opportunities (data chart + AI narrative) */}
        {(opportunities.length > 0 || (ins?.growthOpportunities.length ?? 0) > 0) && (
          <Section n={next()} title="Growth Opportunities" subtitle="Where the next gains are — quick wins" color={color}>
            {opportunities.length > 0 && (
              <>
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
                <ul className="mt-2 grid gap-2 sm:grid-cols-2">
                  {opportunities.map((o) => (
                    <li key={o.key} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm">
                      <span className="truncate text-ink-700">{o.key}</span>
                      <span className="flex-shrink-0 text-xs font-medium text-amber-600">pos {o.position.toFixed(1)}</span>
                    </li>
                  ))}
                </ul>
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

        {/* 10 — Recommended Actions (AI) */}
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

        {/* Next Month Action Plan — only for legacy reports that still carry it */}
        {ins && ins.actionPlan.length > 0 && (
          <Section n={next()} title="Next Month Action Plan" subtitle="What we'll execute next" color={color}>
            <ul className="space-y-2">
              {ins.actionPlan.map((a, i) => (
                <li key={i} className="flex items-start gap-3 rounded-lg bg-slate-50 px-3 py-2.5">
                  <CheckCircle2 size={16} className="mt-0.5 flex-shrink-0" style={{ color }} />
                  <span className="text-sm text-ink-700">{a}</span>
                </li>
              ))}
            </ul>
          </Section>
        )}

        {/* Top pages (kept from the original report) */}
        {topPages.length > 0 && (
          <Section n={next()} title="Top Pages" subtitle="Highest-traffic landing pages" color={color}>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[420px] text-sm">
                <thead>
                  <tr className="text-left text-xs text-ink-400">
                    <th className="pb-2 font-medium">Page</th>
                    <th className="pb-2 text-right font-medium">Clicks</th>
                    <th className="pb-2 text-right font-medium">Impressions</th>
                  </tr>
                </thead>
                <tbody>
                  {topPages.slice(0, 8).map((p) => (
                    <tr key={p.key} className="border-t border-slate-100">
                      <td className="max-w-0 truncate py-2 pr-3 text-ink-700">{p.key}</td>
                      <td className="py-2 text-right text-ink-600">{fmt(p.clicks)}</td>
                      <td className="py-2 text-right text-ink-600">{fmt(p.impressions)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>
        )}

        {/* 11 — Agency Notes */}
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
