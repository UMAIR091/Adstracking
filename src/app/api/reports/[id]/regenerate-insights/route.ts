import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserAndAgency } from "@/lib/agency";
import { generateReportInsights } from "@/lib/ai";
import { normalizeReportData, reportDataHash, toInsightsInput, isReportEmpty } from "@/lib/report";

export const runtime = "nodejs";

// Regenerates a report's AI insights from its own stored GSC + GA4 data (no
// Google calls). Caches by a hash of the underlying metrics: if the data is
// unchanged and insights already exist, it skips the AI call unless `force` is
// set (the user explicitly hit "Regenerate insights").
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const { user, agency } = await getCurrentUserAndAgency();
  if (!user || !agency) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const force: boolean = body?.force === true;

  const supabase = createClient();
  const { data: report } = await supabase
    .from("reports")
    .select("id, data, clients(name)")
    .eq("id", params.id)
    .maybeSingle();
  if (!report) return NextResponse.json({ error: "Report not found" }, { status: 404 });

  const data = normalizeReportData(report.data);
  if (isReportEmpty(data)) {
    return NextResponse.json({ error: "This report has no analytics data to analyze." }, { status: 400 });
  }

  const hash = reportDataHash(data);

  // Cache hit: data unchanged and insights already present → no AI call.
  if (!force && data.insights && data.insightsHash === hash) {
    return NextResponse.json({ ok: true, cached: true });
  }

  const c = report.clients as unknown as { name: string | null } | { name: string | null }[] | null;
  const clientName = (Array.isArray(c) ? c[0]?.name : c?.name) ?? "Client";
  const days = data.gsc?.byDate?.length || data.ga4?.byDate?.length || 0;
  const periodLabel = days ? `the last ${days} days` : "this reporting period";

  const insights = await generateReportInsights(toInsightsInput(data, clientName, periodLabel));
  if (!insights) {
    return NextResponse.json(
      { error: "AI insights are unavailable. Check ANTHROPIC_API_KEY / AI_PROVIDER, then try again." },
      { status: 502 }
    );
  }

  const { error } = await supabase
    .from("reports")
    .update({ data: { gsc: data.gsc, ga4: data.ga4, insights, insightsHash: hash } })
    .eq("id", params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ ok: true, cached: false });
}
