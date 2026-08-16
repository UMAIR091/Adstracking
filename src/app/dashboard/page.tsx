import Link from "next/link";
import { redirect } from "next/navigation";
import { format } from "date-fns";
import {
  FileBarChart2, Plus, Cable, Eye, Palette,
  CheckCircle2, AlertCircle, Trophy, ArrowRight, Users,
} from "lucide-react";
import { getCurrentUserAndAgency } from "@/lib/agency";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { OnboardingChecklist, type OnboardingStep } from "@/components/OnboardingChecklist";
import { PerfKpiCard } from "@/components/PerfKpiCard";
import { NoIntegrationsState, AwaitingSyncState, NoDataYet } from "@/components/AnalyticsEmptyState";
import { WelcomeBack, type WelcomeBackData } from "@/components/WelcomeBack";
import { StatRow, type StatTileData } from "@/components/dashboard/StatTile";
import { NeedsAttention, type AttentionItem } from "@/components/dashboard/NeedsAttention";
import { ActivityTimeline } from "@/components/dashboard/ActivityTimeline";
import { NextScheduled, type NextScheduledData } from "@/components/dashboard/NextScheduled";
import { AiPanel } from "@/components/dashboard/AiPanel";
import { detectSignals, withContext, type Signal } from "@/lib/insights/signals";
import type { GscReportFull } from "@/lib/google";
import { buildActivity } from "@/lib/dashboard/activity";
import { getIntegrationName } from "@/lib/integrations/names";
import { getIntegrationHealthCached, summarize } from "@/lib/integrationHealth";
import { CHART } from "@/lib/chartColors";

export const dynamic = "force-dynamic";

type ClientWithSources = { id: string; name: string; created_at: string; data_sources: { type: string; created_at: string }[] | null };
type Day = { date: string; clicks: number; impressions: number; ctr: number; position: number };
type JoinedName = { name: string | null } | { name: string | null }[] | null;

const fmt = (n: number) => Math.round(n).toLocaleString();
const avg = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const nameOf = (c: JoinedName) => (Array.isArray(c) ? c[0]?.name : c?.name) ?? "Client";

// Period-over-period change: first half vs second half of the daily series.
function trend(vals: number[], lowerIsBetter = false): { pct: number | null; good: boolean } {
  const h = Math.floor(vals.length / 2);
  if (h === 0) return { pct: null, good: true };
  const a = avg(vals.slice(0, h));
  if (!a) return { pct: null, good: true };
  const pct = ((avg(vals.slice(h)) - a) / a) * 100;
  return { pct, good: lowerIsBetter ? pct < 0 : pct > 0 };
}

