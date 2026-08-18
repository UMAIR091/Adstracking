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
import { loadReportForRender } from "@/lib/reports/branding";

export const dynamic = "force-dynamic";

function pdfSlug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "report";
}

export default async function ReportViewPage({ params }: { params: { id: string } }) {
  const { user, agency } = await getCurrentUserAndAgency();
  if (!user || !agency) redirect("/login");

  const supabase = createClient();
  // Branding follows the report, not the session. Reading it from the
  // signed-in agency is what put one workspace's brand on another's report.
  const report = await loadReportForRender(supabase, { id: params.id }, agency.id);
  if (!report) notFound();

  // `created_at` isn't part of the render payload; read it alongside.
  const { data: meta } = await supabase
    .from("reports")
    .select("created_at")
    .eq("id", params.id)
    .maybeSingle();

  // Delivery history for THIS report — previously only visible on the client
  // page, which meant "did this one go out?" required leaving the report.
  const { data: logs } = await supabase
    .from("email_logs")
    .select("id, to_email, subject, status, sent_at, attempts, error")
    .eq("report_id", params.id)
    .order("sent_at", { ascending: false })
    .limit(20);

  const clientName = report.clientName;
  const clientEmail = report.clientEmail;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const shareUrl = `${appUrl}/r/${report.shareToken}`;

  const deliveryLogs = (logs ?? []) as DeliveryLog[];
  const sentCount = deliveryLogs.filter((l) => l.status !== "failed" && l.status !== "bounced" && l.status !== "pending").length;

  // space-y-6 matches the reports index and the sample-report page — the three
  // screens of the reporting flow were on three different vertical rhythms.
  return (
    <div className="space-y-6">
      <div className="no-print space-y-3">
        <Link href="/dashboard/reports" className="inline-flex items-center gap-1 text-sm text-ink-500 hover:text-ink-700">
          <ArrowLeft size={15} aria-hidden /> Back to reports
        </Link>

        {/* Context header: which report, for whom, covering what, and its
            state — so the toolbar isn't floating above an unlabelled page. */}
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-semibold tracking-tight text-ink-900">{report.title}</h1>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-ink-500">
              <span className="font-medium text-ink-700">{clientName}</span>
              {report.period.start && report.period.end && (
                <>· <span>{format(new Date(report.period.start), "d MMM")} – {format(new Date(report.period.end), "d MMM yyyy")}</span></>
              )}
              {meta?.created_at && <>· <span>created {format(new Date(meta.created_at as string), "d MMM yyyy")}</span></>}
              {sentCount > 0 && <>· <span>emailed {sentCount}×</span></>}
            </p>
          </div>
          {/* Ordered by how final the action is, primary last: rework the
              insights, take a copy, share the link, then send it to the
              client — which is the one filled button in the row. */}
          <div className="flex flex-wrap items-center gap-2">
            <RegenerateInsights reportId={report.id} />
            <DownloadPdf href={`/api/reports/${report.id}/pdf`} filename={`${pdfSlug(report.title)}.pdf`} />
            <ReportActions shareUrl={shareUrl} />
            <SendReport reportId={report.id} clientEmail={clientEmail} />
          </div>
        </div>
      </div>

      {/* AI analysis sits ABOVE the report document and is marked no-print:
          it's the agency's read of the data, not part of the client-facing
          deliverable, and it answers "what changed?" before they scroll. */}
      <AiAnalysisPanel data={report.data} />

      <ReportDocument
        branding={{ name: report.branding.name, logo_url: report.branding.logo_url, brand_color: report.branding.brand_color, website: report.branding.website, footer_text: report.branding.footer_text }}
        clientName={clientName}
        clientLogoUrl={report.clientLogoUrl}
        title={report.title}
        period={report.period}
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
