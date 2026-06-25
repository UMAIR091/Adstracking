"use client";

import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import { MousePointerClick, Eye, Percent, TrendingUp, Sparkles } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export type GscReportData = {
  totals: { clicks: number; impressions: number; ctr: number; position: number };
  byDate: { date: string; clicks: number; impressions: number; ctr: number; position: number }[];
  topQueries: { key: string; clicks: number; impressions: number }[];
};

const fmtNum = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 0 });
const fmtPct = (n: number) => `${(n * 100).toFixed(1)}%`;
const fmtPos = (n: number) => n.toFixed(1);
const shortDate = (d: string) => d.slice(5); // MM-DD

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

export function GscAnalytics({ report, sample = false }: { report: GscReportData; sample?: boolean }) {
  const { totals, byDate, topQueries } = report;
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

      {topQueries.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Top queries</CardTitle>
          </CardHeader>
          <CardContent>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-ink-400">
                  <th className="pb-2 font-medium">Query</th>
                  <th className="pb-2 text-right font-medium">Clicks</th>
                  <th className="pb-2 text-right font-medium">Impressions</th>
                </tr>
              </thead>
              <tbody>
                {topQueries.slice(0, 8).map((q) => (
                  <tr key={q.key} className="border-t border-slate-100">
                    <td className="truncate py-2 pr-3 text-ink-800">{q.key}</td>
                    <td className="py-2 text-right text-ink-600">{fmtNum(q.clicks)}</td>
                    <td className="py-2 text-right text-ink-600">{fmtNum(q.impressions)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
