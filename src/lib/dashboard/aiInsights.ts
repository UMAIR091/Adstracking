// The AI-written insights Home shows: per client, the analysis the AI system
// (lib/ai) wrote from that client's own synced data when its latest report was
// generated. Nothing here calls the model; it reads what was generated and
// stored with each report, so every block is one client's, from one report,
// with the platforms that report was built from. Clients are never merged.
import { sourceNames } from "@/lib/reports/types";

type JoinedClient =
  | { name: string | null; archived?: boolean | null }
  | { name: string | null; archived?: boolean | null }[]
  | null;

/** One reports row, selected with only the insight fields Home needs. */
export type InsightReportRow = {
  id: string;
  title: string;
  client_id: string | null;
  created_at: string;
  period_start: string | null;
  period_end: string | null;
  summary: string | null;
  actions: string[] | null;
  issues: string[] | null;
  source_ids: string[] | null;
  clients: JoinedClient;
};

/** The select that produces InsightReportRow (data is jsonb; paths keep the payload small). */
export const INSIGHT_REPORT_SELECT =
  "id, title, client_id, created_at, period_start, period_end, " +
  "summary:data->insights->>executiveSummary, actions:data->insights->recommendedActions, " +
  "issues:data->insights->issuesDetected, source_ids:data->meta->sourceIds, clients(name, archived)";

export type ClientAiInsight = {
  clientId: string;
  clientName: string;
  reportId: string;
  reportTitle: string;
  generatedAt: string;
  periodStart: string | null;
  periodEnd: string | null;
  /** Display names of the platforms the report (and so the analysis) used. */
  platforms: string[];
  summary: string;
  /** The model's first recommended action, when it gave one. */
  nextStep: string | null;
  /** The first issue it detected, when there was one. */
  issue: string | null;
};

const joined = (c: JoinedClient) => (Array.isArray(c) ? c[0] : c) ?? null;
const first = (list: unknown) =>
  (Array.isArray(list) ? list : []).filter((s): s is string => typeof s === "string").map((s) => s.trim()).find(Boolean) ?? null;

/**
 * One block per client: the newest report that carries AI insights.
 * `rows` must be newest first. Archived clients are left out.
 */
export function latestInsightsPerClient(rows: InsightReportRow[], max = 4): ClientAiInsight[] {
  const seen = new Set<string>();
  const out: ClientAiInsight[] = [];
  for (const r of rows) {
    if (!r.client_id || seen.has(r.client_id)) continue;
    const client = joined(r.clients);
    if (client?.archived) continue;
    const summary = typeof r.summary === "string" ? r.summary.trim() : "";
    if (!summary) continue;
    seen.add(r.client_id);
    out.push({
      clientId: r.client_id,
      clientName: client?.name ?? "Client",
      reportId: r.id,
      reportTitle: r.title,
      generatedAt: r.created_at,
      periodStart: r.period_start,
      periodEnd: r.period_end,
      platforms: Array.isArray(r.source_ids) && r.source_ids.length ? sourceNames(r.source_ids) : [],
      summary,
      nextStep: first(r.actions),
      issue: first(r.issues),
    });
    if (out.length >= max) break;
  }
  return out;
}

/** A Search Console property as people say it: "sc-domain:acme.com" → "acme.com". */
export function siteLabel(siteUrl: string | null | undefined): string | null {
  if (!siteUrl) return null;
  const s = siteUrl.trim();
  if (s.startsWith("sc-domain:")) return s.slice("sc-domain:".length);
  return s.replace(/^https?:\/\//, "").replace(/\/$/, "");
}
