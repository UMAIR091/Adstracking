"use client";

import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

type Branding = { name: string; logo_url: string | null; brand_color: string; website: string | null; footer_text: string | null };

// Deterministic sample data so the preview always looks polished.
const days = Array.from({ length: 28 }, (_, i) => {
  const d = new Date();
  d.setDate(d.getDate() - (27 - i));
  const base = 35 + Math.round(20 * Math.sin(i / 3) + i * 0.8);
  return {
    date: d.toISOString().slice(5, 10),
    clicks: base,
    impressions: base * (28 + (i % 7)),
  };
});
const totalClicks = days.reduce((s, d) => s + d.clicks, 0);
const totalImpr = days.reduce((s, d) => s + d.impressions, 0);

const queries = [
  { q: "best running shoes", clicks: 412, impr: 9800, pos: 2.1 },
  { q: "marathon training plan", clicks: 318, impr: 7400, pos: 3.4 },
  { q: "trail shoes review", clicks: 256, impr: 6100, pos: 4.0 },
  { q: "running socks", clicks: 198, impr: 5200, pos: 5.2 },
  { q: "carbon plate shoes", clicks: 142, impr: 3900, pos: 6.8 },
];

// Sample AI output so the preview shows what Claude-generated summaries look like.
const sampleInsights = {
  summary:
    "Organic search delivered a strong month, with clicks up 18% and impressions up 12% over the prior period. Visibility improved across your core product terms — average position rose to 4.2 — and branded and high-intent queries like “carbon plate shoes” are now breaking into the top of page one.",
  highlights: [
    "“best running shoes” drove 412 clicks at an average position of 2.1 — your single biggest traffic source.",
    "Click-through rate held steady at 3.4% despite a 12% rise in impressions, a sign of healthy demand.",
    "“carbon plate shoes” climbed to position 6.8 — a clear opportunity to push onto page one.",
  ],
  recommendations: [
    "Refresh the “best running shoes” landing page to defend the position-2.1 ranking and capture featured-snippet real estate.",
    "Build a dedicated guide targeting “carbon plate shoes” to lift it from position 6.8 into the top 5.",
    "Add internal links from top pages to “marathon training plan” content to grow its 318-click base.",
  ],
};

export function ReportPreview({ branding }: { branding: Branding }) {
  const color = branding.brand_color || "#4f46e5";
  return (
    <div className="mx-auto max-w-3xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
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
        <h1 className="mt-10 text-3xl font-semibold">SEO Performance Report</h1>
        <p className="mt-2 text-white/80">Prepared for Acme Running Co · Last 28 days</p>
      </div>

      <div className="space-y-8 p-10">
        {/* Executive summary (AI-generated) */}
        <div>
          <div className="mb-2 flex items-center gap-2">
            <p className="font-semibold text-ink-900">Executive summary</p>
            <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-brand-600">AI-written</span>
          </div>
          <p className="text-sm leading-relaxed text-ink-700">{sampleInsights.summary}</p>
          <ul className="mt-3 space-y-1.5">
            {sampleInsights.highlights.map((h, i) => (
              <li key={i} className="flex gap-2 text-sm text-ink-700">
                <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full" style={{ background: color }} />
                <span>{h}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { l: "Clicks", v: totalClicks.toLocaleString(), d: "▲ 18%" },
            { l: "Impressions", v: totalImpr.toLocaleString(), d: "▲ 12%" },
            { l: "Avg CTR", v: "3.4%", d: "▲ 4%" },
            { l: "Avg Position", v: "4.2", d: "▲ 6%" },
          ].map((m) => (
            <div key={m.l} className="rounded-xl border border-slate-100 bg-slate-50 p-4">
              <p className="text-xs text-ink-500">{m.l}</p>
              <p className="mt-1 text-2xl font-semibold" style={{ color }}>{m.v}</p>
              <p className="mt-1 text-xs font-medium text-emerald-600">{m.d} vs prev.</p>
            </div>
          ))}
        </div>

        {/* Trend */}
        <div>
          <p className="mb-3 font-semibold text-ink-900">Clicks & impressions trend</p>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={days} margin={{ top: 6, right: 6, left: -10, bottom: 0 }}>
                <defs>
                  <linearGradient id="rpFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={color} stopOpacity={0.3} />
                    <stop offset="100%" stopColor={color} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#eef1f5" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#94a3b8" }} interval={6} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={{ borderRadius: 10, border: "1px solid #e2e8f0", fontSize: 12 }} />
                <Area type="monotone" dataKey="clicks" stroke={color} strokeWidth={2.5} fill="url(#rpFill)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Top queries */}
        <div>
          <p className="mb-3 font-semibold text-ink-900">Top queries</p>
          <div className="h-44">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={queries} layout="vertical" margin={{ left: 10, right: 16 }}>
                <XAxis type="number" hide />
                <YAxis type="category" dataKey="q" width={130} tick={{ fontSize: 11, fill: "#64748b" }} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={{ borderRadius: 10, border: "1px solid #e2e8f0", fontSize: 12 }} cursor={{ fill: "#f1f5f9" }} />
                <Bar dataKey="clicks" fill={color} radius={[0, 4, 4, 0]} barSize={16} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Recommendations (AI-generated) */}
        <div className="rounded-xl border border-slate-100 bg-slate-50 p-5">
          <p className="mb-3 font-semibold text-ink-900">Recommendations</p>
          <ol className="space-y-2">
            {sampleInsights.recommendations.map((r, i) => (
              <li key={i} className="flex gap-3 text-sm text-ink-700">
                <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white" style={{ background: color }}>{i + 1}</span>
                <span>{r}</span>
              </li>
            ))}
          </ol>
        </div>

        <p className="border-t border-slate-100 pt-5 text-center text-xs text-ink-400">
          {branding.footer_text || `Prepared by ${branding.name || "Your Agency"}`}
          {branding.website ? ` · ${branding.website}` : ""}
        </p>
      </div>
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
