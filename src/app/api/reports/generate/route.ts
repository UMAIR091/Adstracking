import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserAndAgency } from "@/lib/agency";
import { generateReportInsights } from "@/lib/ai";
import type { GscReportFull, Ga4ReportFull } from "@/lib/google";
import {
  assembleReport, isGscEmpty, isGa4Empty, isReportEmpty, reportPeriod, toInsightsInput,
} from "@/lib/report";

export const runtime = "nodejs";

function isoDaysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

// Generates a unified report from Search Console + GA4 data already cached in
// the database by the background sync. No live Google API calls happen here.
// Works with either or both sources connected.
export async function POST(req: Request) {
  const { user, agency } = await getCurrentUserAndAgency();
  if (!user || !agency) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const clientId: string = body?.clientId;
  const templateKey: string = body?.templateKey || "seo";
  const periodDays: number = [28, 90].includes(body?.periodDays) ? body.periodDays : 28;
  if (!clientId) return NextResponse.json({ error: "clientId required" }, { status: 400 });

  const supabase = createClient();

  const { data: client } = await supabase.from("clients").select("id, name").eq("id", clientId).maybeSingle();
  if (!client) return NextResponse.json({ error: "Client not found" }, { status: 404 });

  const { data: sources } = await supabase
    .from("data_sources")
    .select("id, type, config")
    .eq("client_id", clientId)
    .in("type", ["gsc", "ga4"]);

  const gscDs = sources?.find((s) => s.type === "gsc");
  const ga4Ds = sources?.find((s) => s.type === "ga4");
  const gscReady = Boolean((gscDs?.config as { site_url?: string } | undefined)?.site_url);
  const ga4Ready = Boolean((ga4Ds?.config as { property_id?: string } | undefined)?.property_id);

  if (!gscReady && !ga4Ready) {
    return NextResponse.json(
      { error: "Connect Search Console or Google Analytics for this client first." },
      { status: 400 }
    );
  }

  // Read the cached snapshots for the requested period — RLS scopes them to the
  // signed-in user's agency. No Google call.
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
    return NextResponse.json(
      { error: "No analytics data is available yet. Click “Refresh now” on the client's data source, then generate the report." },
      { status: 400 }
    );
  }

  const { data: template } = await supabase
    .from("report_templates").select("name, sections").eq("key", templateKey).is("agency_id", null).maybeSingle();

  const unified = assembleReport(gscData, ga4Data, null);

  // Optional AI insights — calls Anthropic, not Google, and never blocks.
  const insights = await generateReportInsights(
    toInsightsInput(unified, client.name, `the last ${periodDays} days`)
  );

  const data = assembleReport(gscData, ga4Data, insights);
  const period = reportPeriod({ gsc: gscData, ga4: ga4Data }, { start: isoDaysAgo(periodDays + 2), end: isoDaysAgo(2) });
  const shareToken = crypto.randomBytes(16).toString("hex");

  const { data: report, error } = await supabase
    .from("reports")
    .insert({
      agency_id: agency.id,
      client_id: clientId,
      template_key: templateKey,
      title: `${client.name} — ${template?.name ?? "Performance Report"}`,
      status: "ready",
      period_start: period.start,
      period_end: period.end,
      data,
      sections: template?.sections ?? [],
      share_token: shareToken,
    })
    .select("id")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, id: report.id });
}
