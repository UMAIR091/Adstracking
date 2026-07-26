"use client";

// The recharts sparkline extracted from PerfKpiCard so it can be lazy-loaded
// (perf audit — complete chart lazy-loading). The KPI number/label/trend stay
// server-rendered and paint immediately; only this decorative chart's recharts
// code is deferred, keeping recharts out of the dashboard's initial bundle.
import { Area, AreaChart, ResponsiveContainer } from "recharts";

export function Sparkline({ id, color, data }: { id: string; color: string; data: { i: number; v: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.3} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <Area type="monotone" dataKey="v" stroke={color} strokeWidth={1.8} fill={`url(#${id})`} />
      </AreaChart>
    </ResponsiveContainer>
  );
}
