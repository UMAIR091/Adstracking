"use client";

// SEO analytics block (Ahrefs & Semrush; any provider filling the normalized
// SeoReport renders here). SEO metrics are point-in-time, so this is stat tiles
// plus the top organic keywords rather than a time series.
import { Search, TrendingUp, Link2, Globe, Gauge } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { SeoReport } from "@/lib/integrations/metrics";

const fmtNum = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 0 });

function Stat({ label, value, icon: Icon }: { label: string; value: string; icon: typeof Search }) {
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
      <p className="flex items-center gap-1.5 text-xs text-ink-500">
        <Icon size={13} className="text-ink-400" /> {label}
      </p>
      <p className="mt-1 text-xl font-semibold text-ink-900">{value}</p>
    </div>
  );
}

export function SeoAnalytics({ report }: { report: SeoReport }) {
  const { totals } = report;
  return (
    <div className="space-y-5">
      <p className="text-sm text-ink-500">
        Organic search overview for <span className="font-medium text-ink-700">{report.target}</span>
      </p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Stat label="Domain Rating" value={fmtNum(totals.domainRating)} icon={Gauge} />
        <Stat label="Organic keywords" value={fmtNum(totals.organicKeywords)} icon={Search} />
        <Stat label="Organic traffic" value={fmtNum(totals.organicTraffic)} icon={TrendingUp} />
        <Stat label="Backlinks" value={fmtNum(totals.backlinks)} icon={Link2} />
        <Stat label="Referring domains" value={fmtNum(totals.referringDomains)} icon={Globe} />
      </div>

      {report.topKeywords.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Search size={15} className="text-ink-400" /> Top organic keywords
            </CardTitle>
          </CardHeader>
          <CardContent>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-ink-400">
                  <th className="pb-2 font-medium">Keyword</th>
                  <th className="pb-2 text-right font-medium">Position</th>
                  <th className="pb-2 text-right font-medium">Volume</th>
                  <th className="pb-2 text-right font-medium">Traffic</th>
                </tr>
              </thead>
              <tbody>
                {report.topKeywords.map((k, i) => (
                  <tr key={`${k.keyword}-${i}`} className="border-t border-slate-100">
                    <td className="max-w-0 truncate py-2 pr-3 text-ink-800" title={k.keyword}>{k.keyword}</td>
                    <td className="py-2 text-right text-ink-600">{k.position > 0 ? k.position : "—"}</td>
                    <td className="py-2 text-right text-ink-600">{fmtNum(k.volume)}</td>
                    <td className="py-2 text-right text-ink-600">{fmtNum(k.traffic)}</td>
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
