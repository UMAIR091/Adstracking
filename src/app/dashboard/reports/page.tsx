import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus } from "lucide-react";
import { getCurrentUserAndAgency } from "@/lib/agency";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { ReportsBrowser, type ReportRow, type ClientOption } from "@/components/ReportsBrowser";
import { UpNext } from "@/components/dashboard/NextScheduled";
import { NewReportButton } from "@/components/GenerateReportDialog";

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
      .select("id, title, status, period_start, period_end, created_at, share_token, meta:data->meta, clients(name)")
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
  const deliveries = new Map<string, { sent: number; failed: number; lastTo: string | null; lastAt: string | null }>();
  if (ids.length) {
    // Newest first, so the first successful send per report is its latest.
    const { data: logs } = await supabase
      .from("email_logs")
      .select("report_id, status, to_email, sent_at")
      .in("report_id", ids)
      .order("sent_at", { ascending: false });
    for (const l of logs ?? []) {
      const key = l.report_id as string;
      const e = deliveries.get(key) ?? { sent: 0, failed: 0, lastTo: null, lastAt: null };
      if (l.status === "failed" || l.status === "bounced") e.failed++;
      else if (l.status !== "pending") {
        e.sent++;
        if (!e.lastTo) { e.lastTo = (l.to_email as string) ?? null; e.lastAt = (l.sent_at as string) ?? null; }
      }
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
      // Small jsonb projection, not the whole report payload.
      reportType: (r.meta as { reportType?: string } | null)?.reportType ?? null,
      sourceIds: (r.meta as { sourceIds?: string[] } | null)?.sourceIds ?? null,
      sentCount: d?.sent ?? 0,
      failedCount: d?.failed ?? 0,
      lastTo: d?.lastTo ?? null,
      lastAt: d?.lastAt ?? null,
    };
  });

  const clients: ClientOption[] = (clientRows ?? []).map((c) => ({ id: c.id as string, name: (c.name as string) ?? "Client" }));
  const schedules = (scheduleRows ?? []) as { id: string; client_id: string | null; frequency: string; next_run_at: string; clients: JoinedName }[];

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[clamp(24px,3vw,28px)] font-semibold tracking-[-0.03em] text-ink-900">Reports</h1>
          <p className="mt-1 text-[14.5px] text-ink-500">
            {rows.length > 0 ? "Every report generated, and whether it reached the client." : "Nothing generated yet"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild variant="outline">
            <Link href="/dashboard/reports/preview">Sample report</Link>
          </Button>
          <NewReportButton>
            <Plus size={15} strokeWidth={2.2} aria-hidden /> New report
          </NewReportButton>
        </div>
      </div>

      <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0">
          <ReportsBrowser initialRows={rows} initialHasMore={hasMore} clients={clients} hasAny={rows.length > 0} />
        </div>
        {/* Scheduled deliveries — the automation is invisible if it only lives
            on individual client pages, so what's queued surfaces here too. */}
        {schedules.length > 0 && (
          <UpNext
            items={schedules.map((s) => ({
              id: s.id,
              clientId: s.client_id,
              clientName: nameOf(s.clients),
              frequency: s.frequency,
              nextRunAt: s.next_run_at,
            }))}
          />
        )}
      </div>
    </div>
  );
}
