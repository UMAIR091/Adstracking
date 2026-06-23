import Link from "next/link";
import { redirect } from "next/navigation";
import { format } from "date-fns";
import { FileBarChart2, Eye } from "lucide-react";
import { getCurrentUserAndAgency } from "@/lib/agency";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/EmptyState";

export const dynamic = "force-dynamic";

export default async function ReportsPage() {
  const { user } = await getCurrentUserAndAgency();
  if (!user) redirect("/login");

  const supabase = createClient();
  const { data: reports } = await supabase
    .from("reports")
    .select("id, title, status, period_end, created_at, clients(name)")
    .order("created_at", { ascending: false });

  const list = reports ?? [];

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

      {list.length === 0 ? (
        <EmptyState
          icon={FileBarChart2}
          title="No reports yet"
          description="Open a client with Search Console connected and generate your first report — or preview what one looks like."
          action={<Button asChild><Link href="/dashboard/clients">Go to clients</Link></Button>}
        />
      ) : (
        <div className="space-y-3">
          {list.map((r) => {
            const c = r.clients as unknown as { name: string | null } | { name: string | null }[] | null;
            const cname = (Array.isArray(c) ? c[0]?.name : c?.name) ?? "Client";
            return (
            <Card key={r.id} className="transition-all hover:-translate-y-0.5 hover:shadow-md">
              <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                    <FileBarChart2 size={18} />
                  </div>
                  <div>
                    <p className="font-medium text-ink-900">{r.title}</p>
                    <p className="text-xs text-ink-500">
                      {cname} · {format(new Date(r.created_at as string), "MMM d, yyyy")}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Badge variant={r.status === "ready" ? "success" : "muted"}>{r.status}</Badge>
                  <Button asChild variant="outline" size="sm">
                    <Link href={`/dashboard/reports/${r.id}`}>View</Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
