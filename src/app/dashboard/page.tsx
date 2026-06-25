import Link from "next/link";
import { redirect } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import {
  Users, FileBarChart2, CalendarClock, Plus, Sparkles, Cable, Eye, Palette,
  Activity, HeartPulse, UserPlus, PlugZap, CheckCircle2, AlertCircle,
} from "lucide-react";
import { getCurrentUserAndAgency } from "@/lib/agency";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { OnboardingChecklist, type OnboardingStep } from "@/components/OnboardingChecklist";
import { SAMPLE_GSC } from "@/lib/sampleData";

export const dynamic = "force-dynamic";

type ClientWithSources = { id: string; name: string; created_at: string; data_sources: { type: string; created_at: string }[] | null };

export default async function DashboardPage() {
  const { user, agency } = await getCurrentUserAndAgency();
  if (!user || !agency) redirect("/login");

  const supabase = createClient();
  const [{ count: clientCount }, { count: reportCount }, { count: scheduleCount }, { data: clientsRaw }] = await Promise.all([
    supabase.from("clients").select("id", { count: "exact", head: true }).eq("archived", false),
    supabase.from("reports").select("id", { count: "exact", head: true }),
    supabase.from("report_schedules").select("id", { count: "exact", head: true }).eq("enabled", true),
    supabase.from("clients").select("id, name, created_at, data_sources(type, created_at)").eq("archived", false).order("created_at", { ascending: false }).limit(8),
  ]);

  const clients = (clientsRaw ?? []) as ClientWithSources[];
  const gscCount = clients.filter((c) => (c.data_sources ?? []).some((d) => d.type === "gsc")).length;

  const kpis = [
    { label: "Active clients", value: clientCount ?? 0, icon: Users, tint: "bg-brand-50 text-brand-600" },
    { label: "Reports generated", value: reportCount ?? 0, icon: FileBarChart2, tint: "bg-emerald-50 text-emerald-600" },
    { label: "Scheduled reports", value: scheduleCount ?? 0, icon: CalendarClock, tint: "bg-amber-50 text-amber-600" },
  ];

  const steps: OnboardingStep[] = [
    { label: "Add your first client", done: (clientCount ?? 0) > 0, href: "/dashboard/clients/new" },
    { label: "Connect Google Search Console", done: gscCount > 0, href: "/dashboard/clients" },
    { label: "Configure your branding", done: !!agency.logo_url || !!agency.contact_email, href: "/dashboard/settings" },
    { label: "Generate your first report", done: (reportCount ?? 0) > 0, href: "/dashboard/reports/preview" },
  ];

  const quickActions = [
    { label: "Add client", href: "/dashboard/clients/new", icon: Plus, tint: "bg-brand-50 text-brand-600" },
    { label: "Integrations", href: "/dashboard/integrations", icon: Cable, tint: "bg-emerald-50 text-emerald-600" },
    { label: "Preview report", href: "/dashboard/reports/preview", icon: Eye, tint: "bg-amber-50 text-amber-600" },
    { label: "Branding", href: "/dashboard/settings", icon: Palette, tint: "bg-sky-50 text-sky-600" },
  ];

  // Recent activity feed (clients added + integrations connected).
  const activity = [
    ...clients.map((c) => ({ kind: "client" as const, name: c.name, at: c.created_at })),
    ...clients.flatMap((c) => (c.data_sources ?? []).map((d) => ({ kind: "integration" as const, name: c.name, at: d.created_at }))),
  ]
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
    .slice(0, 6);

  return (
    <div className="space-y-8">
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

      {/* KPIs */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {kpis.map((k) => {
          const Icon = k.icon;
          return (
            <Card key={k.label} className="transition-shadow hover:shadow-md">
              <CardContent className="flex items-center gap-4 p-5">
                <div className={`flex h-11 w-11 items-center justify-center rounded-xl ${k.tint}`}><Icon size={20} /></div>
                <div>
                  <p className="text-sm text-ink-500">{k.label}</p>
                  <p className="text-2xl font-semibold text-ink-900">{k.value}</p>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Search performance — sample placeholder until a client connects GSC */}
      {gscCount === 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2"><Sparkles size={16} className="text-brand-500" /> Search performance</CardTitle>
              <Badge variant="muted">Sample data</Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                { l: "Clicks this month", v: SAMPLE_GSC.totals.clicks.toLocaleString() },
                { l: "Impressions", v: SAMPLE_GSC.totals.impressions.toLocaleString() },
                { l: "Avg CTR", v: `${(SAMPLE_GSC.totals.ctr * 100).toFixed(1)}%` },
                { l: "Avg position", v: SAMPLE_GSC.totals.position.toFixed(1) },
              ].map((m) => (
                <div key={m.l} className="rounded-xl border border-slate-100 bg-slate-50 p-4">
                  <p className="text-xs text-ink-500">{m.l}</p>
                  <p className="mt-1 text-2xl font-semibold text-brand-600">{m.v}</p>
                </div>
              ))}
            </div>
            <p className="mt-3 text-xs text-ink-400">
              These are example numbers. Connect a client&apos;s Google Search Console to see real performance here.
            </p>
          </CardContent>
        </Card>
      )}

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

      {/* Onboarding + spotlight */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2"><OnboardingChecklist steps={steps} /></div>
        <Card className="bg-gradient-to-br from-brand-500 to-brand-700 text-white">
          <CardContent className="flex h-full flex-col justify-between gap-4 p-6">
            <div>
              <Sparkles className="mb-3 h-6 w-6 opacity-90" />
              <p className="text-lg font-semibold">See a sample report</p>
              <p className="mt-1 text-sm text-white/80">Preview exactly what your branded client reports look like.</p>
            </div>
            <Button asChild variant="secondary" className="w-full bg-white text-brand-700 hover:bg-white/90">
              <Link href="/dashboard/reports/preview">Open preview</Link>
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Activity + Client health */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Activity size={16} className="text-brand-500" /> Recent activity</CardTitle></CardHeader>
          <CardContent>
            {activity.length === 0 ? (
              <p className="py-6 text-center text-sm text-ink-400">No activity yet — add a client to get started.</p>
            ) : (
              <ul className="space-y-3">
                {activity.map((a, i) => (
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
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2"><HeartPulse size={16} className="text-brand-500" /> Client health</CardTitle>
              <span className="text-xs text-ink-400">{gscCount}/{clients.length} connected</span>
            </div>
          </CardHeader>
          <CardContent>
            {clients.length === 0 ? (
              <p className="py-6 text-center text-sm text-ink-400">No clients yet.</p>
            ) : (
              <ul className="space-y-2">
                {clients.slice(0, 6).map((c) => {
                  const connected = (c.data_sources ?? []).length > 0;
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
    </div>
  );
}
