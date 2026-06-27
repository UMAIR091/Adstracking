"use client";

import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import { MousePointerClick, Eye, Percent, TrendingUp, Sparkles, FileText, Globe, Monitor } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type DimRow = { key: string; clicks: number; impressions: number; ctr?: number; position?: number };

export type GscReportData = {
  totals: { clicks: number; impressions: number; ctr: number; position: number };
  byDate: { date: string; clicks: number; impressions: number; ctr: number; position: number }[];
  topQueries: DimRow[];
  // Added in a later sync; optional so already-cached snapshots still render.
  topPages?: DimRow[];
  topCountries?: DimRow[];
  topDevices?: DimRow[];
};

const fmtNum = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 0 });
const fmtPct = (n: number) => `${(n * 100).toFixed(1)}%`;
const fmtPos = (n: number) => n.toFixed(1);
const shortDate = (d: string) => d.slice(5); // MM-DD

// Search Console page rows are full URLs — show the path so the table stays readable.
const pagePath = (url: string) => {
  try {
    const u = new URL(url);
    return u.pathname === "/" ? u.hostname : u.pathname + u.search;
  } catch {
    return url;
  }
};

function MetricChart({
  title,
  icon: Icon,
  value,
  color,
  data,
  dataKey,
}: {
  title: string;
  icon: typeof MousePointerClick;
  value: string;
  color: string;
  data: GscReportData["byDate"];
  dataKey: "clicks" | "impressions" | "ctr" | "position";
}) {
  const id = `grad-${dataKey}`;
  return (
    <Card className="transition-shadow hover:shadow-md">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-sm text-ink-500">
            <Icon size={15} style={{ color }} /> {title}
          </CardTitle>
        </div>
        <p className="text-2xl font-semibold text-ink-900">{value}</p>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="h-24">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
              <defs>
                <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={color} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={color} stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="date" hide />
              <Tooltip
                contentStyle={{ borderRadius: 10, border: "1px solid #e2e8f0", fontSize: 12 }}
                labelFormatter={(l) => shortDate(String(l))}
                formatter={(v) => {
                  const n = Number(v);
                  return [dataKey === "ctr" ? fmtPct(n) : dataKey === "position" ? fmtPos(n) : fmtNum(n), title];
                }}
              />
              <Area type="monotone" dataKey={dataKey} stroke={color} strokeWidth={2} fill={`url(#${id})`} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

// Reusable performance table for a Search Console dimension (queries, pages,
// countries, devices). Shows CTR + position columns when the rows carry them.
function DimensionTable({
  title,
  icon: Icon,
  label,
  rows,
  format = (k) => k,
  limit = 8,
}: {
  title: string;
  icon: typeof FileText;
  label: string;
  rows: DimRow[];
  format?: (key: string) => string;
  limit?: number;
}) {
  if (rows.length === 0) return null;
  const hasDetail = rows.some((r) => r.ctr != null || r.position != null);
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Icon size={15} className="text-ink-400" /> {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-ink-400">
              <th className="pb-2 font-medium">{label}</th>
              <th className="pb-2 text-right font-medium">Clicks</th>
              <th className="pb-2 text-right font-medium">Impressions</th>
              {hasDetail && <th className="pb-2 text-right font-medium">CTR</th>}
              {hasDetail && <th className="pb-2 text-right font-medium">Avg pos</th>}
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, limit).map((r) => (
              <tr key={r.key} className="border-t border-slate-100">
                <td className="max-w-0 truncate py-2 pr-3 text-ink-800" title={format(r.key)}>{format(r.key)}</td>
                <td className="py-2 text-right text-ink-600">{fmtNum(r.clicks)}</td>
                <td className="py-2 text-right text-ink-600">{fmtNum(r.impressions)}</td>
                {hasDetail && <td className="py-2 text-right text-ink-600">{r.ctr != null ? fmtPct(r.ctr) : "—"}</td>}
                {hasDetail && <td className="py-2 text-right text-ink-600">{r.position != null ? fmtPos(r.position) : "—"}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

export function GscAnalytics({ report, sample = false }: { report: GscReportData; sample?: boolean }) {
  const { totals, byDate, topQueries } = report;
  const topPages = report.topPages ?? [];
  const topCountries = report.topCountries ?? [];
  const topDevices = report.topDevices ?? [];

  return (
    <div className={`space-y-5 ${sample ? "relative" : ""}`}>
      {sample && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700">
          <Sparkles size={14} /> Sample data — connect Google Search Console above to see this client&apos;s real numbers.
        </div>
      )}
      <div className={`grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4 ${sample ? "opacity-70" : ""}`}>
        <MetricChart title="Total clicks" icon={MousePointerClick} value={fmtNum(totals.clicks)} color="#4f46e5" data={byDate} dataKey="clicks" />
        <MetricChart title="Total impressions" icon={Eye} value={fmtNum(totals.impressions)} color="#0ea5e9" data={byDate} dataKey="impressions" />
        <MetricChart title="Average CTR" icon={Percent} value={fmtPct(totals.ctr)} color="#10b981" data={byDate} dataKey="ctr" />
        <MetricChart title="Average position" icon={TrendingUp} value={fmtPos(totals.position)} color="#f59e0b" data={byDate} dataKey="position" />
      </div>

      <DimensionTable title="Top queries" icon={Percent} label="Query" rows={topQueries} />
      <DimensionTable title="Top pages" icon={FileText} label="Page" rows={topPages} format={pagePath} />

      {(topCountries.length > 0 || topDevices.length > 0) && (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <DimensionTable title="Top countries" icon={Globe} label="Country" rows={topCountries} limit={6} />
          <DimensionTable title="Devices" icon={Monitor} label="Device" rows={topDevices} limit={6} />
        </div>
      )}
    </div>
  );
}
