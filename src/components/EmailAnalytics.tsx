"use client";

// Generic email-marketing analytics block (Mailchimp today; any provider that
// fills the normalized EmailReport renders here).
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import { Users, MailOpen, MousePointerClick, Send } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { EmailReport } from "@/lib/integrations/metrics";
import { CHART, chartTooltipStyle, chartTooltipLabelStyle } from "@/lib/chartColors";

const fmtNum = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 0 });
const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
const shortDate = (d: string) => d.slice(5);

function MetricChart({
  title, icon: Icon, value, color, data, dataKey,
}: {
  title: string;
  icon: typeof Users;
  value: string;
  color: string;
  data: EmailReport["byDate"];
  dataKey: "sent" | "opens" | "clicks";
}) {
  const id = `email-grad-${dataKey}`;
  return (
    <Card className="transition-colors hover:border-ink-300">
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
                contentStyle={chartTooltipStyle} labelStyle={chartTooltipLabelStyle}
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
    <div className="rounded-xl border border-ink-100 bg-ink-50 p-4">
      <p className="text-xs text-ink-500">{label}</p>
      <p className="mt-1 text-xl font-semibold text-ink-900">{value}</p>
    </div>
  );
}

export function EmailAnalytics({ report }: { report: EmailReport }) {
  const { totals } = report;
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <MetricChart title="Emails sent" icon={Send} value={fmtNum(totals.emailsSent)} color={CHART.indigo} data={report.byDate} dataKey="sent" />
        <MetricChart title="Opens" icon={MailOpen} value={fmtNum(totals.opens)} color={CHART.sky} data={report.byDate} dataKey="opens" />
        <MetricChart title="Clicks" icon={MousePointerClick} value={fmtNum(totals.clicks)} color={CHART.amber} data={report.byDate} dataKey="clicks" />
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Stat label="Subscribers" value={fmtNum(totals.subscribers)} />
        <Stat label="New subscribers" value={fmtNum(totals.newSubscribers)} />
        {/* Rates need something delivered to be a rate at all. */}
        <Stat label="Open rate" value={totals.emailsSent > 0 ? pct(totals.openRate) : "—"} />
        <Stat label="Click rate" value={totals.emailsSent > 0 ? pct(totals.clickRate) : "—"} />
        <Stat label="Unsubscribes" value={fmtNum(totals.unsubscribes)} />
      </div>

      {report.topCampaigns.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <MailOpen size={15} className="text-ink-500" /> Recent campaigns
            </CardTitle>
          </CardHeader>
          <CardContent>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-ink-500">
                  <th className="pb-2 font-medium">Campaign</th>
                  <th className="pb-2 text-right font-medium">Sent</th>
                  <th className="pb-2 text-right font-medium">Open rate</th>
                  <th className="pb-2 text-right font-medium">Click rate</th>
                  <th className="pb-2 text-right font-medium">Date</th>
                </tr>
              </thead>
              <tbody>
                {report.topCampaigns.map((c, i) => (
                  <tr key={`${c.name}-${i}`} className="border-t border-ink-100">
                    <td className="max-w-0 truncate py-2 pr-3 text-ink-800" title={c.name}>{c.name}</td>
                    <td className="py-2 text-right text-ink-600">{fmtNum(c.sent)}</td>
                    <td className="py-2 text-right text-ink-600">{pct(c.openRate)}</td>
                    <td className="py-2 text-right text-ink-600">{pct(c.clickRate)}</td>
                    <td className="py-2 text-right text-ink-600">{c.sentAt}</td>
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
