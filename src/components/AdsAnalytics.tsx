"use client";

// Generic paid-media analytics block. Renders any normalized AdsReport
// (Google Ads, Meta Ads, LinkedIn Ads, TikTok Ads). Tolerates the older
// Meta Ads snapshot shape (no platform/currency/revenue fields).
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import { MousePointerClick, Eye, Wallet, Target, Megaphone } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export type AdsReportData = {
  currency?: string;
  totals: {
    spend: number; impressions: number; clicks: number; ctr: number; cpc: number;
    conversions: number; costPerConversion: number; revenue?: number; roas?: number;
    reach?: number;
  };
  byDate: { date: string; spend: number; impressions: number; clicks: number; conversions?: number }[];
  topCampaigns: { name: string; spend: number; impressions: number; clicks: number; ctr: number; conversions?: number }[];
};

const fmtNum = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 0 });
const fmtPct = (n: number) => `${(n * 100).toFixed(2)}%`;
const shortDate = (d: string) => d.slice(5);

function money(n: number, currency: string): string {
  try {
    return n.toLocaleString(undefined, { style: "currency", currency, maximumFractionDigits: n >= 100 ? 0 : 2 });
  } catch {
    return `${currency} ${n.toFixed(2)}`;
  }
}

function MetricChart({
  title, icon: Icon, value, color, data, dataKey, format,
}: {
  title: string;
  icon: typeof Eye;
  value: string;
  color: string;
  data: AdsReportData["byDate"];
  dataKey: "spend" | "impressions" | "clicks";
  format: (v: number) => string;
}) {
  const id = `ads-grad-${dataKey}`;
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
                formatter={(v) => [format(Number(v)), title]}
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

export function AdsAnalytics({ report }: { report: AdsReportData }) {
  const currency = report.currency ?? "USD";
  const t = report.totals;
  const revenue = t.revenue ?? 0;
  const roas = t.roas ?? 0;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <MetricChart title="Ad spend" icon={Wallet} value={money(t.spend, currency)} color="#4f46e5" data={report.byDate} dataKey="spend" format={(v) => money(v, currency)} />
        <MetricChart title="Impressions" icon={Eye} value={fmtNum(t.impressions)} color="#0ea5e9" data={report.byDate} dataKey="impressions" format={fmtNum} />
        <MetricChart title="Clicks" icon={MousePointerClick} value={fmtNum(t.clicks)} color="#10b981" data={report.byDate} dataKey="clicks" format={fmtNum} />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="CTR" value={fmtPct(t.ctr)} />
        <Stat label="CPC" value={money(t.cpc, currency)} />
        <Stat label="Conversions" value={fmtNum(t.conversions)} />
        <Stat label="Cost / conversion" value={t.conversions > 0 ? money(t.costPerConversion, currency) : "—"} />
        <Stat label="Conv. value" value={revenue > 0 ? money(revenue, currency) : "—"} />
        <Stat label="ROAS" value={roas > 0 ? `${roas.toFixed(2)}×` : "—"} />
      </div>

      {report.topCampaigns.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Megaphone size={15} className="text-ink-400" /> Top campaigns by spend
            </CardTitle>
          </CardHeader>
          <CardContent>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-ink-400">
                  <th className="pb-2 font-medium">Campaign</th>
                  <th className="pb-2 text-right font-medium">Spend</th>
                  <th className="pb-2 text-right font-medium">Impressions</th>
                  <th className="pb-2 text-right font-medium">Clicks</th>
                  <th className="pb-2 text-right font-medium">CTR</th>
                  <th className="pb-2 text-right font-medium">Conv.</th>
                </tr>
              </thead>
              <tbody>
                {report.topCampaigns.slice(0, 8).map((c) => (
                  <tr key={c.name} className="border-t border-slate-100">
                    <td className="max-w-0 truncate py-2 pr-3 text-ink-800" title={c.name}>{c.name}</td>
                    <td className="py-2 text-right text-ink-600">{money(c.spend, currency)}</td>
                    <td className="py-2 text-right text-ink-600">{fmtNum(c.impressions)}</td>
                    <td className="py-2 text-right text-ink-600">{fmtNum(c.clicks)}</td>
                    <td className="py-2 text-right text-ink-600">{fmtPct(c.ctr)}</td>
                    <td className="py-2 text-right text-ink-600">{fmtNum(c.conversions ?? 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      <p className="flex items-center gap-1.5 text-xs text-ink-400">
        <Target size={12} aria-hidden /> Conversions and values reflect the platform&apos;s own attribution settings.
      </p>
    </div>
  );
}
