"use client";

import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Line, LineChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import {
  TrendingUp, TrendingDown, ArrowUpRight, ArrowDownRight, Target,
  Sparkles, CheckCircle2, StickyNote,
} from "lucide-react";

type Branding = { name: string; logo_url: string | null; brand_color: string; website: string | null; footer_text: string | null };

const fmt = (n: number) => n.toLocaleString();

// ─── Realistic sample SEO data (28-day period for a fictional client) ───────
const days = Array.from({ length: 28 }, (_, i) => {
  const d = new Date();
  d.setDate(d.getDate() - (27 - i));
  const clicks = Math.round(380 + 150 * Math.sin(i / 3.2) + i * 9);
  const impressions = Math.round(clicks * (18 + (i % 6)));
  return {
    date: d.toISOString().slice(5, 10),
    clicks,
    impressions,
    position: +(12.4 - i * 0.11 + Math.sin(i / 2) * 0.5).toFixed(1),
  };
});
const totalClicks = days.reduce((s, d) => s + d.clicks, 0);
const totalImpr = days.reduce((s, d) => s + d.impressions, 0);

const kpis = [
  { label: "Clicks", value: fmt(totalClicks), delta: 18.4, good: true, color: "#4f46e5" },
  { label: "Impressions", value: fmt(totalImpr), delta: 12.1, good: true, color: "#0ea5e9" },
  { label: "Avg CTR", value: "4.7%", delta: 5.6, good: true, color: "#10b981" },
  { label: "Avg Position", value: "9.8", delta: -13.2, good: true, color: "#f59e0b" }, // lower is better
];

const topQueries = [
  { q: "running shoes for marathon", clicks: 1240, impr: 18400, ctr: 6.7, pos: 2.3 },
  { q: "best trail running shoes", clicks: 980, impr: 15200, ctr: 6.4, pos: 3.1 },
  { q: "carbon plate running shoes", clicks: 760, impr: 12800, ctr: 5.9, pos: 4.8 },
  { q: "marathon training plan", clicks: 640, impr: 9900, ctr: 6.5, pos: 3.6 },
  { q: "running shoe size guide", clicks: 520, impr: 8700, ctr: 6.0, pos: 5.2 },
  { q: "trail vs road running shoes", clicks: 410, impr: 7300, ctr: 5.6, pos: 6.9 },
  { q: "best running socks", clicks: 360, impr: 6800, ctr: 5.3, pos: 7.4 },
];

const winners = [
  { q: "carbon plate running shoes", growth: 142, pos: 4.8, from: 9.2 },
  { q: "marathon recovery shoes", growth: 98, pos: 7.1, from: 13.6 },
  { q: "wide toe box running shoes", growth: 76, pos: 8.4, from: 12.1 },
  { q: "best running shoes 2026", growth: 64, pos: 5.6, from: 8.9 },
];

const decliners = [
  { q: "cheap running shoes", drop: 38, pos: 12.4, from: 8.1 },
  { q: "running shoes sale", drop: 24, pos: 14.2, from: 10.5 },
  { q: "minimalist running shoes", drop: 19, pos: 11.8, from: 9.3 },
];

const opportunities = [
  { q: "running shoes for beginners", pos: 10.8, impr: 8200 },
  { q: "stability running shoes", pos: 11.2, impr: 9800 },
  { q: "running shoes for flat feet", pos: 12.6, impr: 7400 },
  { q: "long distance running shoes", pos: 13.1, impr: 6900 },
];

const recommendations = [
  { priority: "High", text: "Refresh the “carbon plate running shoes” guide and add internal links to push it from position 4.8 into the top 3." },
  { priority: "High", text: "Build a dedicated “running shoes for beginners” page — it sits at position 10.8 with 8,200 monthly impressions, just outside page one." },
  { priority: "Medium", text: "Improve titles & meta descriptions on high-impression, lower-CTR pages to convert more of the growing impression base." },
  { priority: "Medium", text: "Investigate the drop on “cheap running shoes” (down 38%) — likely a SERP layout or intent shift; consider a comparison angle." },
];