export default async function DashboardPage() {
  const { user, agency } = await getCurrentUserAndAgency();
  if (!user || !agency) redirect("/login");

  const supabase = createClient();

  // Start of the current calendar month, for the "reports this month" stat.
  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);

  const [
    { count: clientCount }, { count: reportCount }, { count: reportsThisMonth }, { count: scheduleCount },
    { data: clientsRaw }, { data: snaps }, { data: gscSources }, { data: allSources },
    { data: reportsRaw }, { data: schedulesRaw }, { data: emailsRaw },
  ] = await Promise.all([
    supabase.from("clients").select("id", { count: "exact", head: true }).eq("archived", false),
    supabase.from("reports").select("id", { count: "exact", head: true }),
    supabase.from("reports").select("id", { count: "exact", head: true }).gte("created_at", monthStart.toISOString()),
    supabase.from("report_schedules").select("id", { count: "exact", head: true }).eq("enabled", true),
    supabase.from("clients").select("id, name, created_at, data_sources(type, created_at)").eq("archived", false).order("created_at", { ascending: false }).limit(8),
    // Only the two fields the dashboard actually aggregates — drops the large
    // topQueries/topPages/movers arrays from the payload (perf audit P1-4).
    // `movers` is added for the AI insight cards. It's bounded (5 winners, 5
    // decliners, 5 opportunities) unlike topQueries/topPages, so the payload
    // stays close to what the perf audit trimmed it to.
    supabase.from("gsc_snapshots").select("data_source_id, totals:data->totals, series:data->byDate, movers:data->movers").eq("period_days", 28),
    supabase.from("data_sources").select("id, client_id, config, clients(name)").eq("type", "gsc"),
    // Every source, for the integrations stat, the sync status and the timeline.
    supabase.from("data_sources").select("client_id, type, created_at, last_synced_at, last_sync_error"),
    supabase.from("reports").select("id, title, status, period_start, period_end, data, created_at, client_id, clients(name)").order("created_at", { ascending: false }).limit(5),
    supabase.from("report_schedules").select("id, client_id, frequency, next_run_at, template_key, clients(name)").eq("enabled", true).order("next_run_at", { ascending: true }).limit(5),
    supabase.from("email_logs").select("report_id, to_email, status, sent_at, error, source").order("sent_at", { ascending: false }).limit(10),
  ]);

  const clients = (clientsRaw ?? []) as ClientWithSources[];

  // Integration health roll-up across every connected data source.
  const health = summarize(await getIntegrationHealthCached(agency.id));

  // Client connections — connected / pending / ready.
  const sources = (gscSources ?? []) as { id: string; client_id: string | null; config: { site_url?: string | null } | null; clients: JoinedName }[];
  const connectedIds = new Set(sources.map((s) => s.client_id).filter(Boolean));
  const connectedCount = connectedIds.size;
  const readyCount = new Set(sources.filter((s) => s.config?.site_url).map((s) => s.client_id)).size;
  const pendingCount = Math.max(0, (clientCount ?? 0) - connectedCount);

  const everySource = (allSources ?? []) as {
    client_id: string | null; type: string; created_at: string;
    last_synced_at: string | null; last_sync_error: string | null;
  }[];

  // Performance — aggregated strictly from real cached snapshots. When there
  // is nothing to aggregate the KPI block is not rendered at all: ReportFlow
  // never shows invented numbers, so an empty state takes its place.
  const snapRows = (snaps ?? []) as {
    data_source_id: string;
    totals: Day | null;
    series: Day[] | null;
    movers: GscReportFull["movers"] | null;
  }[];

  const byDate = new Map<string, { clicks: number; impressions: number; posW: number }>();
  let tClicks = 0, tImpr = 0, tPosW = 0;
  for (const s of snapRows) {
    const t = s.totals;
    if (t) { tClicks += t.clicks; tImpr += t.impressions; tPosW += t.position * t.impressions; }
    for (const d of s.series ?? []) {
      const e = byDate.get(d.date) ?? { clicks: 0, impressions: 0, posW: 0 };
      e.clicks += d.clicks; e.impressions += d.impressions; e.posW += d.position * d.impressions;
      byDate.set(d.date, e);
    }
  }
  const series: Day[] = Array.from(byDate.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([date, e]) => ({
    date, clicks: e.clicks, impressions: e.impressions,
    ctr: e.impressions ? e.clicks / e.impressions : 0,
    position: e.impressions ? e.posW / e.impressions : 0,
  }));
  const perf = { clicks: tClicks, impressions: tImpr, ctr: tImpr ? tClicks / tImpr : 0, position: tImpr ? tPosW / tImpr : 0 };

  // Real data means a snapshot that actually carries measurements — a synced
  // source with an all-zero window still counts, an empty table does not.
  const hasReal = snapRows.length > 0 && series.length > 0;

  const clicksArr = series.map((d) => d.clicks);
  const imprArr = series.map((d) => d.impressions);
  const ctrArr = series.map((d) => d.ctr);
  const posArr = series.map((d) => d.position);
  const clicksT = trend(clicksArr), imprT = trend(imprArr), ctrT = trend(ctrArr), posT = trend(posArr, true);

  // The comparison is the same split the trend uses — half the window against
  // the other half — so the label can never drift from the maths above.
  const halfDays = Math.floor(series.length / 2);
  const comparison = halfDays > 0 ? `vs previous ${halfDays} day${halfDays === 1 ? "" : "s"}` : "";

  const perfCards = [
    { l: "Clicks", v: fmt(perf.clicks), icon: "clicks", color: CHART.indigo, arr: clicksArr, t: clicksT,
      why: "Visits earned from Google search results." },
    { l: "Impressions", v: fmt(perf.impressions), icon: "impressions", color: CHART.sky, arr: imprArr, t: imprT,
      why: "How often your pages appeared in results." },
    { l: "Avg CTR", v: `${(perf.ctr * 100).toFixed(1)}%`, icon: "ctr", color: CHART.emerald, arr: ctrArr, t: ctrT,
      why: "Share of impressions that became clicks." },
    { l: "Avg position", v: perf.position.toFixed(1), icon: "position", color: CHART.amber, arr: posArr, t: posT,
      why: "Average ranking. Lower is better." },
  ];

  // The setup journey, in the order an agency actually lives it: a client to
  // report on, a source to pull from, data that has landed, branding on the
  // deliverable, a report, and then delivery. Every "done" is read from state
  // already fetched above — no extra queries, and nothing is tracked or
  // remembered that the workspace doesn't already record.
  //
  // "Connect a data source" counts every integration type, not just Search
  // Console: `connectedCount` above is GSC-only because the performance
  // aggregate is, but setup is complete as soon as any source is connected.
  const steps: OnboardingStep[] = [
    {
      label: "Add your first client",
      done: (clientCount ?? 0) > 0,
      href: "/dashboard/clients/new",
      cta: "Add client",
      description: "Every report, data source and schedule hangs off a client.",
    },
    {
      label: "Connect a data source",
      done: everySource.length > 0,
      href: "/dashboard/clients",
      cta: "Connect a source",
      description: "Search Console, GA4, Meta Ads, Shopify and more — open a client and connect one.",
    },
    {
      label: "See your first synced data",
      done: hasReal,
      href: "/dashboard/clients",
      cta: "View performance",
      description: "The first sync usually lands within a few minutes. Metrics then appear on the client page.",
    },
    {
      label: "Add your logo & branding",
      done: !!agency.logo_url,
      href: "/dashboard/settings",
      cta: "Add branding",
      description: "Clients see your agency on every report and email — not ReportFlow.",
    },
    {
      label: "Generate your first report",
      done: (reportCount ?? 0) > 0,
      href: "/dashboard/clients",
      cta: "Pick a client",
      description: "Open a client, choose a template and date range, and generate.",
    },
    {
      label: "Send or schedule it",
      // A bounced or failed attempt doesn't count as delivered, so it doesn't
      // tick the step — the agency still has something to fix.
      done:
        (emailsRaw ?? []).some((e) => e.status !== "failed" && e.status !== "bounced" && e.status !== "pending") ||
        (scheduleCount ?? 0) > 0,
      href: "/dashboard/reports",
      cta: "Go to reports",
      description: "Email the report to your client, or put delivery on a recurring schedule.",
    },
  ];
  const setupComplete = steps.every((s) => s.done);

  // Mode: active once there's a client AND a connected Search Console property.
  const activeMode = (clientCount ?? 0) > 0 && readyCount > 0;

  // Top performing clients (by clicks, from cached snapshots).
  const srcById = new Map(sources.map((s) => [s.id, s]));
  const perClient = new Map<string, { name: string; clicks: number; impressions: number }>();
  for (const sn of snapRows) {
    const src = srcById.get(sn.data_source_id);
    const t = sn.totals;
    if (!src || !src.client_id || !t) continue;
    const e = perClient.get(src.client_id) ?? { name: nameOf(src.clients), clicks: 0, impressions: 0 };
    e.clicks += t.clicks; e.impressions += t.impressions;
    perClient.set(src.client_id, e);
  }
  const topClients = Array.from(perClient.entries()).map(([id, v]) => ({ id, ...v })).sort((a, b) => b.clicks - a.clicks).slice(0, 5);

  const reports = (reportsRaw ?? []) as { id: string; title: string; status: string; period_start: string | null; period_end: string | null; data: { totals?: Day } | null; created_at: string; client_id: string | null; clients: JoinedName }[];
  const schedules = (schedulesRaw ?? []) as { id: string; client_id: string | null; frequency: string; next_run_at: string; template_key: string; clients: JoinedName }[];
  const emails = (emailsRaw ?? []) as { report_id: string | null; to_email: string; status: string; sent_at: string; error: string | null; source: string | null }[];

  // ── Latest sync status ───────────────────────────────────────
  // The most recent successful sync across every source, plus how many are
  // genuinely failing (sync_error + needs_reconnect). Sources that are simply
  // waiting for an account selection (needs_account) are NOT counted here —
  // they produce a "No ad account selected" last_sync_error but that's a
  // setup-incomplete state, not a broken connection.
  const syncedTimes = everySource.map((s) => s.last_synced_at).filter((t): t is string => Boolean(t));
  const lastSyncAt = syncedTimes.length ? syncedTimes.sort((a, b) => b.localeCompare(a))[0] : null;
  // Use the health rollup already computed above (same data, single source of truth).
  const failingSyncs = health.errored + health.needsReconnect;

  // ── Activity timeline ────────────────────────────────────────
  // email_logs.source (migration 0031) carries how each send was triggered, so
  // scheduled deliveries and manual sends are distinguished from the record
  // rather than inferred. Pre-0031 rows have no source and read as manual.
  const activity = buildActivity({
    clients: clients.map((c) => ({ id: c.id, name: c.name, created_at: c.created_at })),
    sources: everySource,
    reports: reports.map((r) => ({ id: r.id, title: r.title, created_at: r.created_at, client_id: r.client_id, clientName: nameOf(r.clients) })),
    emails,
    integrationNames: Object.fromEntries(everySource.map((s) => [s.type, getIntegrationName(s.type)])),
  });

  // ── Headline stats ───────────────────────────────────────────
  const nextSchedule = schedules[0] ?? null;
  const nextScheduled: NextScheduledData | null = nextSchedule
    ? {
        clientId: nextSchedule.client_id,
        clientName: nameOf(nextSchedule.clients),
        frequency: nextSchedule.frequency,
        nextRunAt: nextSchedule.next_run_at,
        alsoQueued: Math.max(0, (scheduleCount ?? schedules.length) - 1),
      }
    : null;

  const stats: StatTileData[] = [
    {
      label: "Active clients",
      value: String(clientCount ?? 0),
      hint: pendingCount > 0 ? `${pendingCount} still need a data source` : "All clients have a source connected",
      icon: "users",
      tone: pendingCount > 0 ? "warning" : "positive",
      href: "/dashboard/clients",
    },
    {
      label: "Reports this month",
      value: String(reportsThisMonth ?? 0),
      hint: `${reportCount ?? 0} generated all time`,
      icon: "report",
      tone: "neutral",
      href: "/dashboard/reports",
    },
    {
      label: "Reports scheduled",
      value: String(scheduleCount ?? 0),
      hint: nextScheduled ? `Next: ${format(new Date(nextScheduled.nextRunAt), "d MMM")}` : "Automate a client's delivery",
      icon: "calendar",
      tone: (scheduleCount ?? 0) > 0 ? "positive" : "neutral",
      href: "/dashboard/clients",
    },
    {
      label: "Latest sync",
      value: lastSyncAt ? format(new Date(lastSyncAt), "d MMM, HH:mm") : "—",
      hint: failingSyncs > 0 ? `${failingSyncs} source${failingSyncs === 1 ? "" : "s"} failing` : lastSyncAt ? "All sources healthy" : "No source has synced yet",
      icon: failingSyncs > 0 ? "alert" : "sync",
      tone: failingSyncs > 0 ? "danger" : lastSyncAt ? "positive" : "neutral",
      href: "/dashboard/settings/health",
    },
    {
      label: "Integrations",
      value: String(health.total),
      // needsAttention = syncError + needsReconnect + needsAccount — every source
      // the user still has an action to take on, consistently with the health page.
      hint: health.needsAttention > 0 ? `${health.needsAttention} need attention` : "Connected and reporting",
      icon: "cable",
      tone: health.needsAttention > 0 ? "warning" : health.total > 0 ? "positive" : "neutral",
      href: "/dashboard/integrations",
    },
  ];

  // ── Needs attention ──────────────────────────────────────────
  // Every item below restates a fact already computed on this page, so the band
  // can never disagree with the tiles above it. Each becomes a link to wherever
  // the problem is actually fixed. Nothing is added when nothing is wrong.
  const failedEmails = emails.filter((e) => e.status === "failed" || e.status === "bounced").length;
  const attention: AttentionItem[] = [
    health.needsReconnect > 0 && {
      icon: "reconnect" as const,
      label: `${health.needsReconnect} source${health.needsReconnect === 1 ? "" : "s"} need reconnecting`,
      href: "/dashboard/settings/health",
      weight: 40,
    },
    health.errored > 0 && {
      icon: "error" as const,
      label: `${health.errored} source${health.errored === 1 ? "" : "s"} failing to sync`,
      href: "/dashboard/settings/health",
      weight: 30,
    },
    health.needsAccount > 0 && {
      icon: "account" as const,
      label: `${health.needsAccount} source${health.needsAccount === 1 ? "" : "s"} need an account selected`,
      href: "/dashboard/integrations",
      weight: 20,
    },
    pendingCount > 0 && {
      icon: "client" as const,
      label: `${pendingCount} client${pendingCount === 1 ? "" : "s"} without a data source`,
      href: "/dashboard/clients",
      weight: 15,
    },
    failedEmails > 0 && {
      icon: "email" as const,
      label: `${failedEmails} report deliver${failedEmails === 1 ? "y" : "ies"} failed`,
      href: "/dashboard/reports",
      weight: 10,
    },
  ].filter(Boolean) as AttentionItem[];

  // ── AI insight signals ───────────────────────────────────────
  // Computed per client from that client's own snapshot, then merged and
  // ranked across the workspace. Each card carries the client it belongs to,
  // so the panel says "where should I look today?" rather than restating an
  // aggregate the KPI row already shows. Nothing here is estimated: see
  // lib/insights/signals.ts.
  const signals: Signal[] = hasReal
    ? snapRows
        .flatMap((sn) => {
          const src = srcById.get(sn.data_source_id);
          const name = src ? nameOf(src.clients) : null;
          if (!name) return [];
          // Only the fields this snapshot actually selected are passed; the
          // detector emits nothing for the parts it can't see (e.g. top pages).
          const partial = {
            totals: sn.totals ?? { clicks: 0, impressions: 0, ctr: 0, position: 0 },
            byDate: sn.series ?? [],
            movers: sn.movers ?? null,
            topQueries: [],
            topPages: [],
            topCountries: [],
            topDevices: [],
            previousTotals: null,
          } as unknown as GscReportFull;
          return withContext(detectSignals(partial, null, 3), name);
        })
        .sort((a, b) => b.weight - a.weight)
        .slice(0, 6)
    : [];

  const quickActions = [
    { label: "Add client", href: "/dashboard/clients/new", icon: Plus, tint: "bg-brand-50 text-brand-600" },
    { label: "Integrations", href: "/dashboard/integrations", icon: Cable, tint: "bg-emerald-50 text-emerald-600" },
    { label: "Sample report", href: "/dashboard/reports/preview", icon: Eye, tint: "bg-amber-50 text-amber-600" },
    { label: "Branding", href: "/dashboard/settings", icon: Palette, tint: "bg-sky-50 text-sky-600" },
  ];

  // ── Returning-user "welcome back" summary (journey audit P2-9) ──
  // Only on a genuine return (last seen > 6h ago). Compute what changed since,
  // then stamp last_seen_at for next time.
  const lastSeen = agency.last_seen_at;
  const SIX_HOURS = 6 * 60 * 60 * 1000;
  const isReturn = !!lastSeen && Date.now() - new Date(lastSeen).getTime() > SIX_HOURS;
  let welcomeBack: WelcomeBackData | null = null;
  if (isReturn && lastSeen) {
    const todayStart = new Date(); todayStart.setUTCHours(0, 0, 0, 0);
    const todayEnd = new Date(); todayEnd.setUTCHours(23, 59, 59, 999);
    const [rep, syncedSrc, schedToday] = await Promise.all([
      supabase.from("reports").select("id", { count: "exact", head: true }).gt("created_at", lastSeen),
      supabase.from("data_sources").select("id", { count: "exact", head: true }).gt("last_synced_at", lastSeen),
      supabase.from("report_schedules").select("id", { count: "exact", head: true }).eq("enabled", true).gte("next_run_at", todayStart.toISOString()).lte("next_run_at", todayEnd.toISOString()),
    ]);
    const d: WelcomeBackData = {
      lastSeen,
      reportsSent: rep.count ?? 0,
      syncedSources: syncedSrc.count ?? 0,
      // Reuses the health rollup already computed above instead of its own
      // `status in (error, revoked)` count — that third definition is why the
      // banner said "1 source needs attention" beside a tile saying "3 failing".
      failedSyncs: health.needsAttention,
      schedulesToday: schedToday.count ?? 0,
    };
    // Only show if there's something worth saying.
    if (d.reportsSent || d.syncedSources || d.failedSyncs || d.schedulesToday) welcomeBack = d;
  }
  // Stamp last-seen for next visit. Awaited so it reliably persists (an
  // un-awaited promise in a Server Component can be dropped before it settles).
  await supabase.from("agencies").update({ last_seen_at: new Date().toISOString() }).eq("id", agency.id);

  // "Which client needs attention?" is one of the questions this page exists to
  // answer, so clients without a data source sort above connected ones instead
  // of the list being purely newest-first.
  const clientsByAttention = [...clients].sort((a, b) => {
    const needs = (c: ClientWithSources) => ((c.data_sources ?? []).length > 0 ? 1 : 0);
    return needs(a) - needs(b);
  });

  // Performance section — rendered only when real synced metrics exist.
  // Otherwise the appropriate empty state explains which stage setup is at:
  // nothing connected yet, or connected and waiting on the first sync.
  const performanceSection = hasReal ? (
    <section aria-labelledby="perf-heading">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 id="perf-heading" className="text-base font-semibold tracking-tight text-ink-900">Performance overview</h2>
          <p className="mt-0.5 text-sm text-ink-500">
            Search Console, aggregated across every connected client · last 28 days
          </p>
        </div>
        <Link href="/dashboard/clients" className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:gap-1.5">
          Per-client detail <ArrowRight size={12} aria-hidden />
        </Link>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {perfCards.map((k) => (
          <PerfKpiCard
            key={k.l}
            label={k.l}
            value={k.v}
            deltaPct={k.t.pct}
            good={k.t.good}
            color={k.color}
            data={k.arr}
            icon={k.icon}
            comparison={comparison}
            explanation={k.why}
          />
        ))}
      </div>
    </section>
  ) : health.total > 0 ? (
    <AwaitingSyncState sourceCount={health.total} failing={health.errored + health.needsReconnect} />
  ) : (
    <NoIntegrationsState hasClients={(clientCount ?? 0) > 0} steps={steps} />
  );

  const recentReportsCard = (
    <Card className="h-full">
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2">
              <FileBarChart2 size={16} className="text-brand-500" aria-hidden /> Recent reports
            </CardTitle>
            <CardDescription>The last five reports you generated.</CardDescription>
          </div>
          <Link href="/dashboard/reports" className="shrink-0 text-xs font-medium text-brand-600 hover:underline">View all</Link>
        </div>
      </CardHeader>
      <CardContent>
        {reports.length === 0 ? (
          <NoDataYet
            message="No reports yet. Once a client's data has synced, generating a branded report takes one click — and it lands here."
            action={<Button asChild size="sm" variant="outline"><Link href="/dashboard/clients">Go to clients</Link></Button>}
          />
        ) : (
          <ul className="space-y-1">
            {reports.map((r) => (
              <li key={r.id}>
                <Link href={`/dashboard/reports/${r.id}`} className="-mx-2 flex items-center gap-3 rounded-lg px-2 py-2.5 transition-colors hover:bg-surface-muted">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                    <FileBarChart2 size={15} aria-hidden />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink-800">{r.title}</p>
                    <p className="truncate text-xs text-ink-500">{nameOf(r.clients)} · {format(new Date(r.created_at), "d MMM yyyy")}</p>
                  </div>
                  <Badge variant={r.status === "ready" ? "success" : "muted"}>{r.status}</Badge>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );

  const clientActivityCard = (
    <Card className="h-full">
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Users size={16} className="text-brand-500" aria-hidden /> Clients
            </CardTitle>
            <CardDescription>
              {pendingCount > 0
                ? `${pendingCount} of ${clientCount ?? 0} still need a data source — those are listed first.`
                : "Every client has a source connected."}
            </CardDescription>
          </div>
          <Link href="/dashboard/clients" className="shrink-0 text-xs font-medium text-brand-600 hover:underline">View all</Link>
        </div>
      </CardHeader>
      <CardContent>
        {clients.length === 0 ? (
          <div className="rounded-xl border border-dashed border-ink-200 p-5">
            <p className="text-sm font-medium text-ink-800">No clients yet</p>
            <p className="mt-1 text-sm leading-relaxed text-ink-500">
              A client is the workspace everything hangs off — connect their data once, then every report, schedule and
              insight is generated for them automatically.
            </p>
            <Button asChild size="sm" variant="outline" className="mt-4">
              <Link href="/dashboard/clients/new"><Plus size={14} aria-hidden /> Add your first client</Link>
            </Button>
          </div>
        ) : (
          <ul className="space-y-1">
            {clientsByAttention.slice(0, 5).map((c) => {
              const connected = (c.data_sources ?? []).length > 0;
              return (
                <li key={c.id}>
                  <Link href={`/dashboard/clients/${c.id}`} className="-mx-2 flex items-center justify-between gap-3 rounded-lg px-2 py-2.5 transition-colors hover:bg-surface-muted">
                    <span className="truncate text-sm font-medium text-ink-800">{c.name}</span>
                    {connected ? (
                      <Badge variant="success"><CheckCircle2 size={12} className="mr-1" aria-hidden /> Connected</Badge>
                    ) : (
                      <Badge variant="warning"><AlertCircle size={12} className="mr-1" aria-hidden /> Needs setup</Badge>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-8">
      {welcomeBack && <WelcomeBack data={welcomeBack} />}

      {/* Header — the agency's own mark sits beside its name, so the workspace
          reads as theirs from the first screen. Falls back to a monogram in the
          brand colour when no logo is set, and links to where both are edited. */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link
            href="/dashboard/settings"
            aria-label="Agency branding settings"
            className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-ink-200/70 bg-surface shadow-sm transition-shadow hover:shadow-md"
          >
            {agency.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={agency.logo_url} alt="" decoding="async" className="max-h-full max-w-full object-contain p-1" />
            ) : (
              <span className="text-lg font-semibold" style={{ color: agency.brand_color || "#4f46e5" }}>
                {(agency.name || "A").charAt(0).toUpperCase()}
              </span>
            )}
          </Link>
          <div>
            <p className="text-sm text-ink-500">Welcome back 👋</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-ink-900 sm:text-3xl">{agency.name}</h1>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline" className="hidden sm:inline-flex">
            <Link href="/dashboard/reports"><FileBarChart2 size={17} aria-hidden /> Reports</Link>
          </Button>
          <Button asChild>
            <Link href="/dashboard/clients/new"><Plus size={18} aria-hidden /> Add client</Link>
          </Button>
        </div>
      </div>

      {/* 1 — The whole workspace in one row. */}
      <StatRow stats={stats} />

      {/* 2 — Anything the user has to act on, gathered in one place rather
             than scattered across five tile hints. Renders nothing when the
             workspace is healthy. */}
      <NeedsAttention items={attention} />

      {/* 3 — Onboarding stays first-class until setup is actually finished, and
             sits high because for a new workspace it IS the action list. It
             used to disappear at `activeMode` (a client + a ready Search
             Console property), which hid the branding, first-report and
             delivery steps exactly when they became the next thing to do. The
             sample card keeps its old, narrower condition: it's a pitch for
             people who haven't connected anything yet. */}
      {!setupComplete && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className={activeMode ? "lg:col-span-3" : "lg:col-span-2"}><OnboardingChecklist steps={steps} /></div>
          {!activeMode && (
            <Card className="h-full">
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Eye size={16} className="text-brand-500" aria-hidden /> See a sample</CardTitle>
                <CardDescription>Preview a branded client report with your own logo and colours.</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm leading-relaxed text-ink-600">
                  Not sure what your clients will receive? Open a fully rendered sample — cover page, charts, AI summary
                  and all — before you connect anything.
                </p>
                <Button asChild variant="outline" className="mt-4"><Link href="/dashboard/reports/preview">Open sample report</Link></Button>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* 4 — The metrics themselves, with the AI reading of them and what goes
             out next alongside. These three answer one question together
             ("how are things, and what happens now?"), so they're grouped. */}
      {performanceSection}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2"><AiPanel signals={signals} connected={hasReal} /></div>
        <NextScheduled data={nextScheduled} />
      </div>

      {/* 5 — Client-level detail. */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {clientActivityCard}

        <Card className="h-full">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Trophy size={16} className="text-brand-500" aria-hidden /> Top performing clients</CardTitle>
            <CardDescription>Ranked by organic clicks over the last 28 days.</CardDescription>
          </CardHeader>
          <CardContent>
            {topClients.length === 0 ? (
              <NoDataYet
                message="No performance data yet. Once a client's Search Console has synced, your best performers are ranked here — handy for knowing which results to lead with."
                action={<Button asChild size="sm" variant="outline"><Link href="/dashboard/clients">View clients</Link></Button>}
              />
            ) : (
              <ul className="space-y-1">
                {topClients.map((c, i) => (
                  <li key={c.id}>
                    <Link href={`/dashboard/clients/${c.id}`} className="-mx-2 flex items-center gap-3 rounded-lg px-2 py-2.5 transition-colors hover:bg-surface-muted">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-50 text-xs font-semibold tabular-nums text-brand-600">{i + 1}</span>
                      <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink-800">{c.name}</span>
                      <span className="shrink-0 text-sm font-semibold tabular-nums text-ink-900">{fmt(c.clicks)}</span>
                      <span className="shrink-0 text-[11px] text-ink-500">clicks</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {/* 6 — The record: what happened, and what came out of it. Reference
             material rather than a daily read, so it sits below the numbers
             and the client list. */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <ActivityTimeline events={activity} />
        {recentReportsCard}
      </div>

      {/* 7 — Shortcuts, last: useful, never the headline. A plain link row
             rather than four cards — the sidebar already carries navigation, so
             these don't need card weight. */}
      <section aria-labelledby="qa-heading" className="border-t border-ink-100 pt-5">
        <h2 id="qa-heading" className="sr-only">Quick actions</h2>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          {quickActions.map((a) => {
            const Icon = a.icon;
            return (
              <Link
                key={a.label}
                href={a.href}
                className="inline-flex items-center gap-2 text-sm text-ink-600 transition-colors hover:text-ink-900"
              >
                <Icon size={15} className="text-ink-400" aria-hidden />
                {a.label}
              </Link>
            );
          })}
        </div>
      </section>
    </div>
  );
}
