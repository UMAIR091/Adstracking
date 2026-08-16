// What KIND of report this is, and what to call it.
//
// Every generated report used to be titled from the "seo" template because that
// was the default and nothing inferred anything better — a client running only
// Meta and TikTok ads still received an "SEO Report". The type is derived from
// the sources that actually feed the report, and the user can override it.
//
// Stored in reports.data.meta (jsonb) alongside the period metadata rather than
// in a new column, so this needs no migration and older reports simply report
// an unknown type.
import { groupForIntegration, type MetricGroup } from "@/lib/integrations/analyticsViews";
import { getIntegrationName } from "@/lib/integrations/names";

export type ReportType = "seo" | "paid" | "analytics" | "cross_channel" | "custom";

export const REPORT_TYPES: { id: ReportType; label: string; description: string }[] = [
  { id: "seo", label: "SEO", description: "Organic search visibility, keywords and landing pages." },
  { id: "paid", label: "Paid Media", description: "Ad spend, clicks, conversions and return across platforms." },
  { id: "analytics", label: "Website Analytics", description: "Traffic, engagement and on-site conversions." },
  { id: "cross_channel", label: "Cross-Channel", description: "Every connected channel in one report." },
  { id: "custom", label: "Custom", description: "A mix that doesn't fit the standard shapes." },
];

const LABELS: Record<ReportType, string> = {
  seo: "SEO",
  paid: "Paid Media",
  analytics: "Website Analytics",
  cross_channel: "Cross-Channel",
  custom: "Custom",
};

export function reportTypeLabel(type: string | null | undefined): string | null {
  return type && type in LABELS ? LABELS[type as ReportType] : null;
}

export function isReportType(v: unknown): v is ReportType {
  return typeof v === "string" && v in LABELS;
}

/**
 * The default type for a set of connected sources.
 *
 * One metric family means the report is about that family. More than one means
 * it genuinely spans channels. "custom" is never inferred — it exists only as a
 * deliberate user choice, so an inferred value always describes the data.
 */
export function inferReportType(sourceIds: string[]): ReportType {
  // Plain array rather than a Set spread — this file is compiled for the
  // browser too and the project targets ES5 downlevel iteration.
  const families: MetricGroup[] = [];
  for (const id of sourceIds) {
    const g = groupForIntegration(id);
    if (g !== "other" && !families.includes(g)) families.push(g);
  }

  if (families.length === 0) return "custom";
  if (families.length > 1) return "cross_channel";

  const only = families[0];
  if (only === "seo") return "seo";
  if (only === "paid") return "paid";
  if (only === "analytics") return "analytics";
  // A single non-standard family (commerce, email, calls…) is still a report
  // about one channel, but none of the named shapes fit it.
  return "custom";
}

/**
 * A professional default title: client, what kind of report it is, and the
 * window it covers. Fully editable by the user — this is only the suggestion.
 *
 * "Acme Running Co — Paid Media Report · Jul–Aug 2026"
 */
export function suggestReportTitle(input: {
  clientName: string;
  type: ReportType;
  periodLabel?: string | null;
}): string {
  const base = `${input.clientName} — ${LABELS[input.type]} Report`;
  return input.periodLabel ? `${base} · ${input.periodLabel}` : base;
}

/** Display names for the sources feeding a report, in a stable order. */
export function sourceNames(sourceIds: string[]): string[] {
  return sourceIds.map(getIntegrationName);
}
