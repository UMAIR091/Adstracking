import Link from "next/link";
import { redirect } from "next/navigation";
import { Eye } from "lucide-react";
import { getCurrentUserAndAgency } from "@/lib/agency";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { ReportsBrowser, type ReportRow, type ClientOption } from "@/components/ReportsBrowser";

export const dynamic = "force-dynamic";

const PAGE = 20;

export default async function ReportsPage() {
  const { user } = await getCurrentUserAndAgency();
  if (!user) redirect("/login");

  const supabase = createClient();
  // First page only (perf audit P1) + the client list for the filter dropdown.
  // Fetch one extra row to know whether a "Load more" is needed.
  const [{ data: reports }, { data: clientRows }] = await Promise.all([
    supabase
      .from("reports")
      .select("id, title, status, period_start, period_end, created_at, share_token, clients(name)")
      .order("created_at", { ascending: false })
      .range(0, PAGE),
    supabase.from("clients").select("id, name").eq("archived", false).order("name"),
  ]);

  const all = reports ?? [];
  const hasMore = all.length > PAGE;
  const rows: ReportRow[] = all.slice(0, PAGE).map((r) => {
    const c = r.clients as unknown as { name: string | null } | { name: string | null }[] | null;
    return {
      id: r.id as string,
      title: r.title as string,
      status: r.status as string,
      period_start: (r.period_start as string | null) ?? null,
      period_end: (r.period_end as string | null) ?? null,
      created_at: r.created_at as string,
      share_token: (r.share_token as string | null) ?? null,
      clientName: (Array.isArray(c) ? c[0]?.name : c?.name) ?? "Client",
    };
  });
  const clients: ClientOption[] = (clientRows ?? []).map((c) => ({ id: c.id as string, name: (c.name as string) ?? "Client" }));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink-900">Reports</h1>
          <p className="text-sm text-ink-500">Every report you&apos;ve generated, ready to view, download or share.</p>
        </div>
        <Button asChild variant="outline">
          <Link href="/dashboard/reports/preview"><Eye size={16} /> See a sample report</Link>
        </Button>
      </div>

      <ReportsBrowser initialRows={rows} initialHasMore={hasMore} clients={clients} hasAny={rows.length > 0} />
    </div>
  );
}
