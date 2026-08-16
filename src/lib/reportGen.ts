// Report generation core, extracted so both the manual "Generate report" route
// and the scheduled-delivery cron can create reports the same way. Builds a
// unified GSC + GA4 report purely from cached snapshots — no live Google calls.
import crypto from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { generateReportInsightsCached } from "@/lib/ai";
import { trackUsage } from "@/lib/usage";
import { checkReportLimit } from "@/lib/billing/limits";
import type { GscReportFull, Ga4ReportFull } from "@/lib/google";
import { snapshotsToBlocks, type ReportBlock } from "@/lib/integrations/blocks";
import { inferReportType, isReportType, suggestReportTitle, type ReportType } from "@/lib/reports/types";
import { assembleReport, isGscEmpty, isGa4Empty, isReportEmpty, canonicalPeriod, dataCoverage, periodLabel, toInsightsInput, type ReportData } from "@/lib/report";

export type CreateReportResult =
  | { ok: true; id: string; shareToken: string; title: string; data: ReportData; period: { start: string; end: string } }
  | { ok: false; status: number; error: string };

// Creates and stores one report for a client. `supabase` may be a user client
// (RLS-scoped) or the admin client (cron) — queries are scoped by agency/client
// explicitly so both are safe.
export async function createClientReport(
  supabase: SupabaseClient,
  agencyId: string,
  clientId: string,
  opts: { templateKey?: string; periodDays?: number; title?: string; reportType?: string } = {}
): Promise<CreateReportResult> {
  const templateKey = opts.templateKey || "seo";
  const periodDays = [28, 90].includes(opts.periodDays as number) ? (opts.periodDays as number) : 28;

  const { data: client } = await supabase
    .from("clients").select("id, name").eq("id", clientId).eq("agency_id", agencyId).maybeSingle();
  if (!client) return { ok: false, status: 404, error: "Client not found" };

  // Report cap (only the trial sets one — paid plans return allowed immediately).
  const reportLimit = await checkReportLimit(supabase, agencyId);
  if (!reportLimit.allowed) return { ok: false, status: 402, error: reportLimit.reason ?? "Report limit reached." };

  // Load EVERY connected source, not just the Google pair. Search Console and
  // GA4 keep their own snapshot tables and bespoke rich sections; every other
  // integration is read from integration_snapshots and projected into neutral
  // blocks, so adding an integration needs no change here.
  const { data: sources } = await supabase
    .from("data_sources").select("id, type, config").eq("client_id", clientId);
  const gscDs = sources?.find((s) => s.type === "gsc");
  const ga4Ds = sources?.find((s) => s.type === "ga4");
  const gscReady = Boolean((gscDs?.config as { site_url?: string } | undefined)?.site_url);
  const ga4Ready = Boolean((ga4Ds?.config as { property_id?: string } | undefined)?.property_id);
  const otherSources = (sources ?? []).filter((s) => s.type !== "gsc" && s.type !== "ga4");

  if (!gscReady && !ga4Ready && otherSources.length === 0) {
    return { ok: false, status: 400, error: "Connect at least one data source for this client first." };
  }

  let gscData: GscReportFull | null = null;
  if (gscReady && gscDs) {
    const { data: snap } = await supabase
      .from("gsc_snapshots").select("data").eq("data_source_id", gscDs.id).eq("period_days", periodDays).maybeSingle();
    const s = (snap?.data as GscReportFull | undefined) ?? null;
    gscData = isGscEmpty(s) ? null : s;
  }

  let ga4Data: Ga4ReportFull | null = null;
  if (ga4Ready && ga4Ds) {
    const { data: snap } = await supabase
      .from("ga4_snapshots").select("data").eq("data_source_id", ga4Ds.id).eq("period_days", periodDays).maybeSingle();
    const s = (snap?.data as Ga4ReportFull | undefined) ?? null;
    ga4Data = isGa4Empty(s) ? null : s;
  }

  // Every non-Google source, projected into blocks. One query for all of them.
  let blocks: ReportBlock[] = [];
  if (otherSources.length) {
    const { data: snaps } = await supabase
      .from("integration_snapshots")
      .select("data_source_id, data")
      .in("data_source_id", otherSources.map((s) => s.id))
      .eq("period_days", periodDays);
    const byId = new Map((snaps ?? []).map((r) => [r.data_source_id as string, r.data]));
    blocks = snapshotsToBlocks(otherSources.map((s) => ({ type: s.type as string, snapshot: byId.get(s.id as string) })));
  }

  if (isReportEmpty({ gsc: gscData, ga4: ga4Data, blocks })) {
    return { ok: false, status: 400, error: "No analytics data is available yet. Click “Refresh now” on the client's data source, then generate the report." };
  }

  const { data: template } = await supabase
    .from("report_templates").select("name, sections").eq("key", templateKey).is("agency_id", null).maybeSingle();

  // ── One canonical window, from here to the stored row, the PDF and the UI ──
  // The period is what the user asked for. `coverage` records how much real
  // data landed inside it, so a partially-covered report can say so instead of
  // silently relabelling itself as a shorter period.
  const period = canonicalPeriod(periodDays);
  const coverage = dataCoverage({ gsc: gscData, ga4: ga4Data, blocks });

  // Only sources that actually contributed data describe the report. A
  // connected-but-empty source shouldn't make an SEO report look cross-channel.
  const contributing = [
    ...(gscData ? ["gsc"] : []),
    ...(ga4Data ? ["ga4"] : []),
    ...blocks.map((b) => b.sourceId).filter((id): id is string => Boolean(id)),
  ];
  const reportType = isReportType(opts.reportType) ? opts.reportType : inferReportType(contributing);
  const meta = { periodDays, requested: period, coverage, reportType, sourceIds: contributing };

  const unified = assembleReport(gscData, ga4Data, null, blocks, meta);
  // The AI is told the real window, not a generic "last N days" phrase, so its
  // prose can't describe a period the report doesn't cover.
  const { insights, cached } = await generateReportInsightsCached(
    toInsightsInput(unified, client.name, `${period.start} to ${period.end} (${periodDays} days)`)
  );
  // Meter AI usage only when the model actually ran (a cache hit costs nothing).
  if (insights && !cached) await trackUsage(agencyId, "ai_summaries");
  const data = assembleReport(gscData, ga4Data, insights, blocks, meta);

  // Title: the user's own if they edited one, otherwise a suggestion built from
  // the client, the inferred type and the window. The old default came from the
  // template row, which is why a Meta-Ads-only client received an "SEO Report".
  const label = periodLabel(period.start, period.end);
  const suggested = suggestReportTitle({ clientName: client.name, type: reportType, periodLabel: label });
  const title = opts.title?.trim() ? opts.title.trim().slice(0, 200) : suggested;
  const shareToken = crypto.randomBytes(16).toString("hex");

  const { data: report, error } = await supabase
    .from("reports")
    .insert({
      agency_id: agencyId,
      client_id: clientId,
      template_key: templateKey,
      title,
      status: "ready",
      period_start: period.start,
      period_end: period.end,
      data,
      sections: template?.sections ?? [],
      share_token: shareToken,
    })
    .select("id, share_token")
    .single();
  if (error) return { ok: false, status: 400, error: error.message };

  // Meter the generated report (covers both the manual route and the cron).
  await trackUsage(agencyId, "reports_generated");

  return { ok: true, id: report.id, shareToken: report.share_token, title, data, period };
}
