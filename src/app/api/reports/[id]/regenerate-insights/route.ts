import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserAndAgency } from "@/lib/agency";
import { getSubscriptionState } from "@/lib/billing/subscription";
import { featuresForPlan } from "@/lib/billing/config";
import { generateReportInsights } from "@/lib/ai";
import { trackUsage } from "@/lib/usage";
import { rateLimit, tooManyRequests } from "@/lib/rateLimit";
import { normalizeReportData, reportDataHash, toInsightsInput, isReportEmpty, insightsPeriodPhrase } from "@/lib/report";

export const runtime = "nodejs";
// The AI call takes ~15s, so the 10s default killed this route before it could
// store anything — "Regenerate insights" could not succeed in production at all.
// Launch audit B3 set this on the generate, send, pdf and cron routes; this one
// was missed.
export const maxDuration = 60;

// Regenerates a report's AI insights from its own stored data (no provider
// calls). Caches by a hash of the underlying metrics: if the data is unchanged
// and insights already exist, it skips the AI call unless `force` is set (the
// user explicitly hit "Regenerate insights").
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const { user, agency } = await getCurrentUserAndAgency();
  if (!user || !agency) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Bound per workspace. This endpoint calls the model on demand, and `force`
  // bypasses its own cache, so without a limit one workspace could spend
  // unbounded tokens by replaying the request.
  const rl = await rateLimit(`report-insights:${agency.id}`, { limit: 20, windowSeconds: 60 });
  if (!rl.allowed) return tooManyRequests(rl.windowSeconds);

  const body = await req.json().catch(() => null);
  const force: boolean = body?.force === true;

  const supabase = createClient();

  // One read serves both checks below (requireActiveAccess is this call plus a
  // hasAccess test, so calling it too would duplicate the query).
  const state = await getSubscriptionState(supabase, agency.id);
  if (!state.hasAccess) {
    return NextResponse.json({ error: state.blockedReason ?? "Subscription required." }, { status: 402 });
  }
  // AI insights are a paid capability. Generation enforces this
  // (lib/reportGen.ts) and this route did not, so a Free-plan workspace could
  // generate a report without insights — correctly, the model never ran — and
  // then POST here to have the paid analysis written into it, unmetered.
  if (!featuresForPlan(state.plan).aiInsights) {
    return NextResponse.json(
      { error: "AI insights are available on the paid plans. Upgrade to add written analysis to your reports." },
      { status: 402 }
    );
  }

  const { data: report } = await supabase
    .from("reports")
    // period_start/period_end are the report's own stored window and exist on
    // every report, including ones generated before `meta` did.
    .select("id, data, period_start, period_end, clients(name)")
    .eq("id", params.id)
    .eq("agency_id", agency.id)
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

  // The report's real window, via the same helper generation uses. This was
  // rebuilt as `the last ${byDate.length} days`, which described the wrong
  // period on any calendar or custom window (a Q2 report became "the last 61
  // days") and no period at all on a report with no Google source, since
  // `blocks` were never consulted — re-introducing, on regeneration, the exact
  // bug generation had been fixed to avoid.
  const periodLabel = insightsPeriodPhrase({
    label: data.meta?.periodLabel,
    start: data.meta?.requested?.start ?? report.period_start,
    end: data.meta?.requested?.end ?? report.period_end,
    days: data.meta?.periodDays,
  });

  const insights = await generateReportInsights(toInsightsInput(data, clientName, periodLabel));
  if (!insights) {
    return NextResponse.json(
      { error: "AI insights are unavailable. Check ANTHROPIC_API_KEY / AI_PROVIDER, then try again." },
      { status: 502 }
    );
  }

  // Spread the normalized payload rather than rebuilding it from two fields.
  // The old literal wrote only { gsc, ga4, insights, insightsHash }, dropping
  // `blocks` and `meta` — so regenerating insights deleted every non-Google
  // channel from the report, and with meta went the report type, the period
  // label and the coverage notes. A Meta-Ads-only report came back empty, and
  // any report lost the identity it was generated with.
  const { error } = await supabase
    .from("reports")
    .update({ data: { ...data, insights, insightsHash: hash } })
    .eq("id", params.id)
    .eq("agency_id", agency.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  // The model ran, so meter it. Generation meters every live call
  // (lib/reportGen.ts) and this path did not, leaving its AI spend invisible in
  // usage_counters.
  await trackUsage(agency.id, "ai_summaries");

  return NextResponse.json({ ok: true, cached: false });
}
