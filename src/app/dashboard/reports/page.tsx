import Link from "next/link";
import { redirect } from "next/navigation";
import { Eye } from "lucide-react";
import { getCurrentUserAndAgency } from "@/lib/agency";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { ReportsBrowser, type ReportRow } from "@/components/ReportsBrowser";

export const dynamic = "force-dynamic";

export default async function ReportsPage() {
  const { user } = await getCurrentUserAndAgency();
  if (!user) redirect("/login");

  const supabase = createClient();
  const { data: reports } = await supabase
    .from("reports")
    .select("id, title, status, period_start, period_end, created_at, share_token, clients(name)")
    .order("created_at", { ascending: false });

  const rows: ReportRow[] = (reports ?? []).map((r) => {
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

      <ReportsBrowser reports={rows} />
    </div>
  );
}
