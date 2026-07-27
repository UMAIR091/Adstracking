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

// A single Performance Overview metric.
//
// Four layers, in deliberate reading order: what it is (icon + label), the
// number, how it moved (trend chip + comparison line), and the shape of that
// movement (sparkline). The comparison line matters — a bare "+12%" doesn't
// say against what, which is the first thing anyone asks.
//
// Trend arrow follows the direction of change; the colour follows whether that
// change is good, which is not the same thing (for avg position, lower wins).
export function PerfKpiCard({
  label,
  value,
  deltaPct,
  good,
  color,
  data,
  icon,
  comparison,
  explanation,
}: {
  label: string;
  value: string;
  deltaPct: number | null;
  good: boolean;
  color: string;
  data: number[];
  icon: string;
  /** What the delta is measured against, e.g. "vs previous 14 days". */
  comparison?: string;
  /** Plain-English meaning of the metric, for anyone who isn't an SEO. */
  explanation?: string;
}) {
  const Icon = ICONS[icon] ?? MousePointerClick;
  const id = "spark-" + label.replace(/\W/g, "");
  const chart = data.map((v, i) => ({ i, v }));
  const up = (deltaPct ?? 0) >= 0;

  return (
    <Card className="h-full transition-shadow hover:shadow-md">
      <CardContent className="flex h-full flex-col p-5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span
              className="flex h-7 w-7 items-center justify-center rounded-lg"
              style={{ backgroundColor: `${color}14`, color }}
            >
              <Icon size={15} aria-hidden />
            </span>
            <span className="text-sm font-medium text-ink-700">{label}</span>
          </div>
          {deltaPct !== null && (
            <span
              className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-xs font-semibold tabular-nums ${
                good ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-600"
              }`}
            >
              {up ? <ArrowUpRight size={12} aria-hidden /> : <ArrowDownRight size={12} aria-hidden />}
              {Math.abs(deltaPct).toFixed(0)}%
            </span>
          )}
        </div>

        <p className="mt-3 text-3xl font-semibold leading-none tracking-tight text-ink-900 tabular-nums">{value}</p>

        {/* Anchors the percentage to a baseline, or says plainly that there
            isn't enough history yet rather than leaving a gap. */}
        <p className="mt-1.5 text-xs text-ink-500">
          {deltaPct !== null && comparison ? comparison : "Not enough history to compare yet"}
        </p>

        {chart.length > 1 && (
          <div className="mt-3 h-10">
            <Sparkline id={id} color={color} data={chart} />
          </div>
        )}

        {explanation && (
          <p className="mt-3 border-t border-ink-100 pt-3 text-xs leading-relaxed text-ink-500">{explanation}</p>
        )}
      </CardContent>
    </Card>
  );
}
