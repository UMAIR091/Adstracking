import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserAndAgency } from "@/lib/agency";
import { getValidAccessToken } from "@/lib/googleTokens";
import { fetchGscReport, fetchGscTotals } from "@/lib/google";
import { generateReportInsights } from "@/lib/ai";

export const runtime = "nodejs";

function isoDaysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

// Generates a report: pulls live Search Console data and snapshots it into `reports`.
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
    .select("id, config, access_token, refresh_token, token_expires_at")
    .eq("client_id", clientId)
    .eq("type", "gsc")
    .maybeSingle();
  if (!ds) return NextResponse.json({ error: "Connect Google Search Console for this client first." }, { status: 400 });

  const siteUrl = (ds.config as { site_url?: string })?.site_url;
  if (!siteUrl) return NextResponse.json({ error: "Select a Search Console property first." }, { status: 400 });

  const { data: template } = await supabase
    .from("report_templates")
    .select("name, sections")
    .eq("key", templateKey)
    .is("agency_id", null)
    .maybeSingle();

  const start = isoDaysAgo(periodDays + 2);
  const end = isoDaysAgo(2); // Search Console data lags ~2 days
  // The equal-length window immediately before, for period-over-period comparison.
  const prevStart = isoDaysAgo(periodDays * 2 + 2);
  const prevEnd = isoDaysAgo(periodDays + 3);

  try {
    const accessToken = await getValidAccessToken(supabase, ds);
    const [data, previousTotals] = await Promise.all([
      fetchGscReport(accessToken, siteUrl, start, end),
      fetchGscTotals(accessToken, siteUrl, prevStart, prevEnd).catch(() => null),
    ]);

    // Optional AI executive summary — never blocks generation if absent/failing.
    const insights = await generateReportInsights({
      clientName: client.name,
      periodLabel: `the last ${periodDays} days`,
      totals: data.totals,
      previousTotals,
      topQueries: data.topQueries,
      topPages: data.topPages,
    });

    const snapshot = { ...data, previousTotals, insights };
    const shareToken = crypto.randomBytes(16).toString("hex");
    const { data: report, error } = await supabase
      .from("reports")
      .insert({
        agency_id: agency.id,
        client_id: clientId,
        template_key: templateKey,
        title: `${client.name} — ${template?.name ?? "SEO Report"}`,
        status: "ready",
        period_start: start,
        period_end: end,
        data: snapshot,
        sections: template?.sections ?? [],
        share_token: shareToken,
      })
      .select("id")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true, id: report.id });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 502 });
  }
}
