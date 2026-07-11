"use client";

// Generic commerce analytics block (Shopify today; any storefront that fills
// the normalized CommerceReport renders here).
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import { ShoppingBag, Wallet, Package } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { CommerceReport } from "@/lib/integrations/metrics";

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
  title, icon: Icon, value, color, data, dataKey, format,
}: {
  title: string;
  icon: typeof Wallet;
  value: string;
  color: string;
  data: CommerceReport["byDate"];
  dataKey: "orders" | "revenue";
  format: (v: number) => string;
}) {
  const id = `commerce-grad-${dataKey}`;
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

export function CommerceAnalytics({ report }: { report: CommerceReport }) {
  const { totals, currency } = report;
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <MetricChart title="Revenue" icon={Wallet} value={money(totals.revenue, currency)} color="#10b981" data={report.byDate} dataKey="revenue" format={(v) => money(v, currency)} />
        <MetricChart title="Orders" icon={ShoppingBag} value={fmtNum(totals.orders)} color="#4f46e5" data={report.byDate} dataKey="orders" format={fmtNum} />
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Avg order value" value={money(totals.avgOrderValue, currency)} />
        <Stat label="Customers" value={fmtNum(totals.customers)} />
        <Stat label="Orders / day" value={(totals.orders / Math.max(report.byDate.length, 1)).toFixed(1)} />
        <Stat label="Revenue / day" value={money(totals.revenue / Math.max(report.byDate.length, 1), currency)} />
      </div>

      {report.topProducts.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Package size={15} className="text-ink-400" /> Top products by revenue
            </CardTitle>
          </CardHeader>
          <CardContent>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-ink-400">
                  <th className="pb-2 font-medium">Product</th>
                  <th className="pb-2 text-right font-medium">Units</th>
                  <th className="pb-2 text-right font-medium">Revenue</th>
                </tr>
              </thead>
              <tbody>
                {report.topProducts.slice(0, 8).map((p) => (
                  <tr key={p.name} className="border-t border-slate-100">
                    <td className="max-w-0 truncate py-2 pr-3 text-ink-800" title={p.name}>{p.name}</td>
                    <td className="py-2 text-right text-ink-600">{fmtNum(p.quantity)}</td>
                    <td className="py-2 text-right text-ink-600">{money(p.revenue, currency)}</td>
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
