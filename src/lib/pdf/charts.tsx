// Native vector charts for the PDF (no headless browser, no canvas). SVG draws
// the marks; axis labels are regular react-pdf Text views overlaid around the
// plot so typography stays consistent and crisp at any zoom / print size.
import React from "react";
import { View, Text, Svg, Path, Line, Circle, Defs, LinearGradient, Stop } from "@react-pdf/renderer";
import { ink, type S } from "./theme";
import { compact, fmt, fmtDateShort } from "./format";

const AXIS_W = 30; // y-axis label gutter
const TICKS = 4; // horizontal gridlines

const tickStyle = { fontSize: 6.2, color: ink[400] } as const;

// Catmull-Rom → cubic bezier: renders the daily series as a smooth curve
// instead of a jagged polyline, like a BI dashboard.
function smoothPath(coords: readonly (readonly [number, number])[]): string {
  if (coords.length < 3) {
    return `M${coords.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" L")}`;
  }
  const p = (i: number) => coords[Math.max(0, Math.min(coords.length - 1, i))];
  let d = `M${coords[0][0].toFixed(1)},${coords[0][1].toFixed(1)}`;
  for (let i = 0; i < coords.length - 1; i++) {
    const [x0, y0] = p(i - 1);
    const [x1, y1] = p(i);
    const [x2, y2] = p(i + 1);
    const [x3, y3] = p(i + 2);
    const c1x = x1 + (x2 - x0) / 6;
    const c1y = y1 + (y2 - y0) / 6;
    const c2x = x2 - (x3 - x1) / 6;
    const c2y = y2 - (y3 - y1) / 6;
    d += ` C${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${x2.toFixed(1)},${y2.toFixed(1)}`;
  }
  return d;
}

// ── Line / area trend chart ──────────────────────────────────────────────────
// `reversed` flips the axis for rank-style metrics where lower is better
// (e.g. average position), so an improving line still points up.
export function LineChart({ id, values, dates, color, width = 210, height = 74, reversed = false }: {
  id: string;
  values: number[];
  dates?: string[];
  color: string;
  width?: number;
  height?: number;
  reversed?: boolean;
}): React.ReactElement {
  if (values.length < 2) return <View style={{ height }} />;
  const plotW = width - AXIS_W;
  const plotH = height;

  const rawMin = Math.min(...values);
  const rawMax = Math.max(...values);
  const pad = (rawMax - rawMin || Math.abs(rawMax) || 1) * 0.08;
  const lo = reversed ? Math.max(0, rawMin - pad) : Math.max(0, Math.min(rawMin - pad, rawMin));
  const hi = rawMax + pad;
  const range = hi - lo || 1;

  const stepX = plotW / (values.length - 1);
  const y = (v: number) => {
    const t = (v - lo) / range;
    return reversed ? t * (plotH - 10) + 5 : plotH - 5 - t * (plotH - 10);
  };
  const coords = values.map((v, i) => [i * stepX, y(v)] as const);
  const curve = smoothPath(coords);
  const area = `${curve} L${plotW},${plotH} L0,${plotH} Z`;
  const [lastX, lastY] = coords[coords.length - 1];

  // Tick values top → bottom (reversed axis shows best value on top).
  const ticks = Array.from({ length: TICKS }, (_, i) => {
    const t = i / (TICKS - 1);
    return reversed ? lo + range * t : hi - range * t;
  });

  const first = dates && dates.length > 0 ? dates[0] : undefined;
  const last = dates && dates.length > 0 ? dates[dates.length - 1] : undefined;
  const mid = dates && dates.length > 2 ? dates[Math.floor((dates.length - 1) / 2)] : undefined;

  return (
    <View style={{ width }}>
      <View style={{ flexDirection: "row" }}>
        <View style={{ width: AXIS_W, height: plotH, justifyContent: "space-between", paddingRight: 5 }}>
          {ticks.map((t, i) => (
            <Text key={i} style={{ ...tickStyle, textAlign: "right" }}>{compact(t)}</Text>
          ))}
        </View>
        <Svg width={plotW} height={plotH}>
          <Defs>
            <LinearGradient id={`grad-${id}`} x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={color} stopOpacity={0.22} />
              <Stop offset="1" stopColor={color} stopOpacity={0.02} />
            </LinearGradient>
          </Defs>
          {ticks.map((_, i) => {
            const gy = (plotH - 10) * (i / (TICKS - 1)) + 5;
            return <Line key={i} x1={0} y1={gy} x2={plotW} y2={gy} stroke="#f4f7fa" strokeWidth={0.6} />;
          })}
          <Path d={area} fill={`url(#grad-${id})`} />
          <Path d={curve} fill="none" stroke={color} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" />
          <Circle cx={lastX} cy={lastY} r={2.6} fill={color} stroke="#ffffff" strokeWidth={1} />
        </Svg>
      </View>
      {first && last ? (
        <View style={{ flexDirection: "row", justifyContent: "space-between", marginLeft: AXIS_W, marginTop: 5 }}>
          <Text style={tickStyle}>{fmtDateShort(first)}</Text>
          {mid && mid !== first && mid !== last ? <Text style={tickStyle}>{fmtDateShort(mid)}</Text> : <Text />}
          <Text style={tickStyle}>{fmtDateShort(last)}</Text>
        </View>
      ) : null}
    </View>
  );
}

// ── Labeled horizontal bars (ranked lists like traffic sources) ──────────────
export function BarList({ rows, color, s, maxRows = 6 }: {
  rows: { label: string; value: number }[];
  color: string;
  s: S;
  maxRows?: number;
}) {
  const top = rows.slice(0, maxRows);
  const max = Math.max(...top.map((r) => r.value), 1);
  return (
    <View>
      {top.map((r, i) => (
        <View key={`${r.label}-${i}`} style={s.barRow} wrap={false}>
          <Text style={s.barLabel}>{r.label.length > 17 ? `${r.label.slice(0, 16)}…` : r.label}</Text>
          <View style={s.barTrack}>
            <View style={[s.barFill, { width: `${Math.max(2, (r.value / max) * 100)}%`, backgroundColor: color }]} />
          </View>
          <Text style={s.barValue}>{fmt(r.value)}</Text>
        </View>
      ))}
    </View>
  );
}

// ── Stacked 100% composition bar with legend (device / channel mix) ──────────
export function ShareBar({ segments, colors, s }: {
  segments: { label: string; value: number }[];
  colors: string[];
  s: S;
}) {
  const total = segments.reduce((a, b) => a + b.value, 0) || 1;
  return (
    <View>
      <View style={s.shareTrack}>
        {segments.map((seg, i) => (
          <View key={seg.label} style={{ width: `${(seg.value / total) * 100}%`, backgroundColor: colors[i % colors.length] }} />
        ))}
      </View>
      <View style={s.legendRow}>
        {segments.map((seg, i) => (
          <View key={seg.label} style={s.legendItem}>
            <View style={[s.legendSwatch, { backgroundColor: colors[i % colors.length] }]} />
            <Text style={s.legendText}>
              {seg.label}  {((seg.value / total) * 100).toFixed(0)}%
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}
