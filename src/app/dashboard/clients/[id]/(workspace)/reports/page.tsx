import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { FileText } from "lucide-react";
import { format } from "date-fns";
import { getCurrentUserAndAgency } from "@/lib/agency";
import { createClient } from "@/lib/supabase/server";
import { ClientSection } from "@/components/ClientSection";
import { GenerateReport } from "@/components/GenerateReport";
import { BrandingNotice } from "@/components/BrandingNotice";
import { loadClientWorkspace } from "@/lib/clients/workspace";
import { reportTypeLabel } from "@/lib/reports/types";

export const dynamic = "force-dynamic";

// Reports — generation, and this client's history in one place.
//
// GenerateReport is the same component with the same props the client page
// passed it. The history beneath is this client's own rows, linking into the
// existing report view; the full management surface (search, filters, bulk
// actions) stays where it is, at /dashboard/reports.
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
    <div>
      <ClientSection title="Generate a report" description="Built from this client's synced data.">
        <BrandingNotice hasLogo={!!agency.logo_url} />
        <GenerateReport
          clientId={client.id as string}
          clientName={client.name as string}
          // Only sources with a synced snapshot actually feed the report, so
          // those are what the type is inferred from and what's listed.
          sources={ws.integrations.filter((i) => i.snapshot).map((i) => ({ id: i.def.id, name: i.def.name }))}
          ready={ws.hasSyncedData}
          blockedReason={ws.dataBlockedReason}
        />
      </ClientSection>

      <ClientSection
        title="Report history"
        description={rows.length === 0 ? "Reports for this client appear here." : `${rows.length === 10 ? "Latest 10" : rows.length} for this client.`}
      >
        {rows.length === 0 ? (
          <div className="rounded-xl border border-dashed border-ink-300 bg-surface-subtle px-6 py-10 text-center">
            <p className="text-sm font-medium text-ink-800">No reports yet</p>
            <p className="mx-auto mt-1.5 max-w-md text-sm leading-relaxed text-ink-500">
              Generate the first one above — it will be listed here with everything sent since.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
            {rows.map((r) => {
              const type = reportTypeLabel(r.meta?.reportType);
              return (
                <li key={r.id}>
                  <Link
                    href={`/dashboard/reports/${r.id}`}
                    className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-subtle"
                  >
                    <FileText size={16} className="shrink-0 text-ink-400" aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-ink-900">{r.title}</span>
                      <span className="mt-0.5 block text-xs text-ink-500">
                        {type ? `${type} · ` : ""}
                        {r.period_start && r.period_end
                          ? `${format(new Date(r.period_start), "d MMM")} – ${format(new Date(r.period_end), "d MMM yyyy")} · `
                          : ""}
                        created {format(new Date(r.created_at), "d MMM yyyy")}
                      </span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}

        {rows.length > 0 && (
          <p className="mt-3 text-xs text-ink-500">
            <Link href="/dashboard/reports" className="text-brand-700 hover:underline">
              All reports
            </Link>{" "}
            for searching, filtering and bulk actions.
          </p>
        )}
      </ClientSection>
    </div>
  );
}
