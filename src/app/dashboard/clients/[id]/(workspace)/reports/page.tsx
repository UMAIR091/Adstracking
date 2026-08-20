import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { FileText } from "lucide-react";
import { format } from "date-fns";
import { getCurrentUserAndAgency } from "@/lib/agency";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ClientSection } from "@/components/ClientSection";
import { GenerateReport } from "@/components/GenerateReport";
import { BrandingNotice } from "@/components/BrandingNotice";
import { loadClientWorkspace } from "@/lib/clients/workspace";
import { reportTypeLabel } from "@/lib/reports/types";

export const dynamic = "force-dynamic";

// Reports — generate one, and manage the ones already made.
//
// Those are the two jobs, so they sit side by side rather than stacked: the
// generator no longer scrolls a screen of history out of view, and the history
// no longer requires scrolling past the whole form to reach. GenerateReport is
// the same component with the same props — types, periods, titles, the sample
// preview and the generation call are all untouched.
//
// The full management surface (search, filters, bulk actions) stays where it
// is, at /dashboard/reports; this rail is this client's own rows.
export default async function ClientReportsPage({ params }: { params: { id: string } }) {
  const { user, agency } = await getCurrentUserAndAgency();
  if (!user || !agency) redirect("/login");

  const supabase = createClient();
  const { data: client } = await supabase
    .from("clients")
    .select("id, name")
    .eq("id", params.id)
    .maybeSingle();
  if (!client) notFound();

  const ws = await loadClientWorkspace(supabase, client.id as string);

  const { data: reports } = await supabase
    .from("reports")
    .select("id, title, status, period_start, period_end, created_at, meta:data->meta")
    .eq("client_id", client.id)
    .order("created_at", { ascending: false })
    .limit(10);

  type Row = {
    id: string;
    title: string;
    status: string | null;
    period_start: string | null;
    period_end: string | null;
    created_at: string;
    meta: { reportType?: string } | null;
  };
  const rows = (reports ?? []) as unknown as Row[];

  return (
    <ClientSection
      title="Reports"
      description="Build a branded report from this client's synced data, or revisit one you've already made."
    >
      <BrandingNotice hasLogo={!!agency.logo_url} />

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Generating is the primary job, so it takes the width and keeps its
            own heading — the section header above names the area, not the
            action. */}
        <div className="lg:col-span-2">
          <GenerateReport
            clientId={client.id as string}
            clientName={client.name as string}
            // Only sources with a synced snapshot actually feed the report, so
            // those are what the type is inferred from and what's listed.
            sources={ws.integrations.filter((i) => i.snapshot).map((i) => ({ id: i.def.id, name: i.def.name }))}
            ready={ws.hasSyncedData}
            blockedReason={ws.dataBlockedReason}
          />
        </div>

        <Card className="h-full">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Report history</CardTitle>
            <CardDescription className="text-xs">
              {rows.length === 0
                ? "Reports for this client appear here."
                : `${rows.length === 10 ? "Latest 10" : rows.length} for this client.`}
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            {rows.length === 0 ? (
              <div className="rounded-xl border border-dashed border-ink-200 px-4 py-8 text-center">
                <p className="text-sm font-medium text-ink-800">No reports yet</p>
                <p className="mt-1 text-xs leading-relaxed text-ink-500">
                  Generate the first one and it will be listed here with everything sent since.
                </p>
              </div>
            ) : (
              <ul className="-mx-2 divide-y divide-ink-100">
                {rows.map((r) => {
                  const type = reportTypeLabel(r.meta?.reportType);
                  return (
                    <li key={r.id}>
                      <Link
                        href={`/dashboard/reports/${r.id}`}
                        className="flex items-start gap-2.5 rounded-lg px-2 py-2.5 transition-colors hover:bg-surface-subtle"
                      >
                        <FileText size={15} className="mt-0.5 shrink-0 text-ink-400" aria-hidden />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-ink-900">{r.title}</span>
                          <span className="mt-0.5 block truncate text-xs text-ink-500">
                            {type ? `${type} · ` : ""}
                            {r.period_start && r.period_end
                              ? `${format(new Date(r.period_start), "d MMM")} – ${format(new Date(r.period_end), "d MMM yyyy")}`
                              : format(new Date(r.created_at), "d MMM yyyy")}
                          </span>
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}

            {rows.length > 0 && (
              <p className="mt-3 border-t border-ink-100 pt-3 text-xs text-ink-500">
                <Link href="/dashboard/reports" className="font-medium text-brand-700 hover:underline">
                  All reports
                </Link>{" "}
                for searching, filtering and bulk actions.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </ClientSection>
  );
}
