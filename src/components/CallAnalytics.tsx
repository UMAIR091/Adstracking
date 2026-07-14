"use client";

// Call-tracking analytics block (CallRail today; any provider filling the
// normalized CallReport renders here).
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import { PhoneCall, PhoneIncoming, UserPlus } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { CallReport } from "@/lib/integrations/metrics";

const fmtNum = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 0 });
const shortDate = (d: string) => d.slice(5);

function duration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function MetricChart({
  title, icon: Icon, value, color, data, dataKey,
}: {
  title: string;
  icon: typeof PhoneCall;
  value: string;
  color: string;
  data: CallReport["byDate"];
  dataKey: "calls" | "leads";
}) {
  const id = `call-grad-${dataKey}`;
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

export function CallAnalytics({ report }: { report: CallReport }) {
  const { totals } = report;
  const answerRate = totals.calls > 0 ? `${((totals.answered / totals.calls) * 100).toFixed(0)}%` : "—";
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <MetricChart title="Calls" icon={PhoneCall} value={fmtNum(totals.calls)} color="#0ea5e9" data={report.byDate} dataKey="calls" />
        <MetricChart title="New leads (first-time)" icon={UserPlus} value={fmtNum(totals.leads)} color="#10b981" data={report.byDate} dataKey="leads" />
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Answered" value={fmtNum(totals.answered)} />
        <Stat label="Missed" value={fmtNum(totals.missed)} />
        <Stat label="Answer rate" value={answerRate} />
        <Stat label="Avg. duration" value={duration(totals.avgDurationSec)} />
      </div>

      {report.topSources.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <PhoneIncoming size={15} className="text-ink-400" /> Top call sources
            </CardTitle>
          </CardHeader>
          <CardContent>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-ink-400">
                  <th className="pb-2 font-medium">Source</th>
                  <th className="pb-2 text-right font-medium">Calls</th>
                </tr>
              </thead>
              <tbody>
                {report.topSources.map((s) => (
                  <tr key={s.name} className="border-t border-slate-100">
                    <td className="max-w-0 truncate py-2 pr-3 text-ink-800" title={s.name}>{s.name}</td>
                    <td className="py-2 text-right text-ink-600">{fmtNum(s.calls)}</td>
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
