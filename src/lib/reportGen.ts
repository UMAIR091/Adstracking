// Report generation core, extracted so both the manual "Generate report" route
// and the scheduled-delivery cron can create reports the same way. Builds a
// unified GSC + GA4 report purely from cached snapshots — no live Google calls.
import crypto from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { generateReportInsightsCached } from "@/lib/ai";
import { trackUsage } from "@/lib/usage";
import { checkReportLimit } from "@/lib/billing/limits";
import type { GscReportFull, Ga4ReportFull } from "@/lib/google";
import { assembleReport, isGscEmpty, isGa4Empty, isReportEmpty, reportPeriod, toInsightsInput, type ReportData } from "@/lib/report";

function isoDaysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

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
  opts: { templateKey?: string; periodDays?: number } = {}
): Promise<CreateReportResult> {
  const templateKey = opts.templateKey || "seo";
  const periodDays = [28, 90].includes(opts.periodDays as number) ? (opts.periodDays as number) : 28;

  const { data: client } = await supabase
    .from("clients").select("id, name").eq("id", clientId).eq("agency_id", agencyId).maybeSingle();
  if (!client) return { ok: false, status: 404, error: "Client not found" };

  // Report cap (only the trial sets one — paid plans return allowed immediately).
  const reportLimit = await checkReportLimit(supabase, agencyId);
  if (!reportLimit.allowed) return { ok: false, status: 402, error: reportLimit.reason ?? "Report limit reached." };

  const { data: sources } = await supabase
    .from("data_sources").select("id, type, config").eq("client_id", clientId).in("type", ["gsc", "ga4"]);
  const gscDs = sources?.find((s) => s.type === "gsc");
  const ga4Ds = sources?.find((s) => s.type === "ga4");
  const gscReady = Boolean((gscDs?.config as { site_url?: string } | undefined)?.site_url);
  const ga4Ready = Boolean((ga4Ds?.config as { property_id?: string } | undefined)?.property_id);
  if (!gscReady && !ga4Ready) {
    return { ok: false, status: 400, error: "Connect Search Console or Google Analytics for this client first." };
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

  if (isReportEmpty({ gsc: gscData, ga4: ga4Data })) {
    return { ok: false, status: 400, error: "No analytics data is available yet. Click “Refresh now” on the client's data source, then generate the report." };
  }

  const { data: template } = await supabase
    .from("report_templates").select("name, sections").eq("key", templateKey).is("agency_id", null).maybeSingle();

  const unified = assembleReport(gscData, ga4Data, null);
  const { insights, cached } = await generateReportInsightsCached(toInsightsInput(unified, client.name, `the last ${periodDays} days`));
  // Meter AI usage only when the model actually ran (a cache hit costs nothing).
  if (insights && !cached) await trackUsage(agencyId, "ai_summaries");
  const data = assembleReport(gscData, ga4Data, insights);
  const period = reportPeriod({ gsc: gscData, ga4: ga4Data }, { start: isoDaysAgo(periodDays + 2), end: isoDaysAgo(2) });
  const title = `${client.name} — ${template?.name ?? "Performance Report"}`;
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
