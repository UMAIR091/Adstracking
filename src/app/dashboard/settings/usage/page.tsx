import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, Gauge, Plug, CalendarClock, FileText, RefreshCw, Sparkles } from "lucide-react";
import { getCurrentUserAndAgency } from "@/lib/agency";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceUsage } from "@/lib/usage";
import { Card, CardContent } from "@/components/ui/card";

export const dynamic = "force-dynamic";

const fmt = (n: number) => n.toLocaleString();

function Stat({
  label, value, sub, icon: Icon,
}: {
  label: string;
  value: string;
  sub: string;
  icon: typeof Plug;
}) {
  return (
    <Card>
      <CardContent className="p-5">
        <p className="flex items-center gap-2 text-sm text-ink-500">
          <Icon size={15} className="text-ink-400" /> {label}
        </p>
        <p className="mt-2 text-3xl font-semibold tracking-tight text-ink-900">{value}</p>
        <p className="mt-1 text-xs text-ink-400">{sub}</p>
      </CardContent>
    </Card>
  );
}

export default async function UsagePage() {
  const { user, agency } = await getCurrentUserAndAgency();
  if (!user || !agency) redirect("/login");

  const supabase = createClient();
  const usage = await getWorkspaceUsage(supabase, agency.id);

  const monthLabel = new Date(`${usage.periodMonth}T00:00:00Z`).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

  return (
    <div>
      <Link href="/dashboard/settings" className="inline-flex items-center gap-1 text-sm text-ink-500 hover:text-ink-700">
        <ArrowLeft size={15} /> Back to settings
      </Link>
      <div className="mb-6 mt-3 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-sky-50 text-sky-600">
          <Gauge size={18} />
        </div>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink-900">Usage</h1>
          <p className="text-sm text-ink-500">Your workspace's activity — connected sources now, and metered activity for {monthLabel}.</p>
        </div>
      </div>

      <h2 className="mb-3 text-sm font-medium text-ink-700">Current</h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Stat label="Connected integrations" value={fmt(usage.connectedIntegrations)} sub="Across all clients" icon={Plug} />
        <Stat label="Scheduled reports" value={fmt(usage.scheduledReports)} sub="Active recurring schedules" icon={CalendarClock} />
      </div>

      <h2 className="mb-3 mt-8 text-sm font-medium text-ink-700">This month · {monthLabel}</h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat label="Reports generated" value={fmt(usage.reportsGenerated)} sub="Manual + scheduled" icon={FileText} />
        <Stat label="Sync executions" value={fmt(usage.syncExecutions)} sub="Data refreshes run" icon={RefreshCw} />
        <Stat label="AI summaries" value={fmt(usage.aiSummaries)} sub="AI-written report insights" icon={Sparkles} />
      </div>

      <p className="mt-6 text-xs text-ink-400">
        Monthly figures reset at the start of each calendar month (UTC). These metrics are what upcoming plan limits will be measured against.
      </p>
    </div>
  );
}
