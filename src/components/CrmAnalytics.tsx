"use client";

// Generic CRM analytics block (HubSpot today; any CRM that fills the
// normalized CrmReport renders here).
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import { Users, Handshake, Trophy } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { CrmReport } from "@/lib/integrations/metrics";

const fmtNum = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 0 });
const shortDate = (d: string) => d.slice(5);

function money(n: number, currency: string): string {
  try {
    return n.toLocaleString(undefined, { style: "currency", currency, maximumFractionDigits: n >= 100 ? 0 : 2 });
  } catch {
    return `${currency} ${n.toFixed(2)}`;
  }
}

function MetricChart({
  title, icon: Icon, value, color, data, dataKey,
}: {
  title: string;
  icon: typeof Users;
  value: string;
  color: string;
  data: CrmReport["byDate"];
  dataKey: "contacts" | "deals";
}) {
  const id = `crm-grad-${dataKey}`;
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

export function CrmAnalytics({ report }: { report: CrmReport }) {
  const { totals, currency } = report;
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <MetricChart title="New contacts (leads)" icon={Users} value={fmtNum(totals.newContacts)} color="#f59e0b" data={report.byDate} dataKey="contacts" />
        <MetricChart title="New deals" icon={Handshake} value={fmtNum(totals.newDeals)} color="#4f46e5" data={report.byDate} dataKey="deals" />
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Deals won" value={fmtNum(totals.wonDeals)} />
        <Stat label="Won revenue" value={money(totals.wonRevenue, currency)} />
        <Stat label="Win rate" value={totals.newDeals > 0 ? `${((totals.wonDeals / totals.newDeals) * 100).toFixed(0)}%` : "—"} />
        <Stat label="Avg won deal" value={totals.wonDeals > 0 ? money(totals.wonRevenue / totals.wonDeals, currency) : "—"} />
      </div>

      {report.topDeals.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Trophy size={15} className="text-ink-400" /> Largest new deals
            </CardTitle>
          </CardHeader>
          <CardContent>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-ink-400">
                  <th className="pb-2 font-medium">Deal</th>
                  <th className="pb-2 text-right font-medium">Amount</th>
                  <th className="pb-2 text-right font-medium">Created</th>
                </tr>
              </thead>
              <tbody>
                {report.topDeals.map((d) => (
                  <tr key={`${d.name}-${d.createdAt}`} className="border-t border-slate-100">
                    <td className="max-w-0 truncate py-2 pr-3 text-ink-800" title={d.name}>{d.name}</td>
                    <td className="py-2 text-right text-ink-600">{d.amount > 0 ? money(d.amount, currency) : "—"}</td>
                    <td className="py-2 text-right text-ink-600">{d.createdAt}</td>
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
