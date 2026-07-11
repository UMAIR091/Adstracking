"use client";

// Google Business Profile analytics block — local presence metrics from the
// normalized GbpReport shape (metrics.ts).
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import { Eye, MousePointerClick, Phone, Navigation, MessageSquare, CalendarCheck } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { GbpReport } from "@/lib/integrations/metrics";

const fmtNum = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 0 });
const shortDate = (d: string) => d.slice(5);

function MetricChart({
  title, icon: Icon, value, color, data, dataKey,
}: {
  title: string;
  icon: typeof Eye;
  value: string;
  color: string;
  data: GbpReport["byDate"];
  dataKey: "impressions" | "websiteClicks";
}) {
  const id = `gbp-grad-${dataKey}`;
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

function Stat({ icon: Icon, label, value }: { icon: typeof Eye; label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
      <p className="flex items-center gap-1.5 text-xs text-ink-500"><Icon size={13} aria-hidden /> {label}</p>
      <p className="mt-1 text-xl font-semibold text-ink-900">{value}</p>
    </div>
  );
}

export function GbpAnalytics({ report }: { report: GbpReport }) {
  const t = report.totals;
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <MetricChart title="Profile impressions" icon={Eye} value={fmtNum(t.impressions)} color="#f43f5e" data={report.byDate} dataKey="impressions" />
        <MetricChart title="Website clicks" icon={MousePointerClick} value={fmtNum(t.websiteClicks)} color="#4f46e5" data={report.byDate} dataKey="websiteClicks" />
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat icon={Phone} label="Calls" value={fmtNum(t.calls)} />
        <Stat icon={Navigation} label="Direction requests" value={fmtNum(t.directionRequests)} />
        <Stat icon={MessageSquare} label="Conversations" value={fmtNum(t.conversations)} />
        <Stat icon={CalendarCheck} label="Bookings" value={fmtNum(t.bookings)} />
      </div>
      <p className="text-xs text-ink-400">
        Business Profile data lags a few days — the window ends 3 days ago by design.
      </p>
    </div>
  );
}
