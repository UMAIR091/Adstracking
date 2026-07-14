"use client";

// Video analytics block (YouTube Analytics today; any provider filling the
// normalized VideoReport renders here).
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import { Play, Clock, UserPlus } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { VideoReport } from "@/lib/integrations/metrics";

const fmtNum = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 0 });
const shortDate = (d: string) => d.slice(5);

function watchTime(minutes: number): string {
  const hrs = minutes / 60;
  return hrs >= 1 ? `${fmtNum(hrs)} hrs` : `${fmtNum(minutes)} min`;
}

function MetricChart({
  title, icon: Icon, value, color, data, dataKey,
}: {
  title: string;
  icon: typeof Play;
  value: string;
  color: string;
  data: VideoReport["byDate"];
  dataKey: "views" | "watchTimeMinutes" | "subscribersGained";
}) {
  const id = `video-grad-${dataKey}`;
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

export function VideoAnalytics({ report }: { report: VideoReport }) {
  const { totals } = report;
  const netSubs = totals.subscribersGained - totals.subscribersLost;
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <MetricChart title="Views" icon={Play} value={fmtNum(totals.views)} color="#ef4444" data={report.byDate} dataKey="views" />
        <MetricChart title="Watch time (min)" icon={Clock} value={watchTime(totals.watchTimeMinutes)} color="#6366f1" data={report.byDate} dataKey="watchTimeMinutes" />
        <MetricChart title="Subscribers gained" icon={UserPlus} value={fmtNum(totals.subscribersGained)} color="#10b981" data={report.byDate} dataKey="subscribersGained" />
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Stat label="Subscribers" value={fmtNum(totals.subscribers)} />
        <Stat label="Net new subs" value={`${netSubs >= 0 ? "+" : ""}${fmtNum(netSubs)}`} />
        <Stat label="Avg. view time" value={`${totals.avgViewDurationSec}s`} />
        <Stat label="Likes" value={fmtNum(totals.likes)} />
        <Stat label="Comments" value={fmtNum(totals.comments)} />
      </div>
    </div>
  );
}
