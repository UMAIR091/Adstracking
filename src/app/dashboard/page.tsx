import Link from "next/link";
import { redirect } from "next/navigation";
import { format } from "date-fns";
import {
  FileBarChart2, Plus, Cable, Eye, Palette,
  HeartPulse, CheckCircle2, AlertCircle, PlugZap,
  Trophy, ArrowRight, Users,
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
import { ActivityTimeline } from "@/components/dashboard/ActivityTimeline";
import { NextScheduled, type NextScheduledData } from "@/components/dashboard/NextScheduled";
import { AiPanel, type Recommendation } from "@/components/dashboard/AiPanel";
import { buildActivity } from "@/lib/dashboard/activity";
import { getIntegrationName } from "@/lib/integrations/names";
import { getIntegrationHealthCached, summarize } from "@/lib/integrationHealth";

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
    supabase.from("gsc_snapshots").select("data_source_id, totals:data->totals, series:data->byDate").eq("period_days", 28),
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
  const snapRows = (snaps ?? []) as { data_source_id: string; totals: Day | null; series: Day[] | null }[];

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
    { l: "Clicks", v: fmt(perf.clicks), icon: "clicks", color: "#4f46e5", arr: clicksArr, t: clicksT,
      why: "Visits earned from Google search results." },
    { l: "Impressions", v: fmt(perf.impressions), icon: "impressions", color: "#0ea5e9", arr: imprArr, t: imprT,
      why: "How often your pages appeared in results." },
    { l: "Avg CTR", v: `${(perf.ctr * 100).toFixed(1)}%`, icon: "ctr", color: "#10b981", arr: ctrArr, t: ctrT,
      why: "Share of impressions that became clicks." },
    { l: "Avg position", v: perf.position.toFixed(1), icon: "position", color: "#f59e0b", arr: posArr, t: posT,
      why: "Average ranking. Lower is better." },
  ];

  const steps: OnboardingStep[] = [
    { label: "Add your first client", done: (clientCount ?? 0) > 0, href: "/dashboard/clients/new" },
    { label: "Connect Google Search Console", done: connectedCount > 0, href: "/dashboard/clients" },
    { label: "Add your logo & branding", done: !!agency.logo_url, href: "/dashboard/settings" },
    { label: "Generate your first report", done: (reportCount ?? 0) > 0, href: "/dashboard/reports/preview" },
  ];
  const nextStep = steps.find((s) => !s.done);

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
  const latest = reports.find((r) => r.status === "ready") ?? reports[0];
  const schedules = (schedulesRaw ?? []) as { id: string; client_id: string | null; frequency: string; next_run_at: string; template_key: string; clients: JoinedName }[];
  const emails = (emailsRaw ?? []) as { report_id: string | null; to_email: string; status: string; sent_at: string; error: string | null; source: string | null }[];

  // ── Latest sync status ───────────────────────────────────────
  // The most recent successful sync across every source, plus how many are
  // currently failing. Both are facts already stored on data_sources.
  const syncedTimes = everySource.map((s) => s.last_synced_at).filter((t): t is string => Boolean(t));
  const lastSyncAt = syncedTimes.length ? syncedTimes.sort((a, b) => b.localeCompare(a))[0] : null;
  const failingSyncs = everySource.filter((s) => s.last_sync_error).length;

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
      hint: health.errored + health.needsReconnect > 0 ? `${health.errored + health.needsReconnect} need attention` : "Connected and reporting",
      icon: "cable",
      tone: health.errored + health.needsReconnect > 0 ? "warning" : health.total > 0 ? "positive" : "neutral",
      href: "/dashboard/integrations",
    },
  ];

  // ── AI recommendations ───────────────────────────────────────
  // Derived strictly from the aggregated numbers above. Each one states the
  // observation and the action, which is what makes it a recommendation rather
  // than a restated metric.
  const pctText = (t: { pct: number | null }) => (t.pct === null ? "steady" : `${t.pct < 0 ? "down" : "up"} ${Math.abs(t.pct).toFixed(0)}%`);
  const recommendations: Recommendation[] = hasReal
    ? [
        {
          kind: clicksT.good ? "win" : "risk",
          headline: `Organic clicks are ${pctText(clicksT)}`,
          body: clicksT.good
            ? `Clicks rose against the previous ${halfDays} days on ${fmt(perf.impressions)} impressions. Lead your next report with this.`
            : `Clicks fell against the previous ${halfDays} days. Check whether impressions held — if they did, the issue is CTR, not visibility.`,
          href: "/dashboard/reports",
          cta: "Review reports",
        },
        {
          kind: "opportunity",
          headline: `Average position is ${perf.position.toFixed(1)}`,
          body:
            perf.position > 10
              ? "Most queries sit on page two. The fastest wins are pages ranking 11–20 — small on-page work often moves them up."
              : "You are ranking on page one on average. Push CTR with stronger titles and descriptions to convert existing impressions.",
          href: "/dashboard/clients",
          cta: "Open clients",
        },
        {
          kind: failingSyncs > 0 ? "risk" : "win",
          headline: failingSyncs > 0 ? `${failingSyncs} source${failingSyncs === 1 ? "" : "s"} failing to sync` : "All data sources are healthy",
          body:
            failingSyncs > 0
              ? "Reports built on a stale sync understate performance. Reconnect the affected sources before your next send."
              : `Every connected source synced cleanly${lastSyncAt ? `, most recently ${format(new Date(lastSyncAt), "d MMM 'at' HH:mm")}` : ""}. Your reports are current.`,
          href: "/dashboard/settings/health",
          cta: "View health",
        },
      ]
    : [];

  const quickActions = [
    { label: "Add client", href: "/dashboard/clients/new", icon: Plus, tint: "bg-brand-50 text-brand-600" },
    { label: "Integrations", href: "/dashboard/integrations", icon: Cable, tint: "bg-emerald-50 text-emerald-600" },
    { label: "Preview report", href: "/dashboard/reports/preview", icon: Eye, tint: "bg-amber-50 text-amber-600" },
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
    const [rep, syncedSrc, failedSrc, schedToday] = await Promise.all([
      supabase.from("reports").select("id", { count: "exact", head: true }).gt("created_at", lastSeen),
      supabase.from("data_sources").select("id", { count: "exact", head: true }).gt("last_synced_at", lastSeen),
      supabase.from("data_sources").select("id", { count: "exact", head: true }).in("status", ["error", "revoked"]),
      supabase.from("report_schedules").select("id", { count: "exact", head: true }).eq("enabled", true).gte("next_run_at", todayStart.toISOString()).lte("next_run_at", todayEnd.toISOString()),
    ]);
    const d: WelcomeBackData = {
      lastSeen,
      reportsSent: rep.count ?? 0,
      syncedSources: syncedSrc.count ?? 0,
      failedSyncs: failedSrc.count ?? 0,
      schedulesToday: schedToday.count ?? 0,
    };
    // Only show if there's something worth saying.
    if (d.reportsSent || d.syncedSources || d.failedSyncs || d.schedulesToday) welcomeBack = d;
  }
  // Stamp last-seen for next visit. Awaited so it reliably persists (an
  // un-awaited promise in a Server Component can be dropped before it settles).
  await supabase.from("agencies").update({ last_seen_at: new Date().toISOString() }).eq("id", agency.id);

  const healthStats = [
    { l: "Connected", v: connectedCount, icon: CheckCircle2, tint: "text-emerald-600" },
    { l: "Pending setup", v: pendingCount, icon: AlertCircle, tint: "text-amber-600" },
    { l: "Ready to report", v: readyCount, icon: FileBarChart2, tint: "text-brand-600" },
  ];

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
              <Users size={16} className="text-brand-500" aria-hidden /> Recent client activity
            </CardTitle>
            <CardDescription>Who you added most recently, and whether they are reporting yet.</CardDescription>
          </div>
          <Link href="/dashboard/clients" className="shrink-0 text-xs font-medium text-brand-600 hover:underline">View all</Link>
        </div>
      </CardHeader>
      <CardContent>
        <div className="mb-4 grid grid-cols-3 gap-2">
          {healthStats.map((s) => {
            const Icon = s.icon;
            return (
              <div key={s.l} className="rounded-xl border border-ink-100 bg-surface-muted/50 p-3">
                <Icon size={15} className={s.tint} aria-hidden />
                <p className="mt-1.5 text-xl font-semibold leading-none tabular-nums text-ink-900">{s.v}</p>
                <p className="mt-1 text-[11px] leading-tight text-ink-500">{s.l}</p>
              </div>
            );
          })}
        </div>
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
            {clients.slice(0, 5).map((c) => {
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

      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-ink-500">Welcome back 👋</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-ink-900 sm:text-3xl">{agency.name}</h1>
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

      {/* 2 — What the numbers mean, and what goes out next. */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2"><AiPanel recommendations={recommendations} connected={hasReal} /></div>
        <NextScheduled data={nextScheduled} />
      </div>

      {/* 3 — The metrics themselves. */}
      {performanceSection}

      {/* 4 — Onboarding stays first-class until the workspace is actually live. */}
      {!activeMode && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2"><OnboardingChecklist steps={steps} /></div>
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
              <Button asChild variant="outline" className="mt-4"><Link href="/dashboard/reports/preview">Open preview</Link></Button>
            </CardContent>
          </Card>
        </div>
      )}

      {/* 5 — What happened, and what came out of it. */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <ActivityTimeline events={activity} />
        {recentReportsCard}
      </div>

      {/* 6 — Client-level detail. */}
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

      {/* 7 — Latest report + integration health, side by side. */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="h-full lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><HeartPulse size={16} className="text-brand-500" aria-hidden /> Integration health</CardTitle>
            <CardDescription>Every connected source, and whether it is still delivering data.</CardDescription>
          </CardHeader>
          <CardContent>
            {health.total === 0 ? (
              <div className="rounded-xl border border-dashed border-ink-200 p-5">
                <p className="text-sm font-medium text-ink-800">Nothing connected yet</p>
                <p className="mt-1 text-sm leading-relaxed text-ink-500">
                  Connect Search Console, Analytics or an ad platform and ReportFlow keeps the data fresh in the
                  background — so a report is always one click away.
                </p>
                <Button asChild size="sm" variant="outline" className="mt-4">
                  <Link href="/dashboard/integrations"><Cable size={14} aria-hidden /> Browse integrations</Link>
                </Button>
              </div>
            ) : (
              <Link href="/dashboard/settings/health" className="-mx-2 flex flex-wrap items-center justify-between gap-4 rounded-lg px-2 py-2 transition-colors hover:bg-surface-muted">
                <p className="text-sm text-ink-600">{health.total} connected data source{health.total === 1 ? "" : "s"}</p>
                <div className="flex flex-wrap items-center gap-4 text-sm">
                  <span className="inline-flex items-center gap-1.5 text-ink-600"><CheckCircle2 size={15} className="text-emerald-500" aria-hidden /> {health.connected} healthy</span>
                  {health.errored > 0 && <span className="inline-flex items-center gap-1.5 text-rose-600"><AlertCircle size={15} aria-hidden /> {health.errored} error{health.errored === 1 ? "" : "s"}</span>}
                  {health.needsReconnect > 0 && <span className="inline-flex items-center gap-1.5 text-amber-600"><PlugZap size={15} aria-hidden /> {health.needsReconnect} need reconnect</span>}
                  <ArrowRight size={16} className="text-ink-400" aria-hidden />
                </div>
              </Link>
            )}
          </CardContent>
        </Card>

        <Card className="h-full overflow-hidden">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm"><Eye size={15} className="text-brand-500" aria-hidden /> Latest report</CardTitle>
          </CardHeader>
          <CardContent>
            {latest ? (
              <Link href={`/dashboard/reports/${latest.id}`} className="group block overflow-hidden rounded-xl border border-ink-200">
                <div className="bg-gradient-to-br from-brand-500 to-brand-700 px-4 py-4 text-white">
                  <p className="text-[10px] uppercase tracking-wide opacity-80">{agency.name}</p>
                  <p className="mt-1 line-clamp-2 text-sm font-semibold">{latest.title}</p>
                  <p className="mt-0.5 text-[11px] opacity-80">{nameOf(latest.clients)}{latest.period_end ? ` · ${format(new Date(latest.period_end), "d MMM")}` : ""}</p>
                </div>
                <div className="grid grid-cols-2 gap-2 bg-white p-3">
                  <div className="rounded-lg bg-surface-muted p-2">
                    <p className="text-[10px] text-ink-500">Clicks</p>
                    <p className="text-sm font-semibold tabular-nums text-ink-900">{fmt(latest.data?.totals?.clicks ?? 0)}</p>
                  </div>
                  <div className="rounded-lg bg-surface-muted p-2">
                    <p className="text-[10px] text-ink-500">Impressions</p>
                    <p className="text-sm font-semibold tabular-nums text-ink-900">{fmt(latest.data?.totals?.impressions ?? 0)}</p>
                  </div>
                </div>
                <p className="flex items-center gap-1 bg-white px-3 pb-3 text-xs font-medium text-brand-600 group-hover:gap-2">Open report <ArrowRight size={13} aria-hidden /></p>
              </Link>
            ) : (
              <div className="rounded-xl border border-dashed border-ink-200 p-4">
                <p className="text-sm font-medium text-ink-800">No report yet</p>
                <p className="mt-1 text-xs leading-relaxed text-ink-500">Your most recent report previews here once you generate one.</p>
                <Button asChild size="sm" variant="outline" className="mt-3 w-full"><Link href="/dashboard/clients">Generate a report</Link></Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* 8 — Shortcuts, last: useful, never the headline. */}
      <section aria-labelledby="qa-heading">
        <h2 id="qa-heading" className="mb-3 text-sm font-semibold text-ink-700">Quick actions</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {quickActions.map((a) => {
            const Icon = a.icon;
            return (
              <Link key={a.label} href={a.href}>
                <Card className="transition-all hover:-translate-y-0.5 hover:shadow-md">
                  <CardContent className="flex items-center gap-3 p-4">
                    <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${a.tint}`}><Icon size={17} aria-hidden /></div>
                    <span className="text-sm font-medium text-ink-800">{a.label}</span>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      </section>
    </div>
  );
}