const actionPlan = [
  "Publish the new “running shoes for beginners” landing page (target: page one).",
  "Update on-page content and internal links for the top 3 winning keywords.",
  "Run a title/meta refresh on the 10 highest-impression pages.",
  "Audit declining keywords and ship fixes for the top 2.",
];

export function ReportPreview({ branding }: { branding: Branding }) {
  const color = branding.brand_color || "#4f46e5";

  return (
    <div className="mx-auto max-w-3xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      {/* ── Cover ── */}
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
        <h1 className="mt-8 text-2xl font-semibold sm:mt-10 sm:text-3xl">Organic Search Performance</h1>
        <p className="mt-2 text-sm text-white/80">Prepared for Acme Running Co · Last 28 days</p>
      </div>

      <div className="space-y-10 p-6 sm:p-10">
        {/* 1 ── Executive Summary ── */}
        <Section n={1} title="Executive Summary" subtitle="Performance at a glance" color={color}>
          <p className="text-sm leading-relaxed text-ink-700">
            Organic search had a <span className="font-semibold text-ink-900">strong month</span>. Clicks grew{" "}
            <span className="font-semibold text-emerald-600">+18.4%</span> and impressions{" "}
            <span className="font-semibold text-emerald-600">+12.1%</span>, while average position improved from 11.4 to{" "}
            <span className="font-semibold text-ink-900">9.8</span>. Growth was led by high-intent product terms — “carbon plate running shoes” more than doubled its traffic — though a few budget-oriented keywords softened.
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <Callout tone="emerald" icon={TrendingUp} title="Key win" text="“Carbon plate running shoes” up 142%, now position 4.8." />
            <Callout tone="rose" icon={TrendingDown} title="Watch" text="“Cheap running shoes” down 38% — intent shift on the SERP." />
            <Callout tone="amber" icon={Target} title="Trend" text="Visibility rising — 4 keywords are one step from page one." />
          </div>
        </Section>

        {/* 2 ── KPI Overview ── */}
        <Section n={2} title="KPI Overview" subtitle="Period-over-period vs. the prior 28 days" color={color}>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {kpis.map((m) => (
              <div key={m.label} className="rounded-xl border border-slate-100 bg-slate-50 p-4">
                <p className="text-xs text-ink-500">{m.label}</p>
                <p className="mt-1 text-2xl font-semibold" style={{ color }}>{m.value}</p>
                <p className={`mt-1 inline-flex items-center gap-0.5 text-xs font-medium ${m.good ? "text-emerald-600" : "text-rose-500"}`}>
                  {m.delta >= 0 ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
                  {Math.abs(m.delta).toFixed(1)}%
                </p>
              </div>
            ))}
          </div>
        </Section>

        {/* 3 ── Traffic & Visibility Trends ── */}
        <Section n={3} title="Traffic & Visibility Trends" subtitle="Daily clicks, impressions and ranking" color={color}>
          <div className="grid gap-6 lg:grid-cols-2">
            <div>
              <p className="mb-2 text-xs font-medium text-ink-600">Clicks & impressions</p>
              <div className="h-44">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={days} margin={{ top: 6, right: 6, left: -12, bottom: 0 }}>
                    <defs>
                      <linearGradient id="rpClicks" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={color} stopOpacity={0.3} />
                        <stop offset="100%" stopColor={color} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#eef1f5" vertical={false} />
                    <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#94a3b8" }} interval={6} tickLine={false} axisLine={false} />
                    <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} tickLine={false} axisLine={false} />
                    <Tooltip contentStyle={{ borderRadius: 10, border: "1px solid #e2e8f0", fontSize: 12 }} />
                    <Area type="monotone" dataKey="clicks" stroke={color} strokeWidth={2.5} fill="url(#rpClicks)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div>
              <p className="mb-2 text-xs font-medium text-ink-600">Average position (lower is better)</p>
              <div className="h-44">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={days} margin={{ top: 6, right: 6, left: -12, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#eef1f5" vertical={false} />
                    <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#94a3b8" }} interval={6} tickLine={false} axisLine={false} />
                    <YAxis reversed tick={{ fontSize: 10, fill: "#94a3b8" }} tickLine={false} axisLine={false} domain={["dataMin - 1", "dataMax + 1"]} />
                    <Tooltip contentStyle={{ borderRadius: 10, border: "1px solid #e2e8f0", fontSize: 12 }} />
                    <Line type="monotone" dataKey="position" stroke="#f59e0b" strokeWidth={2.5} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
          <p className="mt-3 text-xs text-ink-500">Traffic is trending up steadily through the period, and average position has improved roughly two spots — a sign of compounding ranking gains.</p>
        </Section>

        {/* 4 ── Top Performing Queries ── */}
        <Section n={4} title="Top Performing Queries" subtitle="Your biggest traffic drivers" color={color}>
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
                {topQueries.map((q) => (
                  <tr key={q.q} className="border-t border-slate-100">
                    <td className="max-w-0 truncate py-2 pr-3 font-medium text-ink-800">{q.q}</td>
                    <td className="py-2 text-right text-ink-700">{fmt(q.clicks)}</td>
                    <td className="py-2 text-right text-ink-600">{fmt(q.impr)}</td>
                    <td className="py-2 text-right text-ink-600">{q.ctr}%</td>
                    <td className="py-2 text-right text-ink-600">{q.pos}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>

        {/* 5 & 6 ── Winning / Declining Keywords ── */}
        <div className="grid gap-6 lg:grid-cols-2">
          <Section n={5} title="Winning Keywords" subtitle="Strongest growth this period" color={color}>
            <ul className="space-y-2">
              {winners.map((k) => (
                <li key={k.q} className="flex items-center justify-between gap-3 rounded-lg border border-emerald-100 bg-emerald-50/60 px-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-ink-800">{k.q}</p>
                    <p className="text-[11px] text-ink-500">Position {k.from} → {k.pos}</p>
                  </div>
                  <span className="inline-flex flex-shrink-0 items-center gap-0.5 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700"><ArrowUpRight size={12} /> {k.growth}%</span>
                </li>
              ))}
            </ul>
          </Section>

          <Section n={6} title="Declining Keywords" subtitle="Losing traffic or rankings" color={color}>
            <ul className="space-y-2">
              {decliners.map((k) => (
                <li key={k.q} className="flex items-center justify-between gap-3 rounded-lg border border-rose-100 bg-rose-50/60 px-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-ink-800">{k.q}</p>
                    <p className="text-[11px] text-ink-500">Position {k.from} → {k.pos}</p>
                  </div>
                  <span className="inline-flex flex-shrink-0 items-center gap-0.5 rounded-full bg-rose-100 px-2 py-0.5 text-xs font-semibold text-rose-600"><ArrowDownRight size={12} /> {k.drop}%</span>
                </li>
              ))}
            </ul>
          </Section>
        </div>

        {/* 7 ── Growth Opportunities ── */}
        <Section n={7} title="Growth Opportunities" subtitle="Keywords on the edge of page one — quick wins" color={color}>
          <div className="h-40">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={opportunities} layout="vertical" margin={{ left: 8, right: 24 }}>
                <XAxis type="number" hide domain={[0, "dataMax + 1500"]} />
                <YAxis type="category" dataKey="q" width={160} tick={{ fontSize: 11, fill: "#64748b" }} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={{ borderRadius: 10, border: "1px solid #e2e8f0", fontSize: 12 }} cursor={{ fill: "#f8fafc" }} formatter={(v) => [`${fmt(Number(v))} impressions`, ""]} />
                <Bar dataKey="impr" fill={color} radius={[0, 4, 4, 0]} barSize={16} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <ul className="mt-2 grid gap-2 sm:grid-cols-2">
            {opportunities.map((o) => (
              <li key={o.q} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm">
                <span className="truncate text-ink-700">{o.q}</span>
                <span className="flex-shrink-0 text-xs font-medium text-amber-600">pos {o.pos}</span>
              </li>
            ))}
          </ul>
        </Section>

        {/* 8 ── AI Insights ── */}
        <Section n={8} title="AI Insights" subtitle="Automated analysis of what matters" color={color}>
          <div className="rounded-xl border p-4" style={{ borderColor: `${color}33`, background: `${color}0a` }}>
            <div className="mb-2 flex items-center gap-2 text-sm font-semibold" style={{ color }}>
              <Sparkles size={15} /> AI summary
            </div>
            <p className="text-sm leading-relaxed text-ink-700">
              The account is in a healthy growth phase: rising impressions paired with improving CTR show your content is matching demand, not just appearing more often. Momentum is concentrated in premium product terms, which tend to convert well. The main risk is over-reliance on a few head terms — diversifying into the four near-page-one opportunities would broaden the traffic base and reduce volatility.
            </p>
          </div>
        </Section>

        {/* 9 ── Recommended Actions ── */}
        <Section n={9} title="Recommended Actions" subtitle="Prioritised for impact" color={color}>
          <ol className="space-y-2">
            {recommendations.map((r, i) => (
              <li key={i} className="flex gap-3 rounded-lg border border-slate-100 bg-white p-3">
                <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white" style={{ background: color }}>{i + 1}</span>
                <div className="min-w-0">
                  <span className={`mb-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${r.priority === "High" ? "bg-rose-50 text-rose-600" : "bg-amber-50 text-amber-600"}`}>{r.priority} priority</span>
                  <p className="text-sm text-ink-700">{r.text}</p>
                </div>
              </li>
            ))}
          </ol>
        </Section>

        {/* 10 ── Next Month Action Plan ── */}
        <Section n={10} title="Next Month Action Plan" subtitle="What we'll execute next" color={color}>
          <ul className="space-y-2">
            {actionPlan.map((a, i) => (
              <li key={i} className="flex items-start gap-3 rounded-lg bg-slate-50 px-3 py-2.5">
                <CheckCircle2 size={16} className="mt-0.5 flex-shrink-0" style={{ color }} />
                <span className="text-sm text-ink-700">{a}</span>
              </li>
            ))}
          </ul>
        </Section>

        {/* 11 ── Agency Notes ── */}
        <Section n={11} title="Agency Notes" subtitle="A personal note from your team" color={color}>
          <div className="flex gap-3 rounded-xl border border-dashed border-slate-300 bg-slate-50/50 p-4">
            <StickyNote size={18} className="mt-0.5 flex-shrink-0 text-ink-400" />
            <p className="text-sm italic leading-relaxed text-ink-600">
              “Great momentum this month, team. We&apos;re especially pleased with the carbon-plate category breaking into the top five — that aligns directly with the Q3 product push. Next month we&apos;ll focus on the beginner audience to widen the funnel. As always, reach out any time with questions.”
            </p>
          </div>
        </Section>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-slate-100 pt-5 text-xs text-ink-400">
          <span>{branding.footer_text || `Prepared by ${branding.name || "Your Agency"}`}</span>
          {branding.website && <span>{branding.website}</span>}
        </div>
      </div>
    </div>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────────────
function Section({ n, title, subtitle, color, children }: { n: number; title: string; subtitle?: string; color: string; children: React.ReactNode }) {
  return (
    <section>
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

// Darken a hex color a touch for the gradient.
function shade(hex: string): string {
  try {
    const n = parseInt(hex.replace("#", ""), 16);
    const r = Math.max(0, ((n >> 16) & 255) - 40);
    const g = Math.max(0, ((n >> 8) & 255) - 40);
    const b = Math.max(0, (n & 255) - 40);
    return `rgb(${r},${g},${b})`;
  } catch {
    return hex;
  }
}
