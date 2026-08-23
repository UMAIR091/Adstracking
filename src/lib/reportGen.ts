// Report generation core, extracted so both the manual "Generate report" route
// and the scheduled-delivery cron can create reports the same way. Builds a
// unified GSC + GA4 report purely from cached snapshots — no live Google calls.
import crypto from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { generateReportInsightsCached } from "@/lib/ai";
import { trackUsage } from "@/lib/usage";
import { checkReportLimit } from "@/lib/billing/limits";
import { featuresForPlan } from "@/lib/billing/config";
import type { GscReportFull, Ga4ReportFull } from "@/lib/google";
import { snapshotsToBlocks, type ReportBlock } from "@/lib/integrations/blocks";
import { resolvePeriod, isPeriodPreset, type PeriodPreset, type ResolveResult } from "@/lib/reports/periods";
import { deriveGsc, deriveGa4, deriveBlock, seriesCoverage, covers, archiveToGscByDate, archiveToGa4ByDate, archiveToBlockSeries, type Unavailable } from "@/lib/reports/derive";
import { fetchHistory } from "@/lib/metrics/history";
import { inferReportType, isReportType, suggestReportTitle, type ReportType } from "@/lib/reports/types";
import { hasCalculableKpis } from "@/lib/reports/summary";
import { assembleReport, isGscEmpty, isGa4Empty, isReportEmpty, dataCoverage, periodLabel, toInsightsInput, type ReportData } from "@/lib/report";

/**
 * Bridges the legacy `periodDays` argument and the period presets.
 *
 * Backward compatibility is deliberate: every existing caller passes 28 or 90
 * (or nothing), and each maps onto the identical rolling window it produced
 * before, reading the same cached snapshot. Only a `period` preset opts into
 * the new calendar/custom behaviour.
 */
