import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { format } from "date-fns";
import { FileText } from "lucide-react";
import { getCurrentUserAndAgency } from "@/lib/agency";
import { createClient } from "@/lib/supabase/server";
import { ClientSection } from "@/components/ClientSection";
import { BrandingNotice } from "@/components/BrandingNotice";
import { NewReportButton } from "@/components/GenerateReportDialog";
import { StatusChip, StatusDot, type StatusTone } from "@/components/ui/status-chip";
import { loadClientWorkspace } from "@/lib/clients/workspace";
import { reportTypeLabel } from "@/lib/reports/types";

export const dynamic = "force-dynamic";

// Reports — this client's reports and whether each reached the client.
// Generating opens the shared "New report" dialog (components/
// GenerateReportDialog) with this client selected: the same types, periods,
// titles and generation call the in-page form used. The full management
// surface (search, filters, bulk actions) stays at /dashboard/reports.
export default async function ClientReportsPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
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

  // The latest delivery attempt per report, newest first.
  const ids = rows.map((r) => r.id);
  const { data: emails } = ids.length
    ? await supabase.from("email_logs").select("report_id, to_email, status, sent_at").in("report_id", ids).order("sent_at", { ascending: false })
    : { data: [] };
  const lastEmail = new Map<string, { to_email: string; status: string; sent_at: string }>();
  for (const e of (emails ?? []) as { report_id: string; to_email: string; status: string; sent_at: string }[]) {
    if (!lastEmail.has(e.report_id)) lastEmail.set(e.report_id, e);
  }
  const delivery = (id: string): { tone: StatusTone; text: string } => {
    const e = lastEmail.get(id);
    if (!e) return { tone: "muted", text: "Not sent yet" };
    if (e.status === "failed" || e.status === "bounced") return { tone: "danger", text: `${e.status === "bounced" ? "Bounced" : "Failed"} · ${e.to_email}` };
    if (e.status === "pending") return { tone: "info", text: `Sending to ${e.to_email}` };
    return { tone: "success", text: `Sent to ${e.to_email} · ${format(new Date(e.sent_at), "d MMM")}` };
  };

  return (
    <ClientSection
      title="Reports"
      description="Every report for this client, and whether it reached them."
      action={
        ws.hasSyncedData ? (
          <NewReportButton clientId={client.id as string}>Generate report</NewReportButton>
        ) : undefined
      }
    >
      <div className="flex flex-col gap-4">
        <BrandingNotice hasLogo={!!agency.logo_url} />

        {!ws.hasSyncedData && (
          <p className="rounded-card border border-ink-200 bg-surface px-[18px] py-4 text-[13.5px] text-ink-500">
            {ws.dataBlockedReason ?? "Connect a data source to generate reports."}{" "}
            <Link href={`/dashboard/clients/${client.id}/data-sources`} className="font-medium text-brand-600 hover:text-ink-900">
              Go to data sources →
            </Link>
          </p>
        )}

        <section aria-label="Reports for this client" className="overflow-hidden rounded-card border border-ink-200 bg-surface">
          {rows.length === 0 ? (
            <p className="px-[18px] py-[22px] text-[13.5px] text-ink-500">
              No reports for this client yet. Generate the first one and it will be listed here with everything sent since.
            </p>
          ) : (
            <ul>
              {rows.map((r, i) => {
                const type = reportTypeLabel(r.meta?.reportType);
                const d = delivery(r.id);
                return (
                  <li key={r.id} className={`relative flex flex-wrap items-center gap-x-3.5 gap-y-1.5 px-[18px] py-3.5 transition-colors hover:bg-ink-50 ${i ? "border-t border-ink-100" : ""}`}>
                    <span aria-hidden className="hidden h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-muted text-ink-500 sm:flex">
                      <FileText size={15} />
                    </span>
                    <div className="min-w-[200px] flex-1">
                      <Link href={`/dashboard/reports/${r.id}`} className="block truncate text-sm font-medium text-ink-900 after:absolute after:inset-0 after:content-['']">
                        {r.title}
                      </Link>
                      <span className="block truncate text-[12.5px] text-ink-400">
                        {type ? `${type} · ` : ""}
                        {r.period_start && r.period_end
                          ? `${format(new Date(r.period_start), "d MMM")} – ${format(new Date(r.period_end), "d MMM yyyy")}`
                          : format(new Date(r.created_at), "d MMM yyyy")}
                      </span>
                    </div>
                    <span className="flex min-w-0 items-center gap-2 text-[12.5px] text-ink-500">
                      <StatusDot tone={d.tone} />
                      <span className={`truncate ${d.tone === "danger" ? "text-danger-700" : ""}`}>{d.text}</span>
                    </span>
                    <StatusChip tone={r.status === "ready" ? "success" : "muted"} className="capitalize">{r.status ?? "draft"}</StatusChip>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {rows.length > 0 && (
          <p className="text-xs text-ink-500">
            <Link href="/dashboard/reports" className="font-medium text-brand-600 hover:text-ink-900">All reports</Link>{" "}
            for searching, filtering and bulk actions.
          </p>
        )}
      </div>
    </ClientSection>
  );
}
