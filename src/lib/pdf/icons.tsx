// Vector micro-icons for the PDF (lucide-style 24×24 stroke paths, scaled at
// render time). Drawn as SVG so they stay crisp in print and avoid the
// WinAnsi-encoding problems of glyph characters (▲ ✓ 💡 etc. corrupt in the
// built-in Helvetica fonts).
import React from "react";
import { Svg, Path, Circle, Polyline } from "@react-pdf/renderer";

// Each icon: stroke paths in a 24×24 viewBox (no fills).
const PATHS: Record<string, { d?: string[]; circles?: [number, number, number][]; polylines?: string[] }> = {
  clicks: { d: ["M4 4l7.5 16.5 2.2-6.8 6.8-2.2L4 4z"] },
  eye: { d: ["M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"], circles: [[12, 12, 3]] },
  percent: { d: ["M19 5L5 19"], circles: [[6.5, 6.5, 2.3], [17.5, 17.5, 2.3]] },
  target: { circles: [[12, 12, 9], [12, 12, 5], [12, 12, 1.2]] },
  users: { d: ["M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"], circles: [[12, 7, 4]] },
  activity: { polylines: ["22,12 18,12 15,21 9,3 6,12 2,12"] },
  zap: { d: ["M13 2L3 14h9l-1 8 10-12h-9l1-8z"] },
  check: { polylines: ["20,6 9,17 4,12"] },
  checkCircle: { circles: [[12, 12, 10]], polylines: ["16,9 11,15 8,12"] },
  dollar: { d: ["M12 2v20", "M17 6H9.5a3.2 3.2 0 000 6.4h5a3.2 3.2 0 010 6.4H6"] },
  file: { d: ["M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6z", "M14 2v6h6"] },
  userPlus: { d: ["M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2", "M19 8v6", "M22 11h-6"], circles: [[9, 7, 4]] },
  alert: { d: ["M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z", "M12 9v4", "M12 17v.5"] },
  bulb: { d: ["M9 18h6", "M10 21.5h4", "M12 2.5a7 7 0 00-4.2 12.6c.8.6 1.2 1.5 1.2 2.4V18h6v-.5c0-.9.4-1.8 1.2-2.4A7 7 0 0012 2.5z"] },
  compass: { circles: [[12, 12, 10]], d: ["M16 8l-2.5 5.5L8 16l2.5-5.5L16 8z"] },
  trendUp: { polylines: ["2,17 9,10 13,14 22,5", "16,5 22,5 22,11"] },
  chart: { d: ["M3 3v18h18", "M8 16v-5", "M13 16V8", "M18 16v-9"] },
  globe: { circles: [[12, 12, 10]], d: ["M2 12h20", "M12 2a15 15 0 010 20", "M12 2a15 15 0 000 20"] },
  arrowRight: { d: ["M4 12h16", "M13 5l7 7-7 7"] },
};

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 10, color, strokeWidth = 2 }: { name: string; size?: number; color: string; strokeWidth?: number }) {
  const def = PATHS[name] ?? PATHS.chart;
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {(def.d ?? []).map((d, i) => (
        <Path key={`d${i}`} d={d} stroke={color} strokeWidth={strokeWidth} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      ))}
      {(def.circles ?? []).map(([cx, cy, r], i) => (
        <Circle key={`c${i}`} cx={cx} cy={cy} r={r} stroke={color} strokeWidth={strokeWidth} fill="none" />
      ))}
      {(def.polylines ?? []).map((p, i) => (
        <Polyline key={`p${i}`} points={p} stroke={color} strokeWidth={strokeWidth} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      ))}
    </Svg>
  );
}

// Small solid up/down triangle used as a trend indicator next to KPI deltas.
export function TrendArrow({ dir, color, size = 6 }: { dir: "up" | "down"; color: string; size?: number }) {
  const d = dir === "up" ? `M${size / 2},0 L${size},${size} L0,${size} Z` : `M0,0 L${size},0 L${size / 2},${size} Z`;
  return (
    <Svg width={size} height={size}>
      <Path d={d} fill={color} />
    </Svg>
  );
}

// Circular progress gauge for the 0–100 performance score. Drawn as an arc
// path (no dasharray tricks — maximum engine compatibility).
export function Gauge({ score, size = 86, color, track, children }: {
  score: number;
  size?: number;
  color: string;
  track: string;
  children?: React.ReactNode;
}) {
  const c = size / 2;
  const r = c - 5;
  const clamped = Math.max(0, Math.min(100, score));
  // Arc from 12 o'clock, clockwise, clamped just under a full circle.
  const sweep = Math.min(clamped / 100, 0.9999) * Math.PI * 2;
  const x = c + r * Math.sin(sweep);
  const y = c - r * Math.cos(sweep);
  const large = sweep > Math.PI ? 1 : 0;
  return (
    <Svg width={size} height={size}>
      <Circle cx={c} cy={c} r={r} stroke={track} strokeWidth={7} fill="none" />
      {clamped > 0.5 ? (
        <Path d={`M${c},${c - r} A${r},${r} 0 ${large} 1 ${x.toFixed(2)},${y.toFixed(2)}`} stroke={color} strokeWidth={7} fill="none" strokeLinecap="round" />
      ) : null}
      {children}
    </Svg>
  );
}
