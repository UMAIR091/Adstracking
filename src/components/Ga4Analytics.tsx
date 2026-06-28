"use client";

import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import { Users, MousePointer2, Eye, Sparkles, FileText, Share2, Monitor, Globe } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Ga4Dim = { key: string; sessions: number; users: number };

export type Ga4ReportData = {
  totals: {
    users: number; newUsers: number; sessions: number; engagedSessions: number;
    engagementRate: number; avgEngagementTime: number; views: number;
    conversions: number; totalRevenue: number;
  };
  byDate: { date: string; users: number; sessions: number; views: number }[];
  topLandingPages?: Ga4Dim[];
  trafficSources?: Ga4Dim[];
  devices?: Ga4Dim[];
  countries?: Ga4Dim[];
};

const fmtNum = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 0 });
const fmtPct = (n: number) => `${(n * 100).toFixed(1)}%`;
const shortDate = (d: string) => d.slice(5); // MM-DD
const titleCase = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

function fmtDuration(seconds: number): string {
  const s = Math.round(seconds);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return rem ? `${m}m ${rem}s` : `${m}m`;
}

function pagePath(url: string): string {
  if (!url || url === "(not set)") return url;
  return url.length > 48 ? `${url.slice(0, 48)}…` : url;
}

function MetricChart({
  title, icon: Icon, value, color, data, dataKey,
}: {
  title: string;
  icon: typeof Users;
  value: string;
  color: string;
  data: Ga4ReportData["byDate"];
  dataKey: "users" | "sessions" | "views";
}) {
  const id = `ga4-grad-${dataKey}`;
  return (
    <Card className="transition-shadow hover:shadow-md">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm text-ink-500">
          <Icon size={15} style={{ color }} /> {title}
        </CardTitle>
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
                formatter={(v) => [fmtNum(Number(v)), title]}
              />
              <Area type="monotone" dataKey={dataKey} stroke={color} strokeWidth={2} fill={`url(#${id})`} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
      <p className="text-xs text-ink-500">{label}</p>
      <p className="mt-1 text-xl font-semibold text-ink-900">{value}</p>
    </div>
  );
}

function DimTable({
  title, icon: Icon, label, rows, format = (k) => k, limit = 6,
}: {
  title: string;
  icon: typeof FileText;
  label: string;
  rows: Ga4Dim[];
  format?: (key: string) => string;
  limit?: number;
}) {
  if (rows.length === 0) return null;
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
              <th className="pb-2 text-right font-medium">Sessions</th>
              <th className="pb-2 text-right font-medium">Users</th>
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, limit).map((r) => (
              <tr key={r.key} className="border-t border-slate-100">
                <td className="max-w-0 truncate py-2 pr-3 text-ink-800" title={format(r.key)}>{format(r.key)}</td>
                <td className="py-2 text-right text-ink-600">{fmtNum(r.sessions)}</td>
                <td className="py-2 text-right text-ink-600">{fmtNum(r.users)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

export function Ga4Analytics({ report, sample = false }: { report: Ga4ReportData; sample?: boolean }) {
  const { totals, byDate } = report;
  const landingPages = report.topLandingPages ?? [];
  const trafficSources = report.trafficSources ?? [];
  const devices = report.devices ?? [];
  const countries = report.countries ?? [];

  return (
    <div className={`space-y-5 ${sample ? "relative" : ""}`}>
      {sample && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700">
          <Sparkles size={14} /> Sample data — connect Google Analytics 4 above to see this client&apos;s real numbers.
        </div>
      )}

      <div className={`grid grid-cols-1 gap-4 sm:grid-cols-3 ${sample ? "opacity-70" : ""}`}>
        <MetricChart title="Users" icon={Users} value={fmtNum(totals.users)} color="#f59e0b" data={byDate} dataKey="users" />
        <MetricChart title="Sessions" icon={MousePointer2} value={fmtNum(totals.sessions)} color="#4f46e5" data={byDate} dataKey="sessions" />
        <MetricChart title="Views" icon={Eye} value={fmtNum(totals.views)} color="#0ea5e9" data={byDate} dataKey="views" />
      </div>

      <div className={`grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6 ${sample ? "opacity-70" : ""}`}>
        <Stat label="New users" value={fmtNum(totals.newUsers)} />
        <Stat label="Engaged sessions" value={fmtNum(totals.engagedSessions)} />
        <Stat label="Engagement rate" value={fmtPct(totals.engagementRate)} />
        <Stat label="Avg engagement" value={fmtDuration(totals.avgEngagementTime)} />
        <Stat label="Conversions" value={fmtNum(totals.conversions)} />
        {totals.totalRevenue > 0 && <Stat label="Total revenue" value={fmtNum(totals.totalRevenue)} />}
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <DimTable title="Top landing pages" icon={FileText} label="Landing page" rows={landingPages} format={pagePath} />
        <DimTable title="Traffic sources" icon={Share2} label="Channel" rows={trafficSources} />
        <DimTable title="Devices" icon={Monitor} label="Device" rows={devices} format={titleCase} />
        <DimTable title="Top countries" icon={Globe} label="Country" rows={countries} />
      </div>
    </div>
  );
}
