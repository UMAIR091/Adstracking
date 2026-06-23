"use client";

import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

type Branding = { name: string; logo_url: string | null; brand_color: string; website: string | null; footer_text: string | null };
type Totals = { clicks: number; impressions: number; ctr: number; position: number };
type GscData = {
  totals: Totals;
  previousTotals?: Totals | null;
  insights?: { summary: string; highlights: string[]; recommendations: string[] } | null;
  topQueries: { key: string; clicks: number; impressions: number; ctr: number; position: number }[];
  topPages: { key: string; clicks: number; impressions: number }[];
  byDate: { date: string; clicks: number; impressions: number; ctr: number; position: number }[];
};

const fmt = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 0 });

// Period-over-period change. For average position a decrease is an improvement,
// so `lowerIsBetter` flips which direction counts as good.
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
  const { totals, previousTotals, insights, topQueries, topPages, byDate } = data;

  const kpis = [
    { l: "Clicks", v: fmt(totals.clicks), d: delta(totals.clicks, previousTotals?.clicks) },
    { l: "Impressions", v: fmt(totals.impressions), d: delta(totals.impressions, previousTotals?.impressions) },
    { l: "Avg CTR", v: `${(totals.ctr * 100).toFixed(1)}%`, d: delta(totals.ctr, previousTotals?.ctr) },
    { l: "Avg Position", v: totals.position.toFixed(1), d: delta(totals.position, previousTotals?.position, true) },
  ];

  return (
    <div className="mx-auto max-w-3xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm print:border-0 print:shadow-none">
      {/* Cover */}
      <div className="px-10 py-12 text-white" style={{ background: `linear-gradient(135deg, ${color}, ${shade(color)})` }}>
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
        <h1 className="mt-10 text-3xl font-semibold">{title}</h1>
        <p className="mt-2 text-white/80">Prepared for {clientName} · {period.start} → {period.end}</p>
      </div>

      <div className="space-y-8 p-10">
        {/* Executive summary (AI-generated) */}
        {insights?.summary && (
          <div>
            <p className="mb-2 font-semibold text-ink-900">Executive summary</p>
            <p className="text-sm leading-relaxed text-ink-700">{insights.summary}</p>
            {insights.highlights?.length > 0 && (
              <ul className="mt-3 space-y-1.5">
                {insights.highlights.map((h, i) => (
                  <li key={i} className="flex gap-2 text-sm text-ink-700">
                    <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full" style={{ background: color }} />
                    <span>{h}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* KPIs */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {kpis.map((m) => (
            <div key={m.l} className="rounded-xl border border-slate-100 bg-slate-50 p-4">
              <p className="text-xs text-ink-500">{m.l}</p>
              <p className="mt-1 text-2xl font-semibold" style={{ color }}>{m.v}</p>
              {m.d && (
                <p className={`mt-1 text-xs font-medium ${m.d.good ? "text-emerald-600" : "text-rose-500"}`}>
                  {m.d.pct >= 0 ? "▲" : "▼"} {Math.abs(m.d.pct).toFixed(0)}% vs prev.
                </p>
              )}
            </div>
          ))}
        </div>

        {/* Trend */}
        {byDate.length > 0 && (
          <div>
            <p className="mb-3 font-semibold text-ink-900">Clicks trend</p>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={byDate} margin={{ top: 6, right: 6, left: -10, bottom: 0 }}>
                  <defs>
                    <linearGradient id="rdFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={color} stopOpacity={0.3} />
                      <stop offset="100%" stopColor={color} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eef1f5" vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#94a3b8" }} interval={Math.ceil(byDate.length / 6)} tickLine={false} axisLine={false} tickFormatter={(d) => String(d).slice(5)} />
                  <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} tickLine={false} axisLine={false} />
                  <Tooltip contentStyle={{ borderRadius: 10, border: "1px solid #e2e8f0", fontSize: 12 }} />
                  <Area type="monotone" dataKey="clicks" stroke={color} strokeWidth={2.5} fill="url(#rdFill)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* Top queries */}
        {topQueries.length > 0 && (
          <div>
            <p className="mb-3 font-semibold text-ink-900">Top queries</p>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={topQueries.slice(0, 6)} layout="vertical" margin={{ left: 10, right: 16 }}>
                  <XAxis type="number" hide />
                  <YAxis type="category" dataKey="key" width={140} tick={{ fontSize: 11, fill: "#64748b" }} tickLine={false} axisLine={false} />
                  <Tooltip contentStyle={{ borderRadius: 10, border: "1px solid #e2e8f0", fontSize: 12 }} cursor={{ fill: "#f1f5f9" }} />
                  <Bar dataKey="clicks" fill={color} radius={[0, 4, 4, 0]} barSize={16} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* Top pages */}
        {topPages.length > 0 && (
          <div>
            <p className="mb-3 font-semibold text-ink-900">Top pages</p>
            <table className="w-full text-sm">
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
        )}

        {/* Recommendations (AI-generated) */}
        {insights?.recommendations && insights.recommendations.length > 0 && (
          <div className="rounded-xl border border-slate-100 bg-slate-50 p-5">
            <p className="mb-3 font-semibold text-ink-900">Recommendations</p>
            <ol className="space-y-2">
              {insights.recommendations.map((r, i) => (
                <li key={i} className="flex gap-3 text-sm text-ink-700">
                  <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white" style={{ background: color }}>{i + 1}</span>
                  <span>{r}</span>
                </li>
              ))}
            </ol>
          </div>
        )}

        <p className="border-t border-slate-100 pt-5 text-center text-xs text-ink-400">
          {branding.footer_text || `Prepared by ${branding.name || "Your Agency"}`}
          {branding.website ? ` · ${branding.website}` : ""}
        </p>
      </div>
    </div>
  );
}
