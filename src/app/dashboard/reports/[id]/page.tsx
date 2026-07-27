import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getCurrentUserAndAgency } from "@/lib/agency";
import { createClient } from "@/lib/supabase/server";
import { ReportDocument } from "@/components/ReportDocumentLazy";
import { ReportActions } from "@/components/ReportActions";
import { RegenerateInsights } from "@/components/RegenerateInsights";
import { SendReport } from "@/components/SendReport";
import { DownloadPdf } from "@/components/DownloadPdf";
import { AiAnalysisPanel } from "@/components/insights/AiAnalysisPanel";
import { DeliveryHistory, type DeliveryLog } from "@/components/DeliveryHistory";
import { format } from "date-fns";

export const dynamic = "force-dynamic";

function pdfSlug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "report";
}

export default async function ReportViewPage({ params }: { params: { id: string } }) {
  const { user, agency } = await getCurrentUserAndAgency();
  if (!user || !agency) redirect("/login");

  const supabase = createClient();
  const { data: report } = await supabase
    .from("reports")
    .select("id, client_id, title, status, period_start, period_end, data, share_token, created_at, clients(name, email)")
    .eq("id", params.id)
    .maybeSingle();
  if (!report) notFound();

  // Delivery history for THIS report — previously only visible on the client
  // page, which meant "did this one go out?" required leaving the report.
  const { data: logs } = await supabase
    .from("email_logs")
    .select("id, to_email, subject, status, sent_at, attempts, error")
    .eq("report_id", params.id)
    .order("sent_at", { ascending: false })
    .limit(20);

  const c = report.clients as unknown as { name: string | null; email: string | null } | { name: string | null; email: string | null }[] | null;
  const clientRow = Array.isArray(c) ? c[0] : c;
  const clientName = clientRow?.name ?? "Client";
  const clientEmail = clientRow?.email ?? null;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const shareUrl = `${appUrl}/r/${report.share_token}`;

  const deliveryLogs = (logs ?? []) as DeliveryLog[];
  const sentCount = deliveryLogs.filter((l) => l.status !== "failed" && l.status !== "bounced" && l.status !== "pending").length;

  return (
    <div className="space-y-5">
      <div className="no-print space-y-3">
        <Link href="/dashboard/reports" className="inline-flex items-center gap-1 text-sm text-ink-500 hover:text-ink-700">
          <ArrowLeft size={15} aria-hidden /> Back to reports
        </Link>

        {/* Context header: which report, for whom, covering what, and its
            state — so the toolbar isn't floating above an unlabelled page. */}
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <h1 className="truncate text-xl font-semibold tracking-tight text-ink-900">{report.title}</h1>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-ink-500">
              <span className="font-medium text-ink-700">{clientName}</span>
              {report.period_start && report.period_end && (
                <>· <span>{format(new Date(report.period_start as string), "d MMM")} – {format(new Date(report.period_end as string), "d MMM yyyy")}</span></>
              )}
              {report.created_at && <>· <span>created {format(new Date(report.created_at as string), "d MMM yyyy")}</span></>}
              {sentCount > 0 && <>· <span>emailed {sentCount}×</span></>}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <RegenerateInsights reportId={report.id as string} />
            <DownloadPdf href={`/api/reports/${report.id}/pdf`} filename={`${pdfSlug(report.title)}.pdf`} />
            <SendReport reportId={report.id as string} clientEmail={clientEmail} />
            <ReportActions shareUrl={shareUrl} />
          </div>
        </div>
      </div>

      {/* AI analysis sits ABOVE the report document and is marked no-print:
          it's the agency's read of the data, not part of the client-facing
          deliverable, and it answers "what changed?" before they scroll. */}
      <AiAnalysisPanel data={report.data} />

      <ReportDocument
        branding={{ name: agency.name, logo_url: agency.logo_url, brand_color: agency.brand_color, website: agency.website, footer_text: agency.footer_text }}
        clientName={clientName}
        title={report.title}
        period={{ start: report.period_start as string, end: report.period_end as string }}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        data={report.data as any}
      />

      {/* Anchor target for the "Delivery history" action in the reports list. */}
      <div id="delivery" className="no-print scroll-mt-6">
        <DeliveryHistory logs={deliveryLogs} />
      </div>
    </div>
  );
}
