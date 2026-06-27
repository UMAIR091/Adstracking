import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserAndAgency } from "@/lib/agency";
import { generateReportInsights } from "@/lib/ai";
import { assembleReport, isSnapshotEmpty, reportPeriod, type ReportSnapshot } from "@/lib/report";

export const runtime = "nodejs";

function isoDaysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

// Generates a report entirely from Search Console data already cached in
// gsc_snapshots by the background sync. No live Google API calls happen here —
// the snapshot already carries period-over-period totals and query movers.
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

  const { data: ds } = await supabase
    .from("data_sources")
    .select("id, config")
    .eq("client_id", clientId)
    .eq("type", "gsc")
    .maybeSingle();
  if (!ds) return NextResponse.json({ error: "Connect Google Search Console for this client first." }, { status: 400 });

  const siteUrl = (ds.config as { site_url?: string })?.site_url;
  if (!siteUrl) return NextResponse.json({ error: "Select a Search Console property first." }, { status: 400 });

  // Read the cached snapshot for the requested period — RLS scopes it to the
  // signed-in user's agency. No Google call.
  const { data: snap } = await supabase
    .from("gsc_snapshots")
    .select("data")
    .eq("data_source_id", ds.id)
    .eq("period_days", periodDays)
    .maybeSingle();

  const snapshot = (snap?.data as ReportSnapshot | undefined) ?? null;
  if (isSnapshotEmpty(snapshot)) {
    return NextResponse.json(
      { error: "No analytics data is available yet for this client. Click “Refresh now” on the client, then generate the report." },
      { status: 400 }
    );
  }

  const { data: template } = await supabase
    .from("report_templates")
    .select("name, sections")
    .eq("key", templateKey)
    .is("agency_id", null)
    .maybeSingle();

  // Optional AI executive summary — this calls Anthropic, not Google, and never
  // blocks generation if it's unconfigured or fails.
  const insights = await generateReportInsights({
    clientName: client.name,
    periodLabel: `the last ${periodDays} days`,
    totals: snapshot!.totals,
    previousTotals: snapshot!.previousTotals ?? null,
    topQueries: snapshot!.topQueries,
    topPages: snapshot!.topPages,
    topCountries: snapshot!.topCountries,
    topDevices: snapshot!.topDevices,
    movers: snapshot!.movers,
  });

  const data = assembleReport(snapshot!, insights);
  const period = reportPeriod(snapshot!, { start: isoDaysAgo(periodDays + 2), end: isoDaysAgo(2) });
  const shareToken = crypto.randomBytes(16).toString("hex");

  const { data: report, error } = await supabase
    .from("reports")
    .insert({
      agency_id: agency.id,
      client_id: clientId,
      template_key: templateKey,
      title: `${client.name} — ${template?.name ?? "SEO Report"}`,
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
