import Link from "next/link";
import { redirect } from "next/navigation";
import { formatDistanceToNow, format } from "date-fns";
import {
  FileBarChart2, Plus, Sparkles, Cable, Eye, Palette,
  Activity, HeartPulse, UserPlus, CheckCircle2, AlertCircle, Circle, PlugZap,
  Trophy, CalendarClock, TrendingUp, Target, ArrowRight,
} from "lucide-react";
import { getCurrentUserAndAgency } from "@/lib/agency";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { OnboardingChecklist, type OnboardingStep } from "@/components/OnboardingChecklist";
import { PerfKpiCard } from "@/components/PerfKpiCard";
import { SAMPLE_GSC } from "@/lib/sampleData";

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
  const [
    { count: clientCount }, { count: reportCount },
    { data: clientsRaw }, { data: snaps }, { data: gscSources },
    { data: reportsRaw }, { data: schedulesRaw },
  ] = await Promise.all([
    supabase.from("clients").select("id", { count: "exact", head: true }).eq("archived", false),
    supabase.from("reports").select("id", { count: "exact", head: true }),
    supabase.from("clients").select("id, name, created_at, data_sources(type, created_at)").eq("archived", false).order("created_at", { ascending: false }).limit(8),
    supabase.from("gsc_snapshots").select("data_source_id, data").eq("period_days", 28),
    supabase.from("data_sources").select("id, client_id, config, clients(name)").eq("type", "gsc"),
    supabase.from("reports").select("id, title, status, period_start, period_end, data, created_at, clients(name)").order("created_at", { ascending: false }).limit(5),
    supabase.from("report_schedules").select("id, frequency, next_run_at, template_key, clients(name)").eq("enabled", true).order("next_run_at", { ascending: true }).limit(5),
  ]);

  const clients = (clientsRaw ?? []) as ClientWithSources[];

  // Client connections — connected / pending / ready.
  const sources = (gscSources ?? []) as { id: string; client_id: string | null; config: { site_url?: string | null } | null; clients: JoinedName }[];
  const connectedIds = new Set(sources.map((s) => s.client_id).filter(Boolean));
  const connectedCount = connectedIds.size;
  const readyCount = new Set(sources.filter((s) => s.config?.site_url).map((s) => s.client_id)).size;
  const pendingCount = Math.max(0, (clientCount ?? 0) - connectedCount);

  // Performance — aggregate real cached metrics + daily series, else sample.
  const snapRows = (snaps ?? []) as { data_source_id: string; data: { totals: Day; byDate?: Day[] } }[];
  const hasReal = snapRows.length > 0;

  let series: Day[];
  let perf: { clicks: number; impressions: number; ctr: number; position: number };
  if (hasReal) {
    const byDate = new Map<string, { clicks: number; impressions: number; posW: number }>();
    let tClicks = 0, tImpr = 0, tPosW = 0;
    for (const s of snapRows) {
      const t = s.data?.totals;
      if (t) { tClicks += t.clicks; tImpr += t.impressions; tPosW += t.position * t.impressions; }
      for (const d of s.data?.byDate ?? []) {
        const e = byDate.get(d.date) ?? { clicks: 0, impressions: 0, posW: 0 };
        e.clicks += d.clicks; e.impressions += d.impressions; e.posW += d.position * d.impressions;
        byDate.set(d.date, e);
      }
    }
    series = Array.from(byDate.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([date, e]) => ({
      date, clicks: e.clicks, impressions: e.impressions,
      ctr: e.impressions ? e.clicks / e.impressions : 0,
      position: e.impressions ? e.posW / e.impressions : 0,
    }));
    perf = { clicks: tClicks, impressions: tImpr, ctr: tImpr ? tClicks / tImpr : 0, position: tImpr ? tPosW / tImpr : 0 };
  } else {
    series = SAMPLE_GSC.byDate;
    perf = SAMPLE_GSC.totals;
  }

  const clicksArr = series.map((d) => d.clicks);
  const imprArr = series.map((d) => d.impressions);
  const ctrArr = series.map((d) => d.ctr);
  const posArr = series.map((d) => d.position);
  const clicksT = trend(clicksArr), imprT = trend(imprArr), ctrT = trend(ctrArr), posT = trend(posArr, true);

  const perfCards = [
    { l: "Clicks", v: fmt(perf.clicks), icon: "clicks", color: "#4f46e5", arr: clicksArr, t: clicksT },
    { l: "Impressions", v: fmt(perf.impressions), icon: "impressions", color: "#0ea5e9", arr: imprArr, t: imprT },
    { l: "Avg CTR", v: `${(perf.ctr * 100).toFixed(1)}%`, icon: "ctr", color: "#10b981", arr: ctrArr, t: ctrT },
    { l: "Avg position", v: perf.position.toFixed(1), icon: "position", color: "#f59e0b", arr: posArr, t: posT },
  ];

  const steps: OnboardingStep[] = [
    { label: "Add your first client", done: (clientCount ?? 0) > 0, href: "/dashboard/clients/new" },
    { label: "Connect Google Search Console", done: connectedCount > 0, href: "/dashboard/clients" },
    { label: "Configure your branding", done: !!agency.logo_url || !!agency.contact_email, href: "/dashboard/settings" },
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
    const t = sn.data?.totals;
    if (!src || !src.client_id || !t) continue;
    const e = perClient.get(src.client_id) ?? { name: nameOf(src.clients), clicks: 0, impressions: 0 };
    e.clicks += t.clicks; e.impressions += t.impressions;
    perClient.set(src.client_id, e);
  }
  const topClients = Array.from(perClient.entries()).map(([id, v]) => ({ id, ...v })).sort((a, b) => b.clicks - a.clicks).slice(0, 5);

  const reports = (reportsRaw ?? []) as { id: string; title: string; status: string; period_start: string | null; period_end: string | null; data: { totals?: Day } | null; created_at: string; clients: JoinedName }[];
  const latest = reports.find((r) => r.status === "ready") ?? reports[0];
  const schedules = (schedulesRaw ?? []) as { id: string; frequency: string; next_run_at: string; template_key: string; clients: JoinedName }[];

  const quickActions = [
    { label: "Add client", href: "/dashboard/clients/new", icon: Plus, tint: "bg-brand-50 text-brand-600" },
    { label: "Integrations", href: "/dashboard/integrations", icon: Cable, tint: "bg-emerald-50 text-emerald-600" },
    { label: "Preview report", href: "/dashboard/reports/preview", icon: Eye, tint: "bg-amber-50 text-amber-600" },
    { label: "Branding", href: "/dashboard/settings", icon: Palette, tint: "bg-sky-50 text-sky-600" },
  ];

  const realActivity = [
    ...clients.map((c) => ({ kind: "client" as const, name: c.name, at: c.created_at })),
    ...clients.flatMap((c) => (c.data_sources ?? []).map((d) => ({ kind: "integration" as const, name: c.name, at: d.created_at }))),
  ].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime()).slice(0, 6);

  const onboardingEvents = [
    { icon: Sparkles, tint: "bg-brand-50 text-brand-600", text: <>Welcome to <span className="font-medium">ReportFlow</span> — your workspace is ready</>, href: "/dashboard", tag: "" },
    ...steps.filter((s) => s.done).map((s) => ({ icon: CheckCircle2, tint: "bg-emerald-50 text-emerald-600", text: <>Completed: <span className="font-medium">{s.label}</span></>, href: s.href, tag: "" })),
    ...(nextStep ? [{ icon: Circle, tint: "bg-brand-50 text-brand-600", text: <>Recommended next: <span className="font-medium">{nextStep.label}</span></>, href: nextStep.href, tag: "Next" }] : []),
  ];

  const pctText = (t: { pct: number | null }) => (t.pct === null ? "steady" : `${t.pct < 0 ? "down" : "up"} ${Math.abs(t.pct).toFixed(0)}%`);

  // AI insights — real, multi-line analysis in active mode; connect prompt otherwise.
  const aiInsightsCard = (
    <Card className="h-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Sparkles size={16} className="text-brand-500" /> AI insights</CardTitle>
        <CardDescription>Plain-English analysis, generated automatically for every report.</CardDescription>
      </CardHeader>
      <CardContent>
        {hasReal ? (
          <ul className="space-y-2.5">
            <li className="flex gap-2 text-sm text-ink-700">
              <TrendingUp size={15} className="mt-0.5 flex-shrink-0 text-brand-500" />
              <span><span className="font-medium text-ink-900">Traffic:</span> organic clicks are {pctText(clicksT)} and impressions {pctText(imprT)} over the last 28 days.</span>
            </li>
            <li className="flex gap-2 text-sm text-ink-700">
              <Activity size={15} className="mt-0.5 flex-shrink-0 text-emerald-500" />
              <span><span className="font-medium text-ink-900">Engagement:</span> click-through rate is {pctText(ctrT)} at an average position of {perf.position.toFixed(1)}.</span>
            </li>
            <li className="flex gap-2 text-sm text-ink-700">
              <Target size={15} className="mt-0.5 flex-shrink-0 text-amber-500" />
              <span><span className="font-medium text-ink-900">Opportunity:</span> queries ranking on page two are the fastest path to more clicks.</span>
            </li>
            <li className="flex gap-2 text-sm text-ink-700">
              <Sparkles size={15} className="mt-0.5 flex-shrink-0 text-brand-500" />
              <span><span className="font-medium text-ink-900">Recommendation:</span> refresh the titles &amp; meta on your highest-impression pages to lift CTR next month.</span>
            </li>
          </ul>
        ) : (
          <>
            <p className="text-sm text-ink-700">Connect Google Search Console to receive automated AI insights — traffic summaries, trends, and the opportunities to act on.</p>
            <p className="mt-3 rounded-lg border border-slate-100 bg-slate-50 p-3 text-sm italic leading-relaxed text-ink-500">
              Example: “Organic clicks up 18% this month, led by ‘best running shoes’. Next: optimise ‘carbon plate shoes’ (pos 6.8) to break onto page one.”
            </p>
            <Button asChild size="sm" variant="outline" className="mt-3"><Link href="/dashboard/clients"><PlugZap size={15} /> Connect Search Console</Link></Button>
          </>
        )}
      </CardContent>
    </Card>
  );

  const healthStats = [
    { l: "Connected", v: connectedCount, icon: CheckCircle2, tint: "text-emerald-600" },
    { l: "Pending setup", v: pendingCount, icon: AlertCircle, tint: "text-amber-600" },
    { l: "Ready to report", v: readyCount, icon: FileBarChart2, tint: "text-brand-600" },
  ];

  // Performance section — shared, with a results caption in active mode.
  const performanceSection = (
    <section>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-ink-700">Performance overview</h2>
          <span className="text-xs text-ink-400">· last 28 days</span>
          {!hasReal && <Badge variant="muted">Sample data</Badge>}
        </div>
        {!hasReal && (
          <Button asChild size="sm" variant="outline">
            <Link href="/dashboard/clients"><PlugZap size={15} /> Connect Search Console</Link>
          </Button>
        )}
      </div>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {perfCards.map((k) => (
          <PerfKpiCard key={k.l} label={k.l} value={k.v} deltaPct={k.t.pct} good={k.t.good} color={k.color} data={k.arr} icon={k.icon} />
        ))}
      </div>
      {hasReal ? (
        <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-500">
          <span className="inline-flex items-center gap-1 font-medium text-emerald-600"><CheckCircle2 size={13} /> Win:</span>
          clicks are {pctText(clicksT)} vs the prior period.
          <span className="inline-flex items-center gap-1 font-medium text-amber-600"><Target size={13} /> Opportunity:</span>
          average position {perf.position.toFixed(1)} — focus on page-two queries to climb.
        </p>
      ) : (
        <p className="mt-2 text-xs text-ink-400">Example numbers — connect a client&apos;s Google Search Console to see real performance here.</p>
      )}
    </section>
  );

  return (
    <div className="space-y-6">
      {/* Welcome */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-ink-500">Welcome back 👋</p>
          <h1 className="mt-0.5 text-2xl font-semibold tracking-tight text-ink-900">{agency.name}</h1>
        </div>
        <Button asChild className="hidden sm:inline-flex">
          <Link href="/dashboard/clients/new"><Plus size={18} /> Add client</Link>
        </Button>
      </div>

      {performanceSection}

      {!activeMode ? (
        /* ───────────── New-user mode: onboarding-focused ───────────── */
        <>
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <div className="lg:col-span-2"><OnboardingChecklist steps={steps} /></div>
            {aiInsightsCard}
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {quickActions.map((a) => {
              const Icon = a.icon;
              return (
                <Link key={a.label} href={a.href}>
                  <Card className="transition-all hover:-translate-y-0.5 hover:shadow-md">
                    <CardContent className="flex items-center gap-3 p-4">
                      <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${a.tint}`}><Icon size={17} /></div>
                      <span className="text-sm font-medium text-ink-800">{a.label}</span>
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2"><Activity size={16} className="text-brand-500" /> Recent activity</CardTitle></CardHeader>
              <CardContent>
                {realActivity.length > 0 ? (
                  <ul className="space-y-3">
                    {realActivity.map((a, i) => (
                      <li key={i} className="flex items-center gap-3">
                        <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${a.kind === "client" ? "bg-brand-50 text-brand-600" : "bg-emerald-50 text-emerald-600"}`}>
                          {a.kind === "client" ? <UserPlus size={15} /> : <PlugZap size={15} />}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm text-ink-800">
                            {a.kind === "client" ? <>Added client <span className="font-medium">{a.name}</span></> : <>Connected a source for <span className="font-medium">{a.name}</span></>}
                          </p>
                        </div>
                        <span className="flex-shrink-0 text-xs text-ink-400">{formatDistanceToNow(new Date(a.at), { addSuffix: true })}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <ul className="space-y-1">
                    {onboardingEvents.map((e, i) => {
                      const Icon = e.icon;
                      return (
                        <li key={i}>
                          <Link href={e.href} className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-slate-50">
                            <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${e.tint}`}><Icon size={15} /></div>
                            <span className="min-w-0 flex-1 truncate text-sm text-ink-700">{e.text}</span>
                            {e.tag && <span className="rounded-full bg-brand-500 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">{e.tag}</span>}
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2"><HeartPulse size={16} className="text-brand-500" /> Client health</CardTitle></CardHeader>
              <CardContent>
                <div className="mb-4 grid grid-cols-3 gap-2">
                  {healthStats.map((s) => {
                    const Icon = s.icon;
                    return (
                      <div key={s.l} className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                        <Icon size={15} className={s.tint} />
                        <p className="mt-1.5 text-xl font-semibold leading-tight text-ink-900">{s.v}</p>
                        <p className="text-[11px] leading-tight text-ink-500">{s.l}</p>
                      </div>
                    );
                  })}
                </div>
                {clients.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-slate-200 p-4 text-center">
                    <p className="text-sm text-ink-500">Add a client to start tracking performance.</p>
                    <Button asChild size="sm" variant="outline" className="mt-2"><Link href="/dashboard/clients/new"><Plus size={14} /> Add your first client</Link></Button>
                  </div>
                ) : (
                  <ul className="space-y-1">
                    {clients.slice(0, 5).map((c) => {
                      const connected = (c.data_sources ?? []).some((d) => d.type === "gsc");
                      return (
                        <li key={c.id}>
                          <Link href={`/dashboard/clients/${c.id}`} className="flex items-center justify-between rounded-lg px-2 py-2 hover:bg-slate-50">
                            <span className="truncate text-sm font-medium text-ink-800">{c.name}</span>
                            {connected ? (
                              <Badge variant="success"><CheckCircle2 size={12} className="mr-1" /> Connected</Badge>
                            ) : (
                              <Badge variant="warning"><AlertCircle size={12} className="mr-1" /> Needs setup</Badge>
                            )}
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Sample report — modest, below analytics */}
          <Card>
            <CardContent className="flex flex-wrap items-center justify-between gap-3 p-5">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-50 text-brand-600"><Eye size={18} /></div>
                <div>
                  <p className="font-medium text-ink-900">See a sample report</p>
                  <p className="text-sm text-ink-500">Preview a branded client report with your logo and colours.</p>
                </div>
              </div>
              <Button asChild variant="outline"><Link href="/dashboard/reports/preview">Open preview</Link></Button>
            </CardContent>
          </Card>
        </>
      ) : (
        /* ───────────── Active mode: reporting-focused ───────────── */
        <>
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <div className="lg:col-span-2">{aiInsightsCard}</div>
            {/* Latest report thumbnail */}
            <Card className="overflow-hidden">
              <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-sm"><Eye size={15} className="text-brand-500" /> Latest report</CardTitle></CardHeader>
              <CardContent>
                {latest ? (
                  <Link href={`/dashboard/reports/${latest.id}`} className="group block overflow-hidden rounded-xl border border-slate-200">
                    <div className="bg-gradient-to-br from-brand-500 to-brand-700 px-4 py-4 text-white">
                      <p className="text-[10px] uppercase tracking-wide opacity-80">{agency.name}</p>
                      <p className="mt-1 line-clamp-2 text-sm font-semibold">{latest.title}</p>
                      <p className="mt-0.5 text-[11px] opacity-80">{nameOf(latest.clients)}{latest.period_end ? ` · ${format(new Date(latest.period_end), "MMM d")}` : ""}</p>
                    </div>
                    <div className="grid grid-cols-2 gap-2 bg-white p-3">
                      <div className="rounded-lg bg-slate-50 p-2">
                        <p className="text-[10px] text-ink-500">Clicks</p>
                        <p className="text-sm font-semibold text-ink-900">{fmt(latest.data?.totals?.clicks ?? 0)}</p>
                      </div>
                      <div className="rounded-lg bg-slate-50 p-2">
                        <p className="text-[10px] text-ink-500">Impressions</p>
                        <p className="text-sm font-semibold text-ink-900">{fmt(latest.data?.totals?.impressions ?? 0)}</p>
                      </div>
                    </div>
                    <p className="flex items-center gap-1 bg-white px-3 pb-3 text-xs font-medium text-brand-600 group-hover:gap-2">Open report <ArrowRight size={13} /></p>
                  </Link>
                ) : (
                  <div className="rounded-lg border border-dashed border-slate-200 p-4 text-center text-sm text-ink-500">
                    No reports yet.
                    <Button asChild size="sm" variant="outline" className="mt-2 w-full"><Link href="/dashboard/clients">Generate a report</Link></Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* Top performing clients */}
            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2"><Trophy size={16} className="text-brand-500" /> Top performing clients</CardTitle></CardHeader>
              <CardContent>
                {topClients.length === 0 ? (
                  <p className="py-6 text-center text-sm text-ink-400">Connect a client&apos;s Search Console to rank performance.</p>
                ) : (
                  <ul className="space-y-1">
                    {topClients.map((c, i) => (
                      <li key={c.id}>
                        <Link href={`/dashboard/clients/${c.id}`} className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-slate-50">
                          <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-brand-50 text-xs font-semibold text-brand-600">{i + 1}</span>
                          <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink-800">{c.name}</span>
                          <span className="flex-shrink-0 text-sm font-semibold text-ink-900">{fmt(c.clicks)}</span>
                          <span className="flex-shrink-0 text-[11px] text-ink-400">clicks</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            {/* Recent reports */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2"><FileBarChart2 size={16} className="text-brand-500" /> Recent reports</CardTitle>
                  <Link href="/dashboard/reports" className="text-xs text-brand-600 hover:underline">View all</Link>
                </div>
              </CardHeader>
              <CardContent>
                {reports.length === 0 ? (
                  <p className="py-6 text-center text-sm text-ink-400">No reports generated yet.</p>
                ) : (
                  <ul className="space-y-1">
                    {reports.map((r) => (
                      <li key={r.id}>
                        <Link href={`/dashboard/reports/${r.id}`} className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-slate-50">
                          <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600"><FileBarChart2 size={15} /></div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-ink-800">{r.title}</p>
                            <p className="truncate text-[11px] text-ink-500">{nameOf(r.clients)} · {format(new Date(r.created_at), "MMM d, yyyy")}</p>
                          </div>
                          <Badge variant={r.status === "ready" ? "success" : "muted"}>{r.status}</Badge>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Upcoming scheduled reports */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2"><CalendarClock size={16} className="text-brand-500" /> Upcoming scheduled reports</CardTitle>
                <Badge variant="muted">{schedules.length}</Badge>
              </div>
            </CardHeader>
            <CardContent>
              {schedules.length === 0 ? (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-dashed border-slate-200 p-4">
                  <p className="text-sm text-ink-500">No scheduled reports yet — automate delivery so clients get reports without you lifting a finger.</p>
                  <Button asChild size="sm" variant="outline"><Link href="/dashboard/clients">Set up a schedule</Link></Button>
                </div>
              ) : (
                <ul className="space-y-1">
                  {schedules.map((s) => (
                    <li key={s.id} className="flex items-center gap-3 rounded-lg px-2 py-2">
                      <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-600"><CalendarClock size={15} /></div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-ink-800">{nameOf(s.clients)} · <span className="capitalize">{s.frequency}</span></p>
                        <p className="text-[11px] text-ink-500">Next: {format(new Date(s.next_run_at), "MMM d, yyyy")}</p>
                      </div>
                      <Badge variant="success">Active</Badge>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          {/* Quick actions */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {quickActions.map((a) => {
              const Icon = a.icon;
              return (
                <Link key={a.label} href={a.href}>
                  <Card className="transition-all hover:-translate-y-0.5 hover:shadow-md">
                    <CardContent className="flex items-center gap-3 p-4">
                      <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${a.tint}`}><Icon size={17} /></div>
                      <span className="text-sm font-medium text-ink-800">{a.label}</span>
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
