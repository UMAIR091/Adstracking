"use client";

import dynamic from "next/dynamic";
import { ArrowUpRight, ArrowDownRight, MousePointerClick, Eye, Percent, TrendingUp } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

// Lazy sparkline (ssr:false) so recharts loads only when the chart hydrates,
// keeping it out of the dashboard's initial JS. The KPI value paints instantly.
const Sparkline = dynamic(() => import("@/components/Sparkline").then((m) => m.Sparkline), { ssr: false });

// Icons resolved here (client side) — server components can't pass component
// functions across the boundary, so the dashboard passes an icon name instead.
const ICONS: Record<string, LucideIcon> = {
  clicks: MousePointerClick,
  impressions: Eye,
  ctr: Percent,
  position: TrendingUp,
};

// A single Performance Overview metric: value, period-over-period trend chip,
// and a small sparkline. Trend arrow follows the direction of change; the colour
// follows whether that change is good (for avg position, lower is better).
export function PerfKpiCard({
  label,
  value,
  deltaPct,
  good,
  color,
  data,
  icon,
}: {
  label: string;
  value: string;
  deltaPct: number | null;
  good: boolean;
  color: string;
  data: number[];
  icon: string;
}) {
  const Icon = ICONS[icon] ?? MousePointerClick;
  const id = "spark-" + label.replace(/\W/g, "");
  const chart = data.map((v, i) => ({ i, v }));
  const up = (deltaPct ?? 0) >= 0;

  return (
    <Card className="transition-shadow hover:shadow-md">
      <CardContent className="p-5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-ink-500">
            <Icon size={15} style={{ color }} />
            <span className="text-sm">{label}</span>
          </div>
          {deltaPct !== null && (
            <span className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-xs font-medium ${good ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-500"}`}>
              {up ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
              {Math.abs(deltaPct).toFixed(0)}%
            </span>
          )}
        </div>
        <p className="mt-2 text-2xl font-semibold text-ink-900">{value}</p>
        {chart.length > 1 && (
          <div className="mt-2 h-10">
            <Sparkline id={id} color={color} data={chart} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