function resolveRequestedPeriod(opts: {
  periodDays?: number;
  period?: string;
  customStart?: string | null;
  customEnd?: string | null;
  now?: number;
}): ResolveResult {
  if (opts.period) {
    if (!isPeriodPreset(opts.period)) {
      return { ok: false, error: `Unknown reporting period "${opts.period}".` };
    }
    return resolvePeriod({
      preset: opts.period,
      customStart: opts.customStart,
      customEnd: opts.customEnd,
      now: opts.now,
    });
  }
  const preset: PeriodPreset = opts.periodDays === 90 ? "last_90" : "last_28";
  return resolvePeriod({ preset, now: opts.now });
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
  opts: {
    templateKey?: string;
    /** Legacy 28/90 selector — still honoured for existing callers. */
    periodDays?: number;
    /** Preferred: a period preset, with custom bounds when preset is "custom". */
    period?: string;
    customStart?: string | null;
    customEnd?: string | null;
    title?: string;
    reportType?: string;
    now?: number;
  } = {}
): Promise<CreateReportResult> {
  const templateKey = opts.templateKey || "seo";

  // ── Resolve the window before touching any data ──────────────────────────
  // `periodDays` remains supported so existing callers (and the 28/90 presets)
  // behave exactly as before. A `period` preset takes precedence.
  const resolved = resolveRequestedPeriod(opts);
  if (!resolved.ok) return { ok: false, status: 400, error: resolved.error };
  const period = resolved.period;

  // Which cached snapshot to read. A window of 28 rolling days matches the
  // 28-day snapshot exactly and is served at full fidelity; anything else is
  // rebuilt from the 90-day daily series.
  const snapshotDays = period.preset === "last_28" ? 28 : 90;
  const derived = period.preset !== "last_28" && period.preset !== "last_90";

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
      .from("gsc_snapshots").select("data").eq("data_source_id", gscDs.id).eq("period_days", snapshotDays).maybeSingle();
    const s = (snap?.data as GscReportFull | undefined) ?? null;
    gscData = isGscEmpty(s) ? null : s;
  }

  let ga4Data: Ga4ReportFull | null = null;
  if (ga4Ready && ga4Ds) {
    const { data: snap } = await supabase
      .from("ga4_snapshots").select("data").eq("data_source_id", ga4Ds.id).eq("period_days", snapshotDays).maybeSingle();
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
      .eq("period_days", snapshotDays);
    const byId = new Map((snaps ?? []).map((r) => [r.data_source_id as string, r.data]));
    blocks = snapshotsToBlocks(otherSources.map((s) => ({ type: s.type as string, snapshot: byId.get(s.id as string) })));
  }

  if (isReportEmpty({ gsc: gscData, ga4: ga4Data, blocks })) {
    return { ok: false, status: 400, error: "No analytics data is available yet. Click “Refresh now” on the client's data source, then generate the report." };
  }

  // ── Rebuild the requested window from the cached daily series ─────────────
  // Only for windows that don't match a cached snapshot. The guard below is
  // what stops a selected period silently producing another period's numbers:
  // if the cache doesn't span the window, generation fails with an explanation
  // instead of returning whatever it happens to hold.
  const unavailable: Unavailable[] = [];
  if (derived) {
    const allDates = [
      ...(gscData?.byDate ?? []).map((d) => d.date),
      ...(ga4Data?.byDate ?? []).map((d) => d.date),
      ...blocks.flatMap((b) => b.series.flatMap((s) => s.points.map((p) => p.date))),
    ];
    let cached = seriesCoverage(allDates);

    // Outside the rolling 90-day cache — a previous quarter almost always is —
    // fall back to the durable metric_daily archive every sync writes to. No
    // provider call is made either way.
    if (!covers(cached, period)) {
      const history = await fetchHistory(supabase, {
        agencyId, clientId, from: period.start, to: period.end,
      }).catch(() => [] as Awaited<ReturnType<typeof fetchHistory>>);

      const archiveDates = history.map((r) => r.date);
      const archived = seriesCoverage(archiveDates);
      if (covers(archived, period)) {
        // Re-seat each source's daily series on the archived rows, then let the
        // same derive functions below do the arithmetic.
        if (gscData) {
          const byDate = archiveToGscByDate(history);
          gscData = byDate.length ? { ...gscData, byDate } : null;
        }
        if (ga4Data) {
          const byDate = archiveToGa4ByDate(history);
          ga4Data = byDate.length ? { ...ga4Data, byDate } : null;
        }
        const seriesByProvider = archiveToBlockSeries(history);
        blocks = blocks
          .map((b) => {
            const series = seriesByProvider.get(b.sourceId);
            return series?.length ? { ...b, series } : null;
          })
          .filter((b): b is ReportBlock => b !== null);
        cached = archived;
      }
    }

    if (!covers(cached, period)) {
      return {
        ok: false,
        status: 400,
        error:
          `This report covers ${period.start} to ${period.end}, but stored history for this client only runs ` +
          `${cached ? `from ${cached.start} to ${cached.end}` : "for no days yet"}. ` +
          `Daily history builds up from the day a source is connected — choose a period inside that range.`,
      };
    }

    const g = deriveGsc(gscData, period);
    gscData = g.data;
    unavailable.push(...g.unavailable);

    const a = deriveGa4(ga4Data, period);
    ga4Data = a.data;
    unavailable.push(...a.unavailable);

    const rebuilt: ReportBlock[] = [];
    for (const b of blocks) {
      const r = deriveBlock(b, period);
      if (r.data) rebuilt.push(r.data);
      unavailable.push(...r.unavailable);
    }
    blocks = rebuilt;

    if (isReportEmpty({ gsc: gscData, ga4: ga4Data, blocks })) {
      return {
        ok: false,
        status: 400,
        error: `No data was recorded between ${period.start} and ${period.end}. Choose a different period.`,
      };
    }
  }

  const { data: template } = await supabase
    .from("report_templates").select("name, sections").eq("key", templateKey).is("agency_id", null).maybeSingle();

  // ── One canonical window, from here to the stored row, the PDF and the UI ──
  // The period is what the user asked for. `coverage` records how much real
  // data landed inside it, so a partially-covered report can say so instead of
  // silently relabelling itself as a shorter period.
  // Coverage describes how much of THIS period the data spans, so it is clamped
  // to the window. Providers settle on different lags (GA4 and most channels
  // report through yesterday, Search Console two days back), which previously
  // let coverage run a day past the period end and read as though the report
  // covered dates outside its own stated range.
  const rawCoverage = dataCoverage({ gsc: gscData, ga4: ga4Data, blocks });
  const coverage = rawCoverage
    ? {
        start: rawCoverage.start < period.start ? period.start : rawCoverage.start,
        end: rawCoverage.end > period.end ? period.end : rawCoverage.end,
      }
    : null;

  // Only sources that actually contributed data describe the report. A
  // connected-but-empty source shouldn't make an SEO report look cross-channel.
  //
  // gscData and ga4Data are already nulled when empty. A block reaches here
  // whenever it carries any KPI at all, and a KPI can be present but null — a
  // channel that returned nothing still projects its ratio metrics as "not
  // calculable". A block like that contributed no figure, so it names nothing.
  const blockContributed = (b: ReportBlock) =>
    hasCalculableKpis(b.kpis) || b.tables.some((tbl) => tbl.rows.length > 0);
  const contributing = [
    ...(gscData ? ["gsc"] : []),
    ...(ga4Data ? ["ga4"] : []),
    ...blocks.filter(blockContributed).map((b) => b.sourceId).filter((id): id is string => Boolean(id)),
  ];
  const reportType = isReportType(opts.reportType) ? opts.reportType : inferReportType(contributing);
  const meta = {
    periodDays: period.days,
    requested: { start: period.start, end: period.end },
    coverage,
    reportType,
    sourceIds: contributing,
    // What the period system resolved, and what could not be rebuilt for it.
    periodPreset: period.preset,
    periodKind: period.kind,
    periodLabel: period.label,
    periodInProgress: period.inProgress,
    unavailable: unavailable.length ? unavailable : undefined,
  };

  const unified = assembleReport(gscData, ga4Data, null, blocks, meta);
  // AI insights are a paid capability. The report still generates on the Free
  // plan — charts, tables and totals — it just carries no written analysis, and
  // the model is never called, so it costs nothing to serve.
  const aiAllowed = featuresForPlan(reportLimit.plan).aiInsights;
  // The AI is told the real window, not a generic "last N days" phrase, so its
  // prose can't describe a period the report doesn't cover.
  const { insights, cached } = aiAllowed
    ? await generateReportInsightsCached(
        toInsightsInput(unified, client.name, `${period.label} — ${period.start} to ${period.end} (${period.days} days)`)
      )
    : { insights: null, cached: false };
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
