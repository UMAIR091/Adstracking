"use client";

// Video analytics block (YouTube Analytics today; any provider filling the
// normalized VideoReport renders here).
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import { Play, Clock, UserPlus, Video, Compass, Globe, MonitorSmartphone } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { VideoBreakdown, VideoReport } from "@/lib/integrations/metrics";

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

// A ranked dimension breakdown (traffic sources, geography, devices) with a
// proportional bar per row relative to the top entry's views.
function Breakdown({ title, icon: Icon, items }: { title: string; icon: typeof Play; items: VideoBreakdown[] }) {
  if (!items.length) return null;
  const max = Math.max(...items.map((i) => i.views), 1);
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Icon size={15} className="text-ink-400" /> {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {items.map((it, i) => (
          <div key={`${it.label}-${i}`}>
            <div className="flex items-baseline justify-between gap-2 text-sm">
              <span className="truncate text-ink-700" title={it.label}>{it.label}</span>
              <span className="tabular-nums text-ink-500">{fmtNum(it.views)}</span>
            </div>
            <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
              <div className="h-full rounded-full bg-brand-500" style={{ width: `${Math.max((it.views / max) * 100, 2)}%` }} />
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
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

      {!!report.topVideos?.length && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Video size={15} className="text-ink-400" /> Top videos
            </CardTitle>
          </CardHeader>
          <CardContent>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-ink-400">
                  <th className="pb-2 font-medium">Video</th>
                  <th className="pb-2 text-right font-medium">Views</th>
                  <th className="pb-2 text-right font-medium">Watch time</th>
                </tr>
              </thead>
              <tbody>
                {report.topVideos.map((v, i) => (
                  <tr key={`${v.title}-${i}`} className="border-t border-slate-100">
                    <td className="max-w-0 truncate py-2 pr-3 text-ink-800" title={v.title}>{v.title}</td>
                    <td className="py-2 text-right text-ink-600">{fmtNum(v.views)}</td>
                    <td className="py-2 text-right text-ink-600">{watchTime(v.watchTimeMinutes)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {(!!report.trafficSources?.length || !!report.geography?.length || !!report.devices?.length) && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Breakdown title="Traffic sources" icon={Compass} items={report.trafficSources ?? []} />
          <Breakdown title="Top countries" icon={Globe} items={report.geography ?? []} />
          <Breakdown title="Devices" icon={MonitorSmartphone} items={report.devices ?? []} />
        </div>
      )}
    </div>
  );
}
