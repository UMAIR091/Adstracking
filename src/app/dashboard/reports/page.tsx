import Link from "next/link";
import { redirect } from "next/navigation";
import { format } from "date-fns";
import { Eye, CalendarClock, ArrowRight, Send } from "lucide-react";
import { getCurrentUserAndAgency } from "@/lib/agency";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ReportsBrowser, type ReportRow, type ClientOption } from "@/components/ReportsBrowser";

export const dynamic = "force-dynamic";

const PAGE = 20;

type JoinedName = { name: string | null } | { name: string | null }[] | null;
const nameOf = (c: JoinedName) => (Array.isArray(c) ? c[0]?.name : c?.name) ?? "Client";

export default async function ReportsPage() {
  const { user } = await getCurrentUserAndAgency();
  if (!user) redirect("/login");

  const supabase = createClient();
  // First page only (perf audit P1) + the client list for the filter dropdown
  // + active schedules. Fetch one extra report to know whether "Load more" is
  // needed.
  const [{ data: reports }, { data: clientRows }, { data: scheduleRows }] = await Promise.all([
    supabase
      .from("reports")
      .select("id, title, status, period_start, period_end, created_at, share_token, clients(name)")
      .order("created_at", { ascending: false })
      .range(0, PAGE),
    supabase.from("clients").select("id, name").eq("archived", false).order("name"),
    supabase
      .from("report_schedules")
      .select("id, client_id, frequency, next_run_at, clients(name)")
      .eq("enabled", true)
      .order("next_run_at", { ascending: true })
      .limit(4),
  ]);

  const all = reports ?? [];
  const hasMore = all.length > PAGE;
  const page = all.slice(0, PAGE);

  // Delivery counts for the first page, matching what /api/reports/list returns
  // so the indicator doesn't pop in only after the first filter change.
  const ids = page.map((r) => r.id as string);
  const deliveries = new Map<string, { sent: number; failed: number }>();
  if (ids.length) {
    const { data: logs } = await supabase.from("email_logs").select("report_id, status").in("report_id", ids);
    for (const l of logs ?? []) {
      const key = l.report_id as string;
      const e = deliveries.get(key) ?? { sent: 0, failed: 0 };
      if (l.status === "failed" || l.status === "bounced") e.failed++;
      else if (l.status !== "pending") e.sent++;
      deliveries.set(key, e);
    }
  }

  const rows: ReportRow[] = page.map((r) => {
    const d = deliveries.get(r.id as string);
    return {
      id: r.id as string,
      title: r.title as string,
      status: r.status as string,
      period_start: (r.period_start as string | null) ?? null,
      period_end: (r.period_end as string | null) ?? null,
      created_at: r.created_at as string,
      share_token: (r.share_token as string | null) ?? null,
      clientName: nameOf(r.clients as JoinedName),
      sentCount: d?.sent ?? 0,
      failedCount: d?.failed ?? 0,
    };
  });

  const clients: ClientOption[] = (clientRows ?? []).map((c) => ({ id: c.id as string, name: (c.name as string) ?? "Client" }));
  const schedules = (scheduleRows ?? []) as { id: string; client_id: string | null; frequency: string; next_run_at: string; clients: JoinedName }[];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink-900">Reports</h1>
          <p className="text-sm text-ink-500">Every report you&apos;ve generated, ready to view, download or share.</p>
        </div>
        <Button asChild variant="outline">
          <Link href="/dashboard/reports/preview"><Eye size={16} aria-hidden /> See a sample report</Link>
        </Button>
      </div>

      {/* Scheduled deliveries — the automation is invisible if it only lives on
          individual client pages, so what's queued surfaces here too. */}
      {schedules.length > 0 && (
        <Card>
          <CardContent className="p-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <p className="flex items-center gap-2 text-sm font-semibold text-ink-800">
                <CalendarClock size={15} className="text-amber-500" aria-hidden /> Scheduled deliveries
              </p>
              <Badge variant="muted">{schedules.length} active</Badge>
            </div>
            <ul className="grid gap-2 sm:grid-cols-2">
              {schedules.map((s) => (
                <li key={s.id}>
                  <Link
                    href={s.client_id ? `/dashboard/clients/${s.client_id}` : "/dashboard/clients"}
                    className="flex items-center justify-between gap-3 rounded-xl border border-ink-100 bg-surface-muted/40 px-3.5 py-2.5 transition-colors hover:bg-surface-muted"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-ink-800">{nameOf(s.clients)}</p>
                      <p className="text-xs text-ink-500">
                        <span className="capitalize">{s.frequency}</span> · next {format(new Date(s.next_run_at), "d MMM, HH:mm")} UTC
                      </p>
                    </div>
                    <Send size={14} className="shrink-0 text-ink-400" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
            <Link href="/dashboard/clients" className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:gap-1.5">
              Manage schedules <ArrowRight size={12} aria-hidden />
            </Link>
          </CardContent>
        </Card>
      )}

      <ReportsBrowser initialRows={rows} initialHasMore={hasMore} clients={clients} hasAny={rows.length > 0} />
    </div>
  );
}
