// Small trend line drawn as plain SVG on the server: no chart library, no
// client JS. For KPI tiles and the Home performance card. Colour follows
// `currentColor`, so set it with a text class (the app uses text-brand-500).
// Renders nothing with fewer than two points: a line needs a trend.

function points(values: number[], w: number, h: number, pad: number): string[] {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  return values.map((v, i) => {
    const x = (i / (values.length - 1)) * w;
    const y = h - pad - ((v - min) / span) * (h - pad * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
}

export function MiniSpark({
  values,
  width = 56,
  height = 22,
  area = false,
  className = "text-brand-500",
}: {
  values: number[];
  width?: number;
  height?: number;
  /** Fill under the line at 10% (the larger Home card). */
  area?: boolean;
  className?: string;
}) {
  const clean = values.filter((v) => Number.isFinite(v));
  if (clean.length < 2) return null;
  const pts = points(clean, width, height, area ? 4 : 2);
  const line = `M${pts.join(" L")}`;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden className={`shrink-0 ${className}`}>
      {area && <path d={`${line} L${width},${height} L0,${height} Z`} fill="currentColor" fillOpacity={0.1} />}
      <path d={line} fill="none" stroke="currentColor" strokeWidth={area ? 2 : 1.8} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
