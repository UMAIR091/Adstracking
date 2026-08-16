// Chart palette, resolved from the theme tokens in globals.css.
//
// Chart components previously hard-coded hex values (#4f46e5, #0ea5e9, …),
// which meant every chart kept its light-mode colours on a charcoal background
// and the tooltip painted a white box with a light-grey border. These are
// `var()` references instead: recharts passes them straight through to SVG
// presentation attributes, where custom properties resolve normally, so the
// same series re-colours with the theme.
//
// The series are ordered for distinguishability, not by hue family — adjacent
// series in a chart should never be neighbouring hues.

export const CHART = {
  /** Primary accent — the default first series. */
  indigo: "rgb(var(--chart-1))",
  sky: "rgb(var(--chart-2))",
  emerald: "rgb(var(--chart-3))",
  amber: "rgb(var(--chart-4))",
  violet: "rgb(var(--chart-5))",
  grey: "rgb(var(--chart-6))",
  /** Reserved for genuinely negative series (churn, failures). */
  red: "rgb(var(--danger-500))",
} as const;

/** Ordered series palette for charts that colour by index. */
export const CHART_SERIES = [CHART.indigo, CHART.sky, CHART.emerald, CHART.amber, CHART.violet, CHART.grey];

/** Axis / gridline styling shared by every chart. */
export const AXIS_COLOR = "rgb(var(--ink-400))";
export const GRID_COLOR = "rgb(var(--ink-200))";

/**
 * Recharts `<Tooltip contentStyle>`. Themed surface, themed border, and a
 * shadow light enough to read on both backgrounds.
 */
export const chartTooltipStyle: React.CSSProperties = {
  borderRadius: 10,
  border: "1px solid rgb(var(--ink-200))",
  background: "rgb(var(--surface))",
  color: "rgb(var(--ink-900))",
  fontSize: 12,
  boxShadow: "0 8px 20px -6px rgb(16 24 40 / 0.12)",
};

/** Matching label style — recharts styles the label separately from the box. */
export const chartTooltipLabelStyle: React.CSSProperties = {
  color: "rgb(var(--ink-500))",
  fontSize: 11,
  marginBottom: 2,
};
